// Strava sync: OAuth connect, webhook events, and periodic/manual sync into D1.
// Docs: https://developers.strava.com/docs/

export interface StravaEnv {
  DB: D1Database;
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  STRAVA_ATHLETE_ID?: string; // optional hard lock to one Strava account
  STRAVA_API_BASE?: string; // override for local tests
}

type Row = Record<string, any>;

const OAUTH = "https://www.strava.com/oauth";
const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const STRENGTH_TYPES = new Set(["WeightTraining", "Workout", "Crossfit", "HighIntensityIntervalTraining", "Pilates", "Yoga"]);
const RUN_KINDS = ["easy", "runwalk", "long", "strides", "tempo", "interval", "test", "race", "recovery"];
const MANUAL_SYNC_COOLDOWN_S = 60;

const apiBase = (env: StravaEnv) => env.STRAVA_API_BASE || "https://www.strava.com/api/v3";
export const isConfigured = (env: StravaEnv) => Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET);

class RateLimited extends Error {}

// ---------- small helpers ----------

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes = 16): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#0b0f14;color:#eef3f6;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:440px;text-align:center}a{color:#d4ff3a}</style></head><body><main><h1>${title}</h1><p>${body}</p><p><a href="/">กลับหน้าแรก</a></p></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

const nowIso = () => new Date().toISOString();
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

async function getAuth(env: StravaEnv): Promise<Row | null> {
  return (await env.DB.prepare("SELECT * FROM strava_auth WHERE id = 1").first()) as Row | null;
}

// ---------- OAuth ----------

export async function connect(env: StravaEnv, origin: string): Promise<Response> {
  if (!isConfigured(env)) return page("ยังไม่ได้ตั้งค่า Strava", "ต้องใส่ Client ID และ Client Secret ของ Strava API ก่อน", 503);
  const ts = Date.now().toString();
  const state = `${ts}.${await hmacHex(env.STRAVA_CLIENT_SECRET!, ts)}`;
  const u = new URL(`${OAUTH}/authorize`);
  u.searchParams.set("client_id", env.STRAVA_CLIENT_ID!);
  u.searchParams.set("redirect_uri", `${origin}/strava/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("approval_prompt", "auto");
  u.searchParams.set("scope", "read,activity:read_all");
  u.searchParams.set("state", state);
  return Response.redirect(u.toString(), 302);
}

export async function callback(env: StravaEnv, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (!isConfigured(env)) return page("ยังไม่ได้ตั้งค่า Strava", "", 503);
  if (url.searchParams.get("error")) return page("ยกเลิกการเชื่อมต่อ", "ไม่ได้อนุญาตให้เข้าถึง Strava", 400);

  const [ts, sig] = (url.searchParams.get("state") || "").split(".");
  const fresh = ts && Date.now() - Number(ts) < 15 * 60_000;
  if (!fresh || sig !== (await hmacHex(env.STRAVA_CLIENT_SECRET!, ts))) return page("ลิงก์หมดอายุ", "ลองกดเชื่อมต่อ Strava ใหม่อีกครั้ง", 400);

  const scope = url.searchParams.get("scope") || "";
  if (!scope.includes("activity:read")) return page("สิทธิ์ไม่พอ", "ต้องติ๊กอนุญาตให้อ่านกิจกรรม (activities) ด้วย", 400);

  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code: url.searchParams.get("code"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return page("เชื่อมต่อไม่สำเร็จ", `Strava ตอบกลับ ${res.status}`, 502);
  const tok = (await res.json()) as Row;

  // Only one Strava account may own this journal.
  const existing = await getAuth(env);
  const owner = env.STRAVA_ATHLETE_ID ? Number(env.STRAVA_ATHLETE_ID) : existing?.athlete_id;
  if (owner && Number(owner) !== Number(tok.athlete.id)) return page("บัญชีไม่ตรง", "Journal นี้ผูกกับบัญชี Strava อื่นอยู่แล้ว", 403);

  const name = [tok.athlete.firstname, tok.athlete.lastname].filter(Boolean).join(" ");
  await env.DB.prepare(
    `INSERT INTO strava_auth (id, athlete_id, athlete_name, access_token, refresh_token, expires_at, scope)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET athlete_id = excluded.athlete_id, athlete_name = excluded.athlete_name,
       access_token = excluded.access_token, refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at, scope = excluded.scope`,
  ).bind(tok.athlete.id, name, tok.access_token, tok.refresh_token, tok.expires_at, scope).run();

  try {
    await ensureSubscription(env, url.origin);
  } catch (err) {
    console.error("webhook subscription failed", err);
  }
  ctx.waitUntil(sync(env, 8).catch((e) => console.error("initial sync", e)));
  return Response.redirect(`${url.origin}/#/runs`, 302);
}

async function accessToken(env: StravaEnv): Promise<string | null> {
  const auth = await getAuth(env);
  if (!auth?.refresh_token) return null;
  if (auth.expires_at && auth.expires_at > Date.now() / 1000 + 120) return auth.access_token;
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: auth.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const tok = (await res.json()) as Row;
  await env.DB.prepare("UPDATE strava_auth SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1")
    .bind(tok.access_token, tok.refresh_token, tok.expires_at).run();
  return tok.access_token;
}

async function apiGet(env: StravaEnv, token: string, path: string): Promise<any> {
  const res = await fetch(`${apiBase(env)}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new RateLimited("Strava rate limit");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Strava ${path} → ${res.status}`);
  return res.json();
}

// ---------- webhook ----------

async function ensureSubscription(env: StravaEnv, origin: string) {
  const callbackUrl = `${origin}/strava/webhook`;
  const qs = `client_id=${env.STRAVA_CLIENT_ID}&client_secret=${env.STRAVA_CLIENT_SECRET}`;
  const list = (await (await fetch(`${apiBase(env)}/push_subscriptions?${qs}`)).json()) as Row[];
  for (const sub of Array.isArray(list) ? list : []) {
    if (sub.callback_url === callbackUrl) {
      await env.DB.prepare("UPDATE strava_auth SET subscription_id = ? WHERE id = 1").bind(sub.id).run();
      return;
    }
    // Strava allows one subscription per app; replace a stale one.
    await fetch(`${apiBase(env)}/push_subscriptions/${sub.id}?${qs}`, { method: "DELETE" });
  }
  const verify = randomHex();
  await env.DB.prepare("UPDATE strava_auth SET verify_token = ? WHERE id = 1").bind(verify).run();
  const form = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID!,
    client_secret: env.STRAVA_CLIENT_SECRET!,
    callback_url: callbackUrl,
    verify_token: verify,
  });
  const res = await fetch(`${apiBase(env)}/push_subscriptions`, { method: "POST", body: form });
  const body = (await res.json()) as Row;
  if (!res.ok) throw new Error(`subscribe failed ${res.status}: ${JSON.stringify(body)}`);
  await env.DB.prepare("UPDATE strava_auth SET subscription_id = ? WHERE id = 1").bind(body.id).run();
}

export async function webhookVerify(env: StravaEnv, url: URL): Promise<Response> {
  const auth = await getAuth(env);
  const token = url.searchParams.get("hub.verify_token");
  if (!auth?.verify_token || token !== auth.verify_token) return new Response("forbidden", { status: 403 });
  return Response.json({ "hub.challenge": url.searchParams.get("hub.challenge") });
}

export async function webhookEvent(env: StravaEnv, req: Request, ctx: ExecutionContext): Promise<Response> {
  let ev: Row;
  try {
    ev = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const auth = await getAuth(env);
  if (!auth?.athlete_id || Number(ev.owner_id) !== Number(auth.athlete_id)) return new Response("ignored");

  if (ev.object_type === "activity") {
    if (ev.aspect_type === "delete") {
      ctx.waitUntil(env.DB.batch([
        env.DB.prepare("DELETE FROM runs WHERE strava_id = ?").bind(ev.object_id),
        env.DB.prepare("DELETE FROM other_activities WHERE strava_id = ?").bind(ev.object_id),
      ]));
    } else {
      ctx.waitUntil(
        (async () => {
          const token = await accessToken(env);
          if (token) await importActivity(env, token, ev.object_id);
          await env.DB.prepare("UPDATE strava_auth SET last_sync_at = ?, last_sync_note = ? WHERE id = 1")
            .bind(nowIso(), `webhook ${ev.aspect_type} ${ev.object_id}`).run();
        })().catch((e) => console.error("webhook import", e)),
      );
    }
  } else if (ev.object_type === "athlete" && ev.updates?.authorized === "false") {
    ctx.waitUntil(env.DB.prepare("UPDATE strava_auth SET access_token = NULL, refresh_token = NULL WHERE id = 1").run());
  }
  return new Response("ok");
}

// ---------- sync ----------

export async function status(env: StravaEnv) {
  const auth = await getAuth(env);
  return {
    configured: isConfigured(env),
    connected: Boolean(auth?.refresh_token),
    athlete_name: auth?.athlete_name ?? null,
    athlete_id: auth?.athlete_id ?? null,
    webhook: Boolean(auth?.subscription_id),
    backfill_done: Boolean(auth?.backfill_done),
    last_sync_at: auth?.last_sync_at ?? null,
    last_sync_note: auth?.last_sync_note ?? null,
  };
}

export async function manualSync(env: StravaEnv) {
  const auth = await getAuth(env);
  if (auth?.last_sync_at && Date.now() - Date.parse(auth.last_sync_at) < MANUAL_SYNC_COOLDOWN_S * 1000) {
    return { status: "cooldown", ...(await status(env)) };
  }
  return sync(env, 12);
}

/** Pull activities we have not stored yet. Imports at most `maxImports` runs per call. */
export async function sync(env: StravaEnv, maxImports = 12) {
  const token = await accessToken(env);
  if (!token) return { status: "not_connected" };
  const auth = (await getAuth(env))!;
  const fromRow = (await env.DB.prepare("SELECT value FROM profile WHERE key = 'strava_backfill_from'").first()) as Row | null;
  const backfillFrom = Date.parse(`${fromRow?.value || "2026-08-01"}T00:00:00+07:00`) / 1000;
  const after = auth.backfill_done ? Math.floor(Date.now() / 1000) - 14 * 86400 : backfillFrom;

  const activities: Row[] = [];
  for (let p = 1; p <= 5; p++) {
    const batch = (await apiGet(env, token, `/athlete/activities?after=${after}&per_page=100&page=${p}`)) as Row[] | null;
    if (!batch?.length) break;
    activities.push(...batch);
    if (batch.length < 100) break;
  }

  const known = new Set(
    ((await env.DB.prepare(
      "SELECT strava_id FROM runs WHERE strava_id IS NOT NULL UNION SELECT strava_id FROM other_activities",
    ).all()).results as Row[]).map((r) => Number(r.strava_id)),
  );
  const todo = activities.filter((a) => !known.has(Number(a.id))).sort((a, b) => a.start_date.localeCompare(b.start_date));

  let imported = 0;
  let runsImported = 0;
  let note = "";
  for (const a of todo) {
    const isRun = RUN_TYPES.has(a.sport_type || a.type);
    if (isRun && runsImported >= maxImports) break;
    try {
      if (isRun) {
        await importActivity(env, token, a.id);
        runsImported++;
      } else {
        await saveOther(env, a);
      }
      imported++;
    } catch (err) {
      if (err instanceof RateLimited) { note = "rate limited"; break; }
      console.error("import failed", a.id, err);
      note = `error on ${a.id}`;
    }
  }
  const remaining = todo.length - imported;
  const backfillDone = auth.backfill_done || remaining === 0 ? 1 : 0;
  note = note || `${imported} new, ${remaining} left`;
  await env.DB.prepare("UPDATE strava_auth SET last_sync_at = ?, last_sync_note = ?, backfill_done = ? WHERE id = 1")
    .bind(nowIso(), note, backfillDone).run();
  return { status: "ok", seen: activities.length, imported, remaining };
}

async function saveOther(env: StravaEnv, a: Row) {
  const date = String(a.start_date_local).slice(0, 10);
  const stmts = [
    env.DB.prepare(
      `INSERT OR REPLACE INTO other_activities (strava_id, activity_date, start_time, sport_type, name, moving_time_s, distance_km, avg_hr)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(a.id, date, String(a.start_date_local).slice(11, 16), a.sport_type || a.type, a.name ?? null, a.moving_time ?? null,
      a.distance ? round(a.distance / 1000, 2) : null, a.average_heartrate ? Math.round(a.average_heartrate) : null),
  ];
  if (STRENGTH_TYPES.has(a.sport_type || a.type)) {
    stmts.push(env.DB.prepare(
      "UPDATE planned_workouts SET status = 'done', updated_at = datetime('now') WHERE workout_date = ? AND kind = 'strength' AND status = 'planned'",
    ).bind(date));
  }
  await env.DB.batch(stmts);
}

async function importActivity(env: StravaEnv, token: string, id: number) {
  const a = (await apiGet(env, token, `/activities/${id}?include_all_efforts=false`)) as Row | null;
  if (!a) return;
  if (!RUN_TYPES.has(a.sport_type || a.type)) return saveOther(env, a);

  const date = String(a.start_date_local).slice(0, 10);
  const time = String(a.start_date_local).slice(11, 16);
  const km = round(a.distance / 1000, 2);

  const streams = (await apiGet(env, token, `/activities/${id}/streams?keys=time,distance,heartrate,velocity_smooth,cadence,altitude&key_by_type=true`)) as Row | null;
  const points = streams ? downsample(streams, 300) : null;
  const walkShare = streams?.velocity_smooth?.data ? walkingShare(streams.velocity_smooth.data) : 0;

  // Match an existing row: same Strava id, or a manually logged run on the same day with similar distance.
  let existing = (await env.DB.prepare("SELECT id, run_type FROM runs WHERE strava_id = ?").bind(id).first()) as Row | null;
  existing ??= (await env.DB.prepare(
    "SELECT id, run_type FROM runs WHERE strava_id IS NULL AND run_date = ? AND abs(distance_km - ?) < 0.3 ORDER BY abs(distance_km - ?) LIMIT 1",
  ).bind(date, km, km).first()) as Row | null;

  const planned = (await env.DB.prepare(
    `SELECT * FROM planned_workouts WHERE workout_date = ? AND kind IN (${RUN_KINDS.map(() => "?").join(",")})
     AND (run_id IS NULL ${existing ? "OR run_id = ?" : ""}) ORDER BY id LIMIT 1`,
  ).bind(date, ...RUN_KINDS, ...(existing ? [existing.id] : [])).first()) as Row | null;

  const runType = existing?.run_type || (a.workout_type === 1 ? "race" : planned?.kind && planned.kind !== "runwalk" ? planned.kind : walkShare > 0.08 ? "runwalk" : "easy");
  const values = {
    run_date: date,
    start_time: time,
    title: a.name ?? "Run",
    run_type: runType,
    distance_km: km,
    moving_time_s: a.moving_time,
    elapsed_time_s: a.elapsed_time ?? null,
    avg_pace_s: km > 0 ? Math.round(a.moving_time / km) : null,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    calories: a.calories ? Math.round(a.calories) : null,
    cadence_spm: a.average_cadence ? Math.round(a.average_cadence * 2) : null,
    elev_gain_m: a.total_elevation_gain ?? null,
    device: a.device_name ?? null,
    source: "strava",
    strava_id: id,
  };
  const cols = Object.keys(values);
  let runId: number;
  if (existing) {
    runId = existing.id;
    await env.DB.prepare(`UPDATE runs SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
      .bind(...Object.values(values), runId).run();
  } else {
    const r = await env.DB.prepare(`INSERT INTO runs (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING id`)
      .bind(...Object.values(values)).first() as Row;
    runId = r.id;
  }

  const stmts: D1PreparedStatement[] = [];
  const splits = ((a.splits_metric as Row[]) || []).filter((s) => s.distance >= 50);
  if (splits.length) {
    stmts.push(env.DB.prepare("DELETE FROM splits WHERE run_id = ?").bind(runId));
    for (const s of splits) {
      stmts.push(env.DB.prepare("INSERT INTO splits (run_id, split_no, distance_km, pace_s, avg_hr, elev_m) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(runId, s.split, round(s.distance / 1000, 2), Math.round(s.moving_time / (s.distance / 1000)),
          s.average_heartrate ? Math.round(s.average_heartrate) : null, s.elevation_difference ?? null));
    }
  }
  if (points) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO run_streams (run_id, points) VALUES (?, ?)").bind(runId, JSON.stringify(points)));
  if (planned && planned.run_id == null) {
    const st = !planned.target_km || km >= planned.target_km * 0.8 ? "done" : "partial";
    stmts.push(env.DB.prepare("UPDATE planned_workouts SET run_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?").bind(runId, st, planned.id));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

/** Share of samples slower than 11:00/km (walking). */
function walkingShare(v: number[]): number {
  if (!v.length) return 0;
  return v.filter((x) => x < 1000 / 660).length / v.length;
}

function downsample(s: Row, max: number) {
  const n = s.distance?.data?.length || s.time?.data?.length || 0;
  const step = Math.max(1, n / max);
  const pick = (key: string, f: (x: number) => number) => {
    const d = s[key]?.data as number[] | undefined;
    if (!d) return undefined;
    const out: number[] = [];
    for (let i = 0; i < n; i += step) out.push(f(d[Math.floor(i)]));
    return out;
  };
  return {
    d: pick("distance", (x) => round(x / 1000, 3)),
    t: pick("time", (x) => x),
    hr: pick("heartrate", (x) => x),
    v: pick("velocity_smooth", (x) => round(x, 2)),
    cad: pick("cadence", (x) => x * 2),
    alt: pick("altitude", (x) => round(x, 1)),
  };
}
