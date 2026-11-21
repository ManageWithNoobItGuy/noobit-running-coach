#!/usr/bin/env node
// One-command Cloudflare setup for noobit-running-coach, done entirely through Wrangler.
// Safe to re-run: every step checks what already exists first.
//
//   npm run cf:setup -- [--account-id <id>] [--subdomain <name>] [--rotate-token] [--reuse-existing] [--dry-run]
//
// Steps: logged in? → pick account (writes account_id) → workers.dev subdomain → D1 database (find or create,
// writes database_id) → migrations --remote → deploy → INGEST_TOKEN secret (.secrets/ingest-token.txt) → live check.
//
// Progress goes to stderr; one JSON result goes to stdout. The token is never printed.
// Exit codes: 0 ready · 1 error · 2 choose an account (pass --account-id) · 3 email not verified / permission · 4 not logged in
//             5 a database with this name already exists on a fresh clone (ask the user; --reuse-existing or rename)
//
// Needs: `npx wrangler login` done once (the user clicks Allow in the browser).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const CONFIG = "wrangler.jsonc";
const TOKEN_FILE = join(".secrets", "ingest-token.txt");
const WIN = process.platform === "win32";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  args[a.slice(2)] = next && !next.startsWith("--") ? process.argv[++i] : true;
}
const DRY = Boolean(args["dry-run"]);
const result = { status: "error", dry_run: DRY, steps: [] };

const log = (msg) => process.stderr.write(msg + "\n");
const step = (name, detail) => { result.steps.push({ step: name, detail }); log(`✅ ${name}: ${detail}`); };
function finish(status, code, extra = {}) {
  Object.assign(result, { status }, extra);
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
}

function wrangler(argv, { input, quiet } = {}) {
  const r = spawnSync(WIN ? "npx.cmd" : "npx", ["wrangler", ...argv], {
    encoding: "utf8", input, shell: WIN, maxBuffer: 64 * 1024 * 1024,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  const out = (r.stdout || "") + (r.stderr || "");
  if (!quiet && r.status !== 0) log(out.trim().split("\n").slice(-15).join("\n"));
  return { ok: r.status === 0, stdout: r.stdout || "", out };
}
function jsonFrom(text) {
  const s = text.search(/[[{]/);
  const e = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return JSON.parse(text.slice(s, e + 1));
}

let config = readFileSync(CONFIG, "utf8");
const cfg = (re) => (config.match(re) || [])[1] || null;
const WORKER = cfg(/"name"\s*:\s*"([^"]+)"/);
const DB_NAME = cfg(/"database_name"\s*:\s*"([^"]+)"/);
function setConfig(key, value) {
  const re = new RegExp(`"${key}"\\s*:\\s*"[^"]*"`);
  if (re.test(config)) config = config.replace(re, `"${key}": "${value}"`);
  else if (key === "account_id") config = config.replace(/("name"\s*:\s*"[^"]+",\n)/, `$1  "account_id": "${value}",\n`);
  else throw new Error(`cannot place ${key} in ${CONFIG}`);
  if (!DRY) writeFileSync(CONFIG, config);
}

// 1. Logged in?
const who = wrangler(["whoami", "--json"], { quiet: true });
let me;
try { me = jsonFrom(who.stdout); } catch { me = null; }
if (!who.ok || !me?.loggedIn) finish("not-logged-in", 4, { hint: "Run `npx wrangler login` (or `npx wrangler login --device`) and have the user click Allow, then re-run." });
step("login", `logged in (${me.authType})`);

// 2. Account
const accounts = (me.accounts || []).map((a) => ({ id: a.id, name: a.name }));
let accountId = args["account-id"] || process.env.CLOUDFLARE_ACCOUNT_ID || cfg(/"account_id"\s*:\s*"([0-9a-f]{32})"/);
if (accountId && accounts.length && !accounts.some((a) => a.id === accountId)) {
  finish("choose-account", 2, { accounts, hint: `account_id ${accountId} is not one of this login's accounts` });
}
if (!accountId) {
  if (accounts.length === 1) accountId = accounts[0].id;
  else finish("choose-account", 2, { accounts, hint: "Ask the user which account, then re-run with --account-id <id>." });
}
setConfig("account_id", accountId);
const accountName = accounts.find((a) => a.id === accountId)?.name || null;
process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
result.account = { id: accountId, name: accountName };
step("account", `${accountName || accountId}${DRY ? "" : " (saved to wrangler.jsonc)"}`);

// 3. workers.dev subdomain (brand-new accounts have none; the first deploy would stop at a question)
{
  const ensure = ["scripts/cf/ensure-workers-subdomain.mjs", "--account-id", accountId];
  if (args.subdomain) ensure.push("--name", String(args.subdomain));
  if (DRY) ensure.push("--check-only");
  const r = spawnSync(process.execPath, ensure, { encoding: "utf8" });
  let sub;
  try { sub = jsonFrom(r.stdout); } catch { sub = { status: "error", raw: r.stdout + r.stderr }; }
  if (r.status !== 0) finish(sub.reason || sub.status || "subdomain-error", r.status || 1, { subdomain: sub });
  result.subdomain = sub.subdomain || null;
  step("workers.dev", `${sub.status}: ${sub.subdomain || "(none yet)"}`);
}

// 4. D1 database: keep a valid id, else reuse one with the same name, else create it
{
  const list = wrangler(["d1", "list", "--json"]);
  if (!list.ok) finish("d1-list-failed", 1);
  const dbs = jsonFrom(list.stdout);
  const current = cfg(/"database_id"\s*:\s*"([^"]*)"/);
  const fresh = !current || current.startsWith("REPLACE_");
  const sameName = dbs.find((d) => d.name === DB_NAME);
  if (fresh && sameName && !args["reuse-existing"]) {
    finish("existing-database", 5, { database: { name: sameName.name, id: sameName.uuid },
      hint: `This account already has a D1 database named ${DB_NAME} (and probably a Worker named ${WORKER}). ` +
        "Ask the user: reuse it (re-run with --reuse-existing; the site would be deployed over the existing Worker), " +
        "or install a second copy (change \"name\" and \"database_name\" in wrangler.jsonc, then re-run)." });
  }
  let db = dbs.find((d) => d.uuid === current) || sameName;
  if (!db) {
    if (DRY) { step("d1", `would create ${DB_NAME}`); }
    else {
      const c = wrangler(["d1", "create", DB_NAME]);
      if (!c.ok) finish("d1-create-failed", 1);
      db = jsonFrom(wrangler(["d1", "list", "--json"]).stdout).find((d) => d.name === DB_NAME);
      if (!db) finish("d1-create-failed", 1, { hint: "created but not found in d1 list" });
      step("d1", `created ${DB_NAME}`);
    }
  } else {
    step("d1", `using existing ${db.name}`);
  }
  if (db) {
    if (db.uuid !== current) setConfig("database_id", db.uuid);
    result.database = { name: db.name, id: db.uuid };
  }
}

// 5. Tables
if (DRY) step("migrations", "would apply migrations/ to the remote database");
else {
  const m = wrangler(["d1", "migrations", "apply", DB_NAME, "--remote"]);
  if (!m.ok) finish("migrations-failed", 1);
  const t = wrangler(["d1", "execute", DB_NAME, "--remote", "--json", "--command",
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'"]);
  step("migrations", t.ok ? `${jsonFrom(t.stdout)[0].results[0].n} tables` : "applied");
}

// 6. Deploy
if (DRY) {
  const d = wrangler(["deploy", "--dry-run"]);
  if (!d.ok) finish("deploy-dry-run-failed", 1);
  step("deploy", "dry run OK (nothing uploaded)");
  finish("dry-run-ok", 0, { worker: WORKER, would_be_url: result.subdomain ? `https://${WORKER}.${result.subdomain}` : null });
}
const dep = wrangler(["deploy"]);
if (!dep.ok) {
  const hint = /subdomain|10007|onboarding/i.test(dep.out) ? "workers.dev subdomain missing: re-run, or run scripts/cf/ensure-workers-subdomain.mjs" : undefined;
  finish("deploy-failed", 1, { hint });
}
const url = (dep.out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i) || [])[0] || (result.subdomain ? `https://${WORKER}.${result.subdomain}` : null);
result.site_url = url;
step("deploy", url || "deployed (URL not found in output)");

// 7. Ingest token (protects every write; the Shortcuts send it as a bearer token)
{
  let fresh = false;
  if (!existsSync(TOKEN_FILE) || args["rotate-token"]) {
    mkdirSync(".secrets", { recursive: true });
    try { chmodSync(".secrets", 0o700); } catch {}
    writeFileSync(TOKEN_FILE, randomBytes(24).toString("hex") + "\n", { mode: 0o600 });
    fresh = true;
  }
  const token = readFileSync(TOKEN_FILE, "utf8").trim();
  const sl = wrangler(["secret", "list", "--format", "json"], { quiet: true });
  let has = false;
  try { has = jsonFrom(sl.stdout).some((s) => s.name === "INGEST_TOKEN"); } catch {}
  if (fresh || !has) {
    const p = wrangler(["secret", "put", "INGEST_TOKEN"], { input: token + "\n" });
    if (!p.ok) finish("secret-put-failed", 1);
  }
  result.token_file = TOKEN_FILE;
  step("token", `${fresh ? "new token" : "existing token"} in ${TOKEN_FILE}${fresh || !has ? ", uploaded as INGEST_TOKEN" : ", secret already set"}`);
}

// 8. Live check (a brand-new workers.dev name can take a minute or two)
if (url) {
  let live = null;
  for (let i = 0; i < 24 && !live?.configured; i++) {
    if (i) await new Promise((res) => setTimeout(res, 5000));
    try {
      const r = await fetch(`${url}/api/ingest/status`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) live = await r.json();
    } catch {}
  }
  if (!live) finish("deployed-not-answering-yet", 0, { hint: "Wait a minute and open the site_url; new subdomains take time." });
  step("live", `site answers, token configured: ${live.configured}`);
}
finish("ready", 0);
