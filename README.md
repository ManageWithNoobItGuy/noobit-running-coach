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

Agent จะ clone repo, ถามข้อมูลของคุณ (อายุ, HR พัก, เป้าหมาย, ประวัติการวิ่ง), สร้างฐานข้อมูล, deploy เว็บ,
เขียนแผนซ้อมแรก และสอนติดตั้ง Shortcut บน iPhone จบแล้วจะได้ลิงก์เว็บส่วนตัว เช่น `https://running-journal.<ชื่อคุณ>.workers.dev`

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

### Step 2 — Log in to Cloudflare

```bash
npx wrangler login     # opens a browser: the user signs in and clicks "Allow"
npx wrangler whoami    # confirm the account
```

A brand-new Cloudflare account has no `workers.dev` subdomain yet. If deploy (Step 4) complains about it, ask the user to open
**Cloudflare dashboard → Workers & Pages** once and pick a subdomain, then retry.
If `whoami` lists several accounts, ask which one to use and set `account_id` in `wrangler.jsonc`.

### Step 3 — Create the database

```bash
npx wrangler d1 create running-journal-db
```

Copy the printed `database_id` into `wrangler.jsonc` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`). Then create the tables:

```bash
npx wrangler d1 migrations apply running-journal-db --remote
```

### Step 4 — Deploy the site

```bash
npx wrangler deploy
```

Note the URL it prints (`https://running-journal.<subdomain>.workers.dev`) — this is **SITE_URL** for every later step.
Check: `curl -s <SITE_URL>/api/dashboard` returns JSON (mostly empty for now). A fresh deploy can take a minute to answer.

### Step 5 — Create the ingest token (protects every write)

Shortcuts and the app's write buttons send `Authorization: Bearer <token>`. Generate it, store it locally, upload it as a Worker secret:

```bash
mkdir -p .secrets && chmod 700 .secrets
openssl rand -hex 24 > .secrets/ingest-token.txt
npx wrangler secret put INGEST_TOKEN < .secrets/ingest-token.txt
```

Do not echo the token in chat. When the user needs it (Step 7 and the app's ⚙ page), have them open
`.secrets/ingest-token.txt` themselves, or copy it to the clipboard for them (`pbcopy < .secrets/ingest-token.txt` on macOS).

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

## Optional extras (for agents)

- **Import Apple Health history** (past runs, sleep, HR, HRV): the user exports from Health app → profile → Export All Health Data,
  drops `export.zip` in the repo root (gitignored). Follow `CLAUDE.md` → "Apple Health import" (unzip outside the repo,
  `scripts/extract_apple_health.py` → `scripts/import_apple_health.py` → apply the SQL). Then fill "Athlete history" in `CLAUDE.md`.
- **Log a run from screenshots**: follow `CLAUDE.md` → "Workflow: a new run arrives".
- **Strava sync**: built but off. Needs the user's own Strava API app: set `STRAVA_CLIENT_ID` in `wrangler.jsonc`,
  `npx wrangler secret put STRAVA_CLIENT_SECRET`, crons `["15 */3 * * *"]`, deploy, then open `<SITE_URL>/strava/connect`.
- **Local development**: `npx wrangler d1 migrations apply running-journal-db --local`, apply the profile SQL with `--local`,
  then `npx wrangler dev` → http://localhost:8787.

## Privacy and security notes

- The **read** API (`/api/*` GET) has no login: anyone who knows the site URL can read the journal. Keep the URL private.
  For a lock, put the site behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
  and add a bypass rule for `/api/ingest/*` so the Shortcuts can still post (they use the bearer token).
- Every **write** needs the ingest token. Rotate it by writing a new value to `.secrets/ingest-token.txt`,
  `npx wrangler secret put INGEST_TOKEN < .secrets/ingest-token.txt`, and updating the token in both Shortcuts and `/#/settings`.
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
| `scripts/` | Apple Health export import, sleep extraction, Shortcut builder |
| `CLAUDE.md` | Operating manual for the AI agent (data conventions, coaching rules, workflows) |
| `.claude/skills/running-journal/` | The daily "coach check" skill |

## License

MIT — see [LICENSE](LICENSE). Made by [บริหารงานแบบคนไอที / noobitguy](https://github.com/ManageWithNoobItGuy).
