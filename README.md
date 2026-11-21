# noobit-running-coach 🏃

**เว็บแอปบันทึกการวิ่ง + โค้ช AI ส่วนตัว** สำหรับคนที่อยากซ้อมไปวิ่ง Half Marathon (หรือระยะไหนก็ได้)
ข้อมูลจาก Apple Watch ไหลเข้าเว็บเองทุกวันผ่าน iOS Shortcuts แล้ว AI Agent (เช่น Claude Code) อ่านข้อมูล
เขียนคำแนะนำในบทบาท "โค้ชแพร" และปรับแผนซ้อมให้ทุกวัน

- 📅 **วันนี้**: ความพร้อมของร่างกาย (HR พัก, HRV, การนอน), แผนซ้อมวันนี้พร้อมวิธีเตรียมตัว, streak ออกกำลังกายทุกวัน
- 🗺️ **แผน**: แผนรายสัปดาห์, เฟสการซ้อม, เป้าหมาย A/B/C, milestones, นับถอยหลังวันแข่ง
- 🏃 **วิ่ง**: บันทึกทุกรอบ, splits, กราฟเพซ/HR/cadence, เวลาในแต่ละโซนหัวใจ, สถิติและสถิติส่วนตัว
- 🏋️ **เวท**: โหมดเล่นตามแผนทีละเซ็ต (มีตัวจับเวลาพัก), คลังท่าพร้อมวิธีทำ, กราฟความก้าวหน้า
- 💤 **ร่างกาย**: กราฟ HR พัก / HRV / VO₂max / การนอน, หน้าวิเคราะห์การนอนรายคืนพร้อมคะแนน
- 💬 **โค้ช**: โน้ตจากโค้ช AI ทุกรอบวิ่ง ทุกการเล่นเวท และทุกเช้า

**Stack:** Cloudflare Workers + D1 (ฟรีสำหรับคนเดียวใช้) · หน้าเว็บ vanilla JS ไม่ต้อง build · iOS Shortcuts · Python scripts สำหรับนำเข้า Apple Health

> ⚠️ แอปนี้ออกแบบสำหรับ **ผู้ใช้ 1 คนต่อ 1 การติดตั้ง** (ไม่มีระบบสมาชิก) ใช้ภาษาไทย และเขตเวลา Asia/Bangkok
> คำแนะนำจากโค้ช AI ไม่ใช่คำแนะนำทางการแพทย์ เจ็บ ป่วย หรือมีโรคประจำตัว ปรึกษาแพทย์ก่อนเสมอ

---

## 🙋 สำหรับคน: ให้ AI Agent ติดตั้งให้

repo นี้ตั้งใจให้ **AI Agent เป็นคนติดตั้ง** คุณแค่ตอบคำถามและกดยืนยันในเบราว์เซอร์ตอนล็อกอินเท่านั้น

**สิ่งที่ต้องมี**
1. คอมพิวเตอร์ (แนะนำ **Mac** เพราะต้องใช้ทำไฟล์ Shortcut ให้ iPhone; Windows/Linux ใช้ได้แต่ต้องสร้าง Shortcut เองบน iPhone)
2. บัญชี [Cloudflare](https://dash.cloudflare.com/sign-up) (ฟรี) และบัญชี GitHub
3. AI Agent ที่รันคำสั่งบนเครื่องได้ เช่น [Claude Code](https://claude.com/claude-code) (แอป Claude desktop แท็บ Code หรือ CLI)
4. ถ้าอยากให้ข้อมูลไหลเข้าอัตโนมัติ: iPhone + Apple Watch

**วิธีเริ่ม**: เปิด AI Agent ในโฟลเดอร์ว่างๆ แล้วพิมพ์ข้อความนี้

```text
ช่วยติดตั้งระบบ noobit-running-coach จาก https://github.com/ManageWithNoobItGuy/noobit-running-coach ให้หน่อย
clone repo แล้วทำตาม README.md หัวข้อ "Setup runbook for AI agents" ทีละขั้น คุยกับผมเป็นภาษาไทย
```

Agent จะ clone repo, ถามข้อมูลของคุณ (อายุ, HR พัก, เป้าหมาย, ประวัติการวิ่ง), จัดการ Cloudflare ทั้งหมดผ่าน Wrangler ให้เอง
(ตั้งชื่อ workers.dev, สร้างฐานข้อมูล D1 และตาราง, deploy เว็บ, สร้างรหัสบันทึก) คุณแค่สมัคร Cloudflare ฟรี + กด Allow ตอนล็อกอินครั้งเดียว
ไม่ต้องเข้าหน้า dashboard ของ Cloudflare เลย แล้ว Agent จะ
เขียนแผนซ้อมแรก และสอนติดตั้ง Shortcut บน iPhone จบแล้วจะได้ลิงก์เว็บส่วนตัว เช่น `https://running-journal.<ชื่อคุณ>.workers.dev`

**ดูแลระบบต่อ**: จะสำรองข้อมูล, อัปเดตเวอร์ชัน, ดู error, ย้อนข้อมูลที่แก้ผิด หรือเปลี่ยนรหัส ก็แค่บอก Agent เป็นภาษาไทย (เช่น "สำรองฐานข้อมูลให้หน่อย")
Agent ทำผ่าน Wrangler ตามหัวข้อ "Day-to-day Cloudflare and database management"

**ใช้งานทุกวัน**: วิ่งตามปกติด้วย Apple Watch → Shortcut ส่งข้อมูลเข้าเว็บเอง → เปิด AI Agent ในโฟลเดอร์โปรเจกต์แล้วพิมพ์
**"เช็คข้อมูล"** (หรือตั้งให้รันเองทุกเช้า) โค้ชจะเขียนโน้ตและปรับแผนให้บนเว็บ จะส่งภาพหน้าจอ Strava / Apple Fitness ให้ Agent ก็ได้

---

## 🤖 Setup runbook for AI agents

You are setting up this app for **one athlete** (the person you are talking to). Follow the steps in order.
Talk to the user in **Thai**. Run every command yourself; only ask the user for things only they can do
(browser logins, answers about their body and goals, actions on their iPhone).

### Ground rules

- Work in the repository root. Use `npx wrangler …` (the project-pinned version), never a global wrangler.
- **Never commit or print** the ingest token, `.secrets/`, `data/`, `export.zip` or anything from Apple Health.
  `data/` is gitignored on purpose: it holds the athlete's health history. If the user forks this repo publicly, keep it that way.
- Every database change is a **dated SQL file** in `data/` (`data/YYYY-MM-DD_<name>.sql`), applied with
  `npx wrangler d1 execute running-journal-db --remote --file=data/<file>.sql`. Keep the files: they are the journal's history.
- SQL text rules: JSON array columns use `json_array(...)`; avoid ASCII apostrophes in Thai text (double them `''` if needed).
- After setup, `CLAUDE.md` is the operating manual for day-to-day coaching and `.claude/skills/running-journal/SKILL.md`
  is the daily "coach check". Read both before writing any coach note.
- Show the user a short checklist of the steps below and tick them off as you go.

### Step 0 — Check tools

```bash
node --version      # need 20+ (install from https://nodejs.org if missing)
python3 --version   # need 3.10+ (only for Apple Health import and building Shortcuts)
git --version
```

On macOS also check `shortcuts sign --help` works (needed in Step 7). If Node is missing, install it (macOS: `brew install node`
if Homebrew exists, else ask the user to run the installer from nodejs.org).

### Step 1 — Get the code

```bash
git clone https://github.com/ManageWithNoobItGuy/noobit-running-coach.git
cd noobit-running-coach
npm ci
```

### Steps 2–5 — Cloudflare, database, deploy and token (the agent does all of it with Wrangler)

**Everything on Cloudflare is done by you, the agent, through Wrangler.** Do not send the user to the Cloudflare dashboard
and do not ask them to run commands. The user only does what a human must do:

1. 👆 create a free Cloudflare account at https://dash.cloudflare.com/sign-up and **verify the email** (if they have none yet),
2. 👆 sign in and click **Allow** in the browser window that `wrangler login` opens,
3. 👆 choose an account if their login has several.

Asking you to install this app is the user's permission to create the Worker, D1 database, workers.dev subdomain and
secret on **their own** account. Tell them in one line what you are about to create, then go.

#### Step 2 — Log in (once per computer)

```bash
npx wrangler whoami --json     # exit code 0 + "loggedIn": true → already logged in, skip
npx wrangler login             # opens the browser; waits until the user clicks Allow (give it a 5+ min timeout)
```

If the browser cannot open, port 8976 is busy, or the agent runs remotely: `npx wrangler login --device` prints a link
and a code; show both to the user. Never ask the user to paste an API token into the chat.

#### Step 3 — One command does the rest

```bash
npm run cf:setup
```

`scripts/cf/setup.mjs` is idempotent (safe to re-run after any failure) and does, in order:

| # | What | How (all Wrangler / Cloudflare API with the user's login) |
|---|---|---|
| 1 | Check login | `wrangler whoami --json` |
| 2 | Pick the account | one account → used automatically; saved as `account_id` in `wrangler.jsonc` so no command ever prompts |
| 3 | workers.dev subdomain | `scripts/cf/ensure-workers-subdomain.mjs` registers one if the account is brand new (no dashboard visit) |
| 4 | D1 database | `wrangler d1 list` → reuse, else `wrangler d1 create running-journal-db`; writes `database_id` into `wrangler.jsonc` |
| 5 | Tables | `wrangler d1 migrations apply running-journal-db --remote` |
| 6 | Deploy | `wrangler deploy` → prints the site URL |
| 7 | Ingest token | random token in `.secrets/ingest-token.txt` (chmod 600) → `wrangler secret put INGEST_TOKEN` |
| 8 | Live check | polls `<SITE_URL>/api/ingest/status` until it answers with `configured: true` |

Progress lines go to stderr; the last thing printed is one JSON object. Act on its `status` / exit code:

| Exit | `status` | What you do |
|---|---|---|
| 0 | `ready` | Note `site_url` = **SITE_URL** for every later step. Tell the user the link. |
| 0 | `deployed-not-answering-yet` | A new subdomain can take 1–2 min. Wait, then `curl -s <SITE_URL>/api/ingest/status`. |
| 2 | `choose-account` | Show the account **names** from `accounts`, ask which one, re-run `npm run cf:setup -- --account-id <id>`. |
| 3 | `email-not-verified` / `permission` | Ask the user to click the verify link in Cloudflare's email, then re-run. |
| 4 | `not-logged-in` | Go back to Step 2. |
| 5 | `existing-database` | The account already has `running-journal-db` (e.g. a second install). Ask: reuse it (`-- --reuse-existing`, deploys over the existing Worker) or install another copy (change `"name"` and `"database_name"` in `wrangler.jsonc`, re-run). Never reuse without asking. |
| 1 | other | Read the printed Wrangler error, fix it, re-run. See "Troubleshooting" below. |

Options: `--subdomain <name>` (preferred workers.dev name for a new account), `--rotate-token`, `--reuse-existing`,
`--dry-run` (read-only check: nothing is created or uploaded).

#### Step 4 — Check the result

```bash
curl -s <SITE_URL>/api/dashboard | head -c 300   # JSON, mostly empty until Step 6
npx wrangler d1 execute running-journal-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

#### Step 5 — The token

Never echo `.secrets/ingest-token.txt` in chat. When the user needs it (Step 7 and the app's ⚙ page), copy it to their
clipboard (`pbcopy < .secrets/ingest-token.txt` on macOS, `clip < .secrets\ingest-token.txt` on Windows) or let them open
the file. A new or rotated token takes about 10–30 s to reach the live Worker (writes return 401 until then).

### Step 6 — Interview the athlete and write the profile

Ask (one short message, Thai, a few questions at a time). Explain why each matters in a few words:

1. ชื่อ และชื่อเล่นที่อยากให้โค้ชเรียก (e.g. "พี่โอ๊ต")
2. อายุ, เพศ
3. HR ตอนพัก (Apple Health → Heart → Resting Heart Rate, weekly average) and max HR if they have really measured it
4. Goal race: ชื่องาน/ระยะ และวันที่ (or "ยังไม่เลือกงาน" → pick a target date with them)
5. Goals A/B/C (A = finish healthy, B = realistic time, C = stretch)
6. ตอนนี้วิ่งอยู่แค่ไหน: runs per week, longest recent run, typical easy pace + HR, past races and times
7. Injuries / pain / health conditions (anything serious → advise seeing a doctor before training)
8. วันไหนว่างซ้อม, วิ่งในร่มหรือกลางแจ้ง (treadmill?), อุปกรณ์เวทที่มีที่บ้าน
9. โค้ชชื่ออะไรดี (default "แพร") and the date to start the plan

Then compute HR zones (Karvonen): `max_hr` = measured, else `round(208 − 0.7 × age)`;
zone *n* starts at `resting + p × (max − resting)` with p = 0.6, 0.7, 0.8, 0.9 (Z1 below 60 %);
`easy_hr_cap` = top of Z2 = start of Z3 − 1. Tell the user the numbers and suggest setting the same
**Manual heart-rate zones** on the Apple Watch (Watch app → Workout → Heart Rate Zones).

Copy `seed/01_profile.example.sql` to `data/<today>_profile.sql`, replace every `{{…}}`, apply it.
If they gave past races, also insert them into `races` (see `migrations/0007_races.sql` for columns).

### Step 7 — iOS Shortcuts (automatic data from Apple Watch) — optional but recommended

Needs macOS (to sign), an iPhone and an Apple Watch. Skip to Step 8 without them: runs can still be logged from screenshots.

```bash
python3 -I scripts/build_shortcut.py <SITE_URL> /tmp/rj-daily.unsigned.shortcut
shortcuts sign --mode anyone --input /tmp/rj-daily.unsigned.shortcut --output public/shortcut/running-journal.shortcut
python3 -I scripts/build_shortcut.py <SITE_URL> /tmp/rj-run.unsigned.shortcut --run
shortcuts sign --mode anyone --input /tmp/rj-run.unsigned.shortcut --output public/shortcut/running-journal-run.shortcut
npx wrangler deploy
```

Then guide the user (the app shows the same guide in Thai at `<SITE_URL>/#/sync`):

1. On the iPhone open `<SITE_URL>/#/sync` in Safari, tap both install buttons. Each import asks for the token: paste it.
2. Open each shortcut once in the Shortcuts editor and **re-pick the Health type in every "Find Health Samples" action**
   (iOS only asks for Health permission when a type is picked in the editor). Then Health → Sharing → Apps → Shortcuts:
   allow Resting Heart Rate, HRV, Sleep, Cardio Fitness (VO₂max), Heart Rate, Walking + Running Distance, Active Energy, Steps.
3. Settings → Apps → Shortcuts → Advanced → **Allow Sharing Large Amounts of Data** = on.
4. Automations (Shortcuts → Automation → New, "Run Immediately"):
   - **Alarm → is Stopped** (wake-up alarm) → `running-journal` (daily: resting HR, HRV, sleep, VO₂max).
   - **Apple Watch Workout → Running → Ends** → `running-journal-run` (each run: distance, HR, splits, cadence).
   - Optional: **Apple Watch Workout → Functional / Traditional Strength Training → Ends** → `running-journal-run` (strength HR).
5. Test: run `running-journal` by hand, then `curl -s <SITE_URL>/api/ingest/status` (or open `/#/sync`) shows the delivery.
   If a delivery says "ยังอ่านค่าไม่ได้" or a shortcut stops with "No Samples Found", see CLAUDE.md → "Daily Health sync"
   and "Run Shortcut" for fixes (usually: re-pick the Health type, allow the permission).

On the computer and phone browsers: open `<SITE_URL>/#/settings` and paste the token once into "รหัสบันทึก" so the
strength log and favourites can save.

### Step 8 — First training plan

Read the "Coaching rules" and "HR zones" sections of `CLAUDE.md`, then write `data/<today>_initial-plan.sql`
(structure: `seed/02_plan.example.sql`):

- `plan_phases` from `journal_start` to the race date (base → aerobic → specific → taper), weekly km and long-run ranges.
- `milestones` (4–6 checkpoints).
- **4 weeks** of `planned_workouts`, one row per day (rest days too). Every row needs `purpose`, `prep`, `steps`, `tips`
  (`json_array`), HR targets from the athlete's own zones, and strength sessions using exercises that exist in
  `public/exercises.js` (or add the exercise there first). Respect: ≤ 10 % weekly increase (or +2–3 km under 20 km/week),
  every 4th week lighter, long run +≤ 1 km/week, run/walk for beginners, no speed work in the base phase.
- One `plan_changes` row ("เริ่มแผน", why).

Apply it and check `<SITE_URL>/#/plan`.

### Step 9 — Personalise the agent instructions

- In `CLAUDE.md` replace every `{{…}}` (name, nickname, goal, SITE_URL, age, HR numbers and zone table, athlete history).
  Keep the rest: it is the operating manual (data conventions, workflows, coaching rules).
- In `.claude/skills/running-journal/SKILL.md`, the persona examples use `{ชื่อเล่น}`: leave them (the skill reads
  `profile.athlete_nickname`) or rewrite the persona if the user wants a different coach.
- If the user wants the site name changed: `<title>` and `.brand-text` in `public/index.html`, `public/manifest.webmanifest`.

### Step 10 — Daily coach check

- Manual: the user opens the agent in this folder and types **"เช็คข้อมูล"** → run the `running-journal` skill.
- Automatic (Claude desktop app): create a scheduled task named `running-journal-coach-check`, daily ~09:00, prompt
  `Run the running-journal skill in unattended mode.`, working folder = this repo, permission mode that allows
  `npx wrangler` and `curl` without asking. It only runs while the app is open.

### Step 11 — Verify and hand over

1. `curl -s <SITE_URL>/api/dashboard` shows the profile, today's plan and phases.
2. Open `<SITE_URL>` on the phone → Share → **Add to Home Screen** (it is a PWA).
3. Tell the user (Thai): the site link, how data arrives, how to say "เช็คข้อมูล", that the token lives in
   `.secrets/ingest-token.txt`, and that `data/` must stay private.
4. Optional: back up their own copy to a **private** GitHub repo (if they fork publicly, `data/` and `.secrets/` stay ignored).

---

## Day-to-day Cloudflare and database management (for agents)

The user never needs the Cloudflare dashboard. Do these with Wrangler yourself; ask first only where marked ⚠️.

| Task | Commands |
|---|---|
| Run SQL / look at data | `npx wrangler d1 execute running-journal-db --remote --json --command "SELECT …"` (always `--remote`: without it Wrangler uses the empty local copy) |
| Change data | write `data/YYYY-MM-DD_<name>.sql`, then `npx wrangler d1 execute running-journal-db --remote --file=data/<file>.sql` |
| Change the schema | new numbered file in `migrations/` → `npm run db:migrate` |
| Back up the database | `mkdir -p backups && npx wrangler d1 export running-journal-db --remote -y --output backups/<date>.sql` (`backups/` is gitignored: private) — do this before any risky change |
| Undo a bad data change | `npx wrangler d1 time-travel info running-journal-db` then ⚠️ `npx wrangler d1 time-travel restore running-journal-db --timestamp <ISO time before the change>` (D1 keeps 30 days; confirm the time with the user) |
| Update the app to a new version of this repo | `git pull` → `npm ci` → `npm run db:migrate` → `npm run deploy` (re-run `npm run cf:setup` if anything is missing) |
| Deploy code changes | `npm run deploy`; bump `BUILD` in `src/worker.ts` and check the `x-app-build` response header to confirm it is live |
| Roll back the code | `npx wrangler deployments list` → `npx wrangler rollback <version-id>` (does **not** roll back D1 data) |
| See live errors | `npx wrangler tail --format pretty` (run in the background, reproduce, read, stop) |
| Rotate the ingest token | `npm run cf:setup -- --rotate-token`, then the user pastes the new token into both Shortcuts and `/#/settings` |
| Show what exists | `npx wrangler whoami`, `npx wrangler d1 list`, `npx wrangler secret list`, `npx wrangler deployments list` |
| Move to another computer | clone the repo, `npm ci`, `npx wrangler login`, copy `.secrets/ingest-token.txt` and `data/` over privately, `npm run cf:setup` (finds the existing database through `account_id`/`database_id` in `wrangler.jsonc`; commit those two ids in the user's private copy) |
| Remove everything | ⚠️ ask twice, back up first: `npx wrangler delete --name running-journal` and `npx wrangler d1 delete running-journal-db -y` (permanent) |

Never run `DROP`, `DELETE FROM` without a `WHERE`, a time-travel restore, or a delete on the remote database without the user's explicit OK.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `npx.ps1 cannot be loaded` (Windows PowerShell) | use `npx.cmd` / `npm.cmd` |
| `Not logged in` / code 10000 | `npx wrangler login` again; check `whoami` shows the right account |
| "More than one account available" | `npm run cf:setup -- --account-id <id>` (writes `account_id`) |
| "register a workers.dev subdomain", code 10007 | `node scripts/cf/ensure-workers-subdomain.mjs --account-id <id>` |
| `database not found` / bad `database_id` | the id belongs to another account: set it back to `REPLACE_WITH_YOUR_D1_DATABASE_ID` and re-run `npm run cf:setup` |
| Live site says `no such table` | migrations went to the local copy: `npm run db:migrate` (it uses `--remote`) |
| Writes return 401 right after setup | the token secret is still propagating; wait 30 s |
| Site errors (Cloudflare 1101) | `npx wrangler tail`, reload the page, read the exception |

## Optional extras (for agents)

- **Import Apple Health history** (past runs, sleep, HR, HRV): the user exports from Health app → profile → Export All Health Data,
  drops `export.zip` in the repo root (gitignored). Follow `CLAUDE.md` → "Apple Health import" (unzip outside the repo,
  `scripts/extract_apple_health.py` → `scripts/import_apple_health.py` → apply the SQL). Then fill "Athlete history" in `CLAUDE.md`.
- **Log a run from screenshots**: follow `CLAUDE.md` → "Workflow: a new run arrives".
- **Strava sync**: built but off. Needs the user's own Strava API app: set `STRAVA_CLIENT_ID` in `wrangler.jsonc`,
  `npx wrangler secret put STRAVA_CLIENT_SECRET`, crons `["15 */3 * * *"]`, deploy, then open `<SITE_URL>/strava/connect`.
- **Local development**: `npm run db:migrate:local`, apply the profile SQL with `--local`, then `npm run dev` → http://localhost:8787.

## Privacy and security notes

- The **read** API (`/api/*` GET) has no login: anyone who knows the site URL can read the journal. Keep the URL private.
  For a lock, put the site behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
  and add a bypass rule for `/api/ingest/*` so the Shortcuts can still post (they use the bearer token).
- Every **write** needs the ingest token. Rotate it with `npm run cf:setup -- --rotate-token` and update the token in both Shortcuts and `/#/settings`.
- Health data stays in your own Cloudflare D1 database. Nothing is sent anywhere else.

## Known limits

- Timezone is fixed to Asia/Bangkok (UTC+7) in several places in code (listed in `CLAUDE.md` → "Known gaps").
- UI and coach notes are Thai.
- Single user per install. Max HR is estimated unless measured.

## Project layout

| Path | What |
|---|---|
| `src/` | Cloudflare Worker: JSON API, Health/Shortcut ingest, HR sessions, workouts, Strava (dormant) |
| `public/` | Static SPA (vanilla JS, hand-drawn SVG charts, Thai UI), exercise library `exercises.js` |
| `migrations/` | D1 schema (apply all, in order) |
| `seed/` | Example SQL for a fresh install (profile, plan) |
| `data/` | Your private dated SQL history (gitignored) |
| `scripts/cf/` | One-command Cloudflare setup via Wrangler (`npm run cf:setup`) + workers.dev subdomain helper |
| `scripts/` | Apple Health export import, sleep extraction, Shortcut builder |
| `CLAUDE.md` | Operating manual for the AI agent (data conventions, coaching rules, workflows) |
| `.claude/skills/running-journal/` | The daily "coach check" skill |

## License

MIT — see [LICENSE](LICENSE). Made by [บริหารงานแบบคนไอที / noobitguy](https://github.com/ManageWithNoobItGuy).
