# Running Journal — AI running coach (noobit-running-coach)

Personal running log + coaching app. The athlete is **{{ATHLETE_NAME}}** (called "{{ATHLETE_NICKNAME}}" by the coach),
targeting **{{GOAL_RACE_NAME}} on {{GOAL_RACE_DATE}}** (goal date in `profile.goal_race_date`).
They send run data (Apple Watch via iOS Shortcuts, or screenshots in chat); Claude logs it, analyses it, and
adjusts the training plan. Talk to the athlete in **Thai**.

> Setup: the `{{...}}` values in this file are filled in by the AI agent during setup (README.md → "Step 9").
> Until they are filled in, follow README.md first.

- Live site: {{SITE_URL}}
- Cloudflare Worker `running-journal` + D1 `running-journal-db` (id in `wrangler.jsonc`)
- Wrangler must be logged in on this machine. Always use `npx wrangler` (project-pinned version).

## Layout

- `src/worker.ts` — JSON API (`/api/dashboard`, `/api/runs`, `/api/runs/:id`, `/api/plan`, `/api/notes`, `/api/strava/status`, `POST /api/strava/sync`) + HR zone maths (`zoneDefs`, `zoneTime`).
- `src/strava.ts` — Strava OAuth (`/strava/connect`, `/strava/callback`), webhook (`/strava/webhook`), sync (cron `15 */3 * * *` + webhook + manual).
- `public/` — static SPA (vanilla JS, hand-drawn SVG charts, Thai UI). No build step.
- `public/exercises.js` — strength/mobility exercise guide (Thai how-to, cues, mistakes, stick-figure poses, YouTube search link).
  Strength-day panels show a card for every exercise whose alias appears in that workout's `steps`. When a plan uses a
  new exercise, add it here (aliases + 1–2 poses) or it will have no card. Library page: `/#/exercises`.
- `migrations/` — D1 schema. New schema change = new numbered file, then `npx wrangler d1 migrations apply running-journal-db --remote`.
- `seed/` — example SQL for a fresh install (profile, first plan). Copy into `data/`, fill in, apply.
- `data/` — every data change is a dated SQL file (gitignored: it is the athlete's private health history), applied with
  `npx wrangler d1 execute running-journal-db --remote --file=data/<file>.sql`.
  Keep these files: they are the history of the journal.
- Cloudflare setup/repair: `npm run cf:setup` (`scripts/cf/setup.mjs`: account, workers.dev subdomain, D1, migrations, deploy, token; idempotent).
  Day-to-day Wrangler tasks (backup, time travel, rollback, logs, token rotation): README → "Day-to-day Cloudflare and database management".
- Deploy code changes: `npx wrangler deploy`. Local dev: `npx wrangler dev` (local D1 needs the migrations + data files applied with `--local`).

## Navigation (information architecture)

Every page belongs to exactly one main tab; pages inside a tab share a sub-menu (`SUBNAV` + `subnav()` in `public/app.js`).
The router maps a hash to its tab at the top of `router()`. Put a new page under the tab that answers the athlete's question,
add it to `SUBNAV`, and do not add cross-section cards to another tab (link to the page instead).

| Tab (bottom bar on phones) | Question it answers | Pages |
|---|---|---|
| วันนี้ `#/` | What do I do today? | main-goal summary on top (`dailyCard()`: streak · km this week / plan · km since `profile.journal_start` · exercise minutes this week + 4-week calendar; data `summary` in `/api/dashboard`) → goal strip → today card (readiness, coach check, workout) · this week · next workouts · latest coach note |
| แผน | Where am I heading? | `#/plan` weekly plan + plan changes · `#/goal` countdown, goals A/B/C, phases, milestones |
| วิ่ง | What have I run? | `#/runs` log (+ `#/runs/<id>`) · `#/runs/stats` volume, records, calendar, 80/20 split, yearly history, past races · `#/zones` |
| เวท | Strength and other workouts | `#/strength` log + start buttons · `#/strength/progress` per-exercise progress · `#/exercises` library + ★ favourites |
| ร่างกาย | Am I recovered? | `#/health` readiness + 4 trend charts · `#/sleep` (+ `#/sleep/<date>`) |
| โค้ช (top bar) | What did the coach say? | `#/notes`, filter chips by topic (day / run / workout / sleep / week & plan) |
| ⚙ (top bar) | Set once per device | `#/settings` save code · `#/sync` Shortcut setup + delivery status |

## Data conventions

- Dates `YYYY-MM-DD` in Bangkok time. Weeks start Monday.
- Durations and paces in **seconds** (`moving_time_s`, `avg_pace_s` = sec/km, `splits.pace_s`).
- `run_type` / `planned_workouts.kind`: easy | runwalk | long | strides | tempo | interval | test | race | recovery | strength | rest.
- JSON array columns (`highlights`, `watchouts`, `next_steps`, `key_sessions`) — write them with SQLite `json_array(...)`.
- Avoid ASCII apostrophes in Thai text; if needed, double them (`''`).

## Strava sync — built but OFF

Strava API access needs your own Strava API app; by default runs come in through the run Shortcut or as screenshots in chat.
The code below stays dormant: no Client ID, no cron (`triggers.crons` is empty), and the UI hides Strava when it is not configured.
To enable it: create a Strava API app, then set `STRAVA_CLIENT_ID`, the secret and the cron (below).

- When enabled: webhook on new activity, cron every 3 h as backup, "ซิงก์ตอนนี้" button on the runs page.
- Sync fills `runs` (matched to a manually logged run by date + distance ±0.3 km if one exists), `splits` (from `splits_metric`),
  `run_streams` (≈300-point pace/HR series), `other_activities` (weight training etc.), links the day's `planned_workouts`
  row (done if ≥80% of target km, else partial), and marks planned strength done when a WeightTraining activity exists.
- Sync does **not** write analyses. Find runs waiting for a coach note:
  `SELECT r.id, r.run_date, r.distance_km FROM runs r LEFT JOIN analyses a ON a.run_id = r.id WHERE a.id IS NULL ORDER BY r.run_date`
- Config: `STRAVA_CLIENT_ID` var in `wrangler.jsonc`, `STRAVA_CLIENT_SECRET` Worker secret (the athlete sets it themselves).
  Tokens live in D1 `strava_auth` (one row; only the first connected athlete may reconnect). Backfill starts at `profile.strava_backfill_from`.
- Strava brand rules: keep "View on Strava" links and "Powered by Strava" text.

## Apple Health import

The athlete may drop an `export.zip` (Health app → profile → Export All Health Data) in the project root
(gitignored — personal health data, never commit it). Re-import is idempotent:

1. Unzip into the scratchpad, not the project.
2. `python3 -I scripts/extract_apple_health.py <apple_health_export/export.xml> <scratch>/health.json`
   (per-sample run detail from `DETAIL_FROM`, daily metrics from `DAILY_FROM` — bump these if needed).
3. Save remote runs to `<scratch>/existing.json` (the `results` array of):
   `SELECT r.id, r.run_date, r.start_time, r.hk_start, r.source, (SELECT count(*) FROM splits s WHERE s.run_id = r.id) AS n_splits FROM runs r`
   (`source` matters: runs from the run Shortcut are matched ±15 min and replaced with the exact export values, keeping their id).
4. `python3 -I scripts/import_apple_health.py <scratch>/health.json <scratch>/existing.json data/<date>_apple-health.sql --from <YYYY-MM-DD>`
5. Apply to remote D1, then write a coach note about what changed (recovery trends, new runs) and update the plan if needed.

What it writes: runs ≥ 1 km (multi-app duplicates removed; existing runs matched by `hk_start` or date+time ±3 min, keeping their
Strava splits/notes), `run_streams` + splits for runs with dense watch samples (mid-2026 onward), running dynamics and weather
on `runs`, non-running workouts into `other_activities` with **negative** ids, `daily_metrics`, and `running_years`.
`scripts/health_calc.py` holds the split/stream maths (validated against Strava splits to ±1 s).

- `indoor = 1` means treadmill: distance/pace are watch estimates (±5–10%) and weather does not apply.
- Readiness (dashboard "วันนี้" + `/#/health`): latest resting HR vs 30-day mean (+4 → flag), 3-day HRV vs 30-day mean
  (−15% → flag), last night's sleep < 6:30 (flag). 2+ flags = "low": suggest swapping a run for rest/easy walk.

## Daily Health sync (iOS Shortcut)

- An iOS Shortcut on the athlete's iPhone runs every morning (automation: wake-up alarm stopped) and POSTs
  resting HR, HRV (last 24 h), last night's sleep samples and VO₂max to `POST /api/ingest/daily` with
  `Authorization: Bearer <INGEST_TOKEN>`. Parser: `src/ingest.ts`; it upserts `daily_metrics` (readiness updates itself).
- Setup guide lives in the app at `/#/sync` (with a status list of recent deliveries from `/api/ingest/status`).
- Ready-made shortcut: `public/shortcut/running-journal.shortcut`, built by `scripts/build_shortcut.py` (no token inside —
  an import question asks for it) and signed with `shortcuts sign --mode anyone`. Rebuild + re-sign if the URL or fields change.
- The token is a Worker secret; its value is only in `.secrets/ingest-token.txt` (gitignored). Never print it in chat.
  Shortcut files are not in git: build them for {{SITE_URL}} with `scripts/build_shortcut.py` and sign them (README → "Step 7").
  To rotate: write a new random value to that file, pipe it into `npx wrangler secret put INGEST_TOKEN`, redeploy if needed,
  and tell the athlete to update the Shortcut header.
- Every payload is stored in `ingest_log` (last 60). If a delivery shows "ยังอ่านค่าไม่ได้" or numbers look wrong, read the raw
  payload (`SELECT payload FROM ingest_log ORDER BY id DESC LIMIT 1`) and adjust the parser — field formats depend on the
  phone's language (sleep stage names may be Thai) and iOS version.
- Runs are still logged from screenshots; monthly full exports fill in per-run detail.
- Health type names in Find Health Samples must match iOS: **Sleep** (not "Sleep Analysis"), **Cardio Fitness** (= VO₂max),
  Resting Heart Rate, Heart Rate Variability. iOS only asks for read permission when a type is picked in the editor, so after
  importing the shortcut the athlete may need to re-pick each type once (Health → Apps → Shortcuts must list all four).
  Resting HR and Cardio Fitness need the "last 7 days" filter (without a date filter they came back empty).
  After a fresh install, Cardio Fitness (action 4) and Heart Rate (action 5) still arrive empty until re-picked once in the editor
  (the stored enum differs from what the builder writes; the Mac cannot show Health actions, so this was not resolved).
  Heart Rate (≈1,300 samples / 14 h) needs Settings → Apps → Shortcuts → Advanced → "Allow Sharing Large Amounts of Data".
- "in the last 1 day" includes all of yesterday, so a delivery usually holds two nights; `sleepNights()` splits on 3 h+ gaps
  and upserts each night under its wake-up date.
  The window starts at yesterday 00:00, so the next morning repeats the previous night **cut at midnight**: `ingestDaily` never lets
  a shorter copy replace a stored longer night.
- Deploys can take a few minutes to reach the workers.dev URL. Every JSON response carries `x-app-build` (constant `BUILD`
  in `src/worker.ts`) — bump it when you need to confirm a new version is live.

## Run Shortcut (latest run without screenshots)

- Second Shortcut `public/shortcut/running-journal-run.shortcut` (`build_shortcut.py --run`, same token): waits 20 s, then sends
  Walking + Running Distance (value/start/end/source), Heart Rate (value/start), Active Energy (value/start) and Steps
  (value/start/end/source, for cadence) from the
  last 3 hours to `POST /api/ingest/run` (`src/runingest.ts`). Automation: Apple Watch Workout → Running → Ends → Run Immediately.
- Every Watch session in the delivery is processed (`parseSessions()`): each dense heart-rate cluster (Watch samples HR every ~5 s
  only during a workout) is split into runs (dense-distance stretches ≥ 0.8 km, pauses ≤ 3 min) and non-run workouts (the rest, ≥ 10 min).
  Re-sending is idempotent. The last 5 deliveries keep their full payload in `ingest_log` (older ones trimmed to 50 KB). For a run, the cluster
  is the window; Watch distance samples inside it give distance, moving time (gaps > 30 s = pauses), splits and a 300-point
  stream (same maths as `health_calc.py`). Fallback window: dense distance samples. Needs ≥ 0.8 km.
- Tested on two export runs: distance +0.5–3 %, moving time ±2 %, middle splits within seconds of Strava; km 1 can be slow
  because the Watch starts recording 1–3 min before the workout start. Start time can be early by that much too.
- Writes `runs` (source `shortcut`, title "Morning/Lunch/… Run", run_type from the plan or walk share), splits, `run_streams`,
  links the day's `planned_workouts`. Re-sending updates the same run (same date, start ±10 min). A copy cut by the 3-h window
  (overlaps a stored run and is >10 % shorter) is ignored, and `upsertSession()` never replaces an HR session with one >10 % shorter. If a run from screenshots/Strava
  already exists there, it only fills missing HR/calories, splits (if none) and the stream.
- A Find Health Samples action that returns nothing **stops the whole shortcut** with "No Samples Found — no <type> samples or
  no access" (Shortcuts has no error handling). Fix = re-pick the type in each Find Health Samples action in the iPhone editor (same enum issue as the daily one)
  and allow Steps + Active Energy under Health → Sharing → Apps → Shortcuts.
- `indoor` is unknown from samples (NULL) — set it when the athlete says treadmill. Still write the analysis by hand
  (runs waiting: the query in the Strava section). Logged in `ingest_log` with `kind = 'run'` (daily = `kind = 'daily'`).

## Strength workouts (`/#/strength`)

- Tables `workouts` (one session: date, title, duration, RPE, notes, `planned_id`, Watch data `watch_start_ms/watch_secs/avg_hr/max_hr/calories/hr`)
  and `workout_sets` (`exercise` = `exercises.js` id or `custom:<name>`, `reps`, `weight_kg` NULL = bodyweight, `secs` for planks). Migration 0013
  also added `analyses.workout_id` and `planned_workouts.workout_id`.
- The athlete logs in the app: strength day card → "บันทึกเวท" (`#/strength/new/p<planned id>`) pre-fills exercises and targets from the
  plan steps (`plannedSets()` in exercises.js) and last weights. Saving marks the planned row done. Writes (`POST /api/workouts`,
  `DELETE /api/workouts/:id`) need `Authorization: Bearer <INGEST_TOKEN>`; the page asks for it once and keeps it in localStorage.
- **Guided session** (`#/strength/go/p<planId>` | `go/w<workoutId>` | `go/new`, `renderSession()` in app.js) is the main way to log:
  pick an exercise → pictogram + how-to → log each set with big steppers (weight/reps) and confirm → rest timer → "อีกเซ็ต" or
  "เปลี่ยนท่า". Timed exercises (plank) get a countdown (3 s get-ready, beep at 0, set saved automatically; `sides: true` exercises
  run side 1 → 5 s switch → side 2). Every set is kept in localStorage `rj_session` (one draft; resumed on return, home card shows
  "เล่นต่อ") and POSTed to `/api/workouts` right away, so leaving the page loses nothing. "จบการเล่น" adds RPE/notes/duration.
  The old full form (`#/strength/new…`, `/edit`) stays for back-filling. Targets come from `plannedSets()` (now with `perSide`).
  Reps vs time per exercise (`blockMode()`): the athlete's "นับครั้ง / นับเวลา" switch on the exercise screen → library `unit: "secs"`
  (plank, side plank, wall sit) → for `custom:` exercises, how they were logged (asked once when added). Never infer it from a 0:
  a rep set has `secs` NULL and a timed set has `reps` NULL (the API stores 0 as NULL; chat-logged SQL must do the same).
- Progress page computes per exercise: best set (est. 1RM = kg × (1 + reps/30), max reps, or max plank secs), volume, PRs.
- Apple Watch: the run Shortcut also handles non-run sessions (latest dense-HR cluster ≥ 10 min with < 0.8 km) → `attachWatchWorkout()`
  fills duration/HR/kcal on that day's log or starts a `source='watch'` session. Needs an extra automation (Functional / Traditional
  Strength Training → Ends → same shortcut). Logging sets by chat: insert the same rows with a dated SQL file.
- Exercise library `/#/exercises` (เวท › คลังท่า): how-to for every exercise and ★ favourites (profile key `fav_exercises`, JSON ids;
  `POST /api/settings/favourites`, same token). Favourites show as one-tap tiles in the log form.
  Settings page `/#/settings` (gear icon in the top bar) only holds per-device things: the save code and the link to `/#/sync`.
  Bodyweight exercises (push-up) leave weight empty; progress is max reps. New exercise = add to `exercises.js` (id, aliases, how, poses).
- **Heart-rate sessions** (`hr_sessions`, migration 0014; `src/hrsessions.ts`): every Watch session the run Shortcut finds, every dense
  HR cluster in the morning delivery (yesterday's heart rate), plus Apple Health export workouts (`other_activities`, copied in when
  linked). The workout page card "หัวใจระหว่างเล่น" shows HR chart + zones and a picker (3-day window, ‹ ›) to link/move/unlink a session
  (`POST /api/workouts/:id/hr {key: "s:<id>"|"oa:<strava_id>"|null}`, token); it suggests the unlinked session nearest the start time.
  Sessions overlapping a logged run are hidden. `workouts.hr_session_id` is the link; linking copies watch_*/avg/max/kcal/hr onto the workout.
  `GET /api/hr-sessions?date=&days=1`; `POST /api/hr-sessions/rescan` (token) re-reads complete payloads in `ingest_log`.
  A day with no Watch workout started has no dense HR, so there is nothing to link.
- Coach notes for workouts: `analyses.scope='workout'` with `workout_id` (skill handles them; double-progression rule).

## Coach check skill (`running-journal`)

- `.claude/skills/running-journal/SKILL.md`: finds what is new since `profile.coach_last_check` (UTC ISO) — runs without a note
  (from `profile.journal_start` on), today's morning delivery without a `scope='day'` note, failed deliveries, missing week/sleep notes —
  then writes the notes as dated SQL files and records the check. Unattended mode never asks; questions go into `next_steps`.
- Morning notes: `analyses.scope = 'day'` with `for_date` (migration 0012). Shown in the dashboard "วันนี้" card
  (`today_note`), at the top of `/#/health` (`day_note`) and on `/#/notes` as "เช็คร่างกายรายวัน".
- Can run daily (e.g. 09:00) as a Claude desktop scheduled task `running-journal-coach-check` (README → "Step 10"; only while the app is open — a missed run happens at the next launch). The athlete can also type "เช็คข้อมูล" any time.

## Health page charts (`/#/health`)

- One range selector (7 วัน / 30 วัน / 1 ปี / ทั้งหมด) drives all four charts (`healthRange`, `healthChart()`, `healthCharts()` in app.js).
  `/api/health` returns every daily row (load older history with `extract_apple_health.py --daily-from <YYYY-MM-DD>`).
- Suggested bands: resting HR target 50–57 + alert line at 30-day mean +4; HRV personal band = 60-day mean ± 1 SD + fatigue
  line at 30-day mean × 0.85; sleep 7–9 h; VO₂max approximate norms (the app ships the men 40–49 table: <35 low, 35–40 fair, 40–45 good, 45+ very
  good; adjust in `public/app.js` for another age/sex). Each card shows the range average with an in/out-of-band chip.

## Sleep page (`/#/sleep`)

- Data: `daily_metrics` sleep columns per night, filed under the **wake-up date**: `sleep_min`, `deep_min`, `rem_min`, `core_min`,
  `awake_min`, `bed_time`, `wake_time` (HH:MM local). Filled daily by the Shortcut (`sleepNights()` in `src/ingest.ts`) and from
  exports by `scripts/extract_sleep_nights.py` (same rules: Watch samples, 3 h gap = new night, naps never replace the main night).
- `/api/sleep` returns ~400 days of nights + the latest `analyses` row with `scope = 'sleep'`. The page computes trends, charts and
  per-night notes itself (rules in `nightNotes()` in `public/app.js`: 7 h target, deep < 10 %, REM < 18 %, awake > 30 min,
  bedtime > 45 min off the 30-night median).
- Single-night view `/#/sleep/<wake-date>` (WHOOP-style): hypnogram with sleep cycles (each REM period closes a cycle),
  heart rate during sleep, stage bars with the athlete's own 30-night p25–p75 "typical range", and rule-based insights
  (`nightView()`, `sleepCycles()`, `typicalRanges()`, `nightInsights()` in `public/app.js`). Data: table `sleep_detail`
  (`start_ms`, `segments` [[startMin, endMin, code]] code 0 awake/1 REM/2 core/3 deep/4 unspecified, `hr` [[offsetMin, bpm]]),
  API `/api/sleep/night/:date`. Exports fill it via `extract_sleep_nights.py --detail`; the Shortcut fills `segments` daily.
  Sleeping HR arrives daily via the Shortcut's 5th action (Heart Rate, last 14 h → `hr_value`/`hr_start`); the parser keeps only
  samples inside each night ±15 min. The Heart Rate type must be re-picked once in the iPhone editor for permission.
- **Sleep score 0–100** (`sleepScore()` / `sleepScores()` in `public/app.js`, frontend only): duration 50 (7–9 h full, −6 per
  10 min short of 7 h, 6 h = 14, 0 at 5 h), deep + REM % 20 (deep 15 %/REM 21 % full, 10 %/18 % = 6 of 10), awake 15 (≤ 10 min full,
  30 min = 10, 90 min = 0), bedtime vs median of the 30 nights before 15 (late ≤ 15 min full, 90 min = 0; earlier never penalised).
  Missing parts drop out and the rest scales to 100. Bands 85+ ดีมาก / 70+ ดี / 55+ พอใช้ / ต้องปรับ. HR/HRV deliberately excluded.
  Shown as rings in the 14-night list, breakdown on `/#/sleep/<date>`, "คะแนนการนอน" card (7/30-night avg, points lost per part,
  chart, "คะแนนคิดยังไง") and a row in the trend table. If thresholds change, update `SCORE_HOW` text too.
- Write a new `scope='sleep'` analysis about once a month or when the trend changes (verdict, highlights/watchouts/next_steps).
- Write the athlete's own sleep findings here after the first month of data (typical duration, how bedtime drives duration, weak nights).

## Athlete history

{{ATHLETE_HISTORY — filled in at setup from what the athlete tells the agent and from the Apple Health export:
past races (also in table `races`), recent yearly volume, typical easy pace and HR, resting HR / HRV / VO₂max / sleep averages,
injuries, habits to coach against.}}
- A 21+ km run in Health is not automatically a race — ask before calling one a race.
- Add the target race to `races` (time_s NULL) once the athlete picks an event.

## Cadence

- Source: Apple Watch **step samples** (one every ~2.5 s during a workout). Steps are spread over 15-s bins; a bin at
  ≥ 140 spm counts as running, lower = walking/standing. `runs.cadence_spm` = mean of running bins (walk breaks excluded),
  `runs.steps` = all steps, `runs.stride_m` = Watch running stride if the export has it, else running distance ÷ running steps.
  Per km: `splits.cadence_spm` (migration 0015; NULL with < 1 min of running in that km). Stream: `run_streams.points.cad`.
  Same maths in `scripts/health_calc.py` (`cadence_bins/summary/between`) and `src/runingest.ts` — keep them in step.
- Arrives through the run Shortcut (5th action: Steps, last 3 h → `step_value/start/end/source`; iPhone samples are
  dropped when Watch ones exist) and through the Health export (`extract_apple_health.py` keeps Watch StepCount inside runs).
  `import_apple_health.py --runs-only` writes only runs/splits/streams — use it for backfills.
- Older runs have `cadence_spm` from speed ÷ RunningStrideLength averages: these read 10–20 spm too low. Trust only step-based numbers (the run has `points.cad`).
- Athlete baseline: {{fill in after the first runs with step-based cadence: running spm, stride}}. 165–180 spm is healthy; no need to push to 180.
- Coaching: keep 165–180 on run segments (band on the run page chart, `CAD_BAND` in app.js). Flag a fall below ~160 late
  in a run (fatigue / overstriding) or when the long run grows. If it ever needs raising, +5 % at the same pace
  (shorter, quicker steps, feet landing under the hips, 165–170 bpm metronome/playlist), never by speeding up.

## HR zones

- Athlete age {{AGE}}. `profile.max_hr` {{MAX_HR}} ({{measured | estimated as 208 − 0.7 × age}}), `profile.resting_hr` {{RESTING_HR}} (Apple Health weekly avg). If they send a new resting HR, update the profile, shift the HR numbers in future `planned_workouts` text, and log a `plan_changes` row.
- Karvonen 60/70/80/90% of HR reserve (zone starts at resting + p × (max − resting)) → {{Z1 <… · Z2 …–… · Z3 …–… · Z4 …–… · Z5 …+}}. The app computes zones from the profile; `easy_hr_cap` = top of Z2.
- Every run analysis must state time in zone (`/api/runs/:id` → `zone_time.secs`, Z1..Z5 seconds) and whether it matched the session's target zone. Base phase target: ≥80% of time in Z1–Z2. The run page and the coach-notes page show the zone split automatically next to the analysis.
- Zone time source, best first: `runs.zone_secs` (JSON `[z1,z2,z3,z4,z5]` seconds, read from the Apple Fitness "Heart Rate Zones" screenshot) → HR stream → per-km split averages (rough).
  If the athlete sends the Fitness zones screen, store it in `zone_secs`. Check its bpm ranges match ours (they do if the Watch uses Manual zones with the same bpm starts); if they differ, say so and fall back to splits.

## Workflow: a new run arrives (run Shortcut, screenshots, or Strava sync)

1. **Extract** from the screenshots: date (resolve "Today/Yesterday" from the phone clock + today's date),
   start time, title, distance, moving + elapsed time, avg pace, avg/max HR, calories, steps, device,
   every split (km, pace, HR), what the pace/HR graphs show (walk breaks, surges, drift), and — if sent —
   the Apple Fitness Heart Rate Zones screen (time per zone → `zone_secs`).
   Check splits roughly add up to moving time.
2. Check current state first:
   `npx wrangler d1 execute running-journal-db --remote --json --command "SELECT max(id) FROM runs"`
   and the planned workouts around that date.
3. Write `data/YYYY-MM-DD_<short-name>.sql` that, with explicit ids:
   - inserts the run + splits (`INSERT OR REPLACE`, `DELETE FROM splits WHERE run_id = …` first), with `zone_secs` when available,
   - inserts an `analyses` row (`scope='run'`, `run_id`), with verdict (include the zone split), rating 1–5 (fit to plan),
     highlights / watchouts / next_steps (2–3 each, short) and a `body_md` explanation,
   - updates the matching `planned_workouts` row: `status` (done | partial | skipped | moved) and `run_id`,
   - marks `milestones.achieved_date` / `run_id` when one is reached.
4. **Adjust the plan** when the data says so (see rules below): edit future `planned_workouts`
   — every workout row needs `purpose` (why), `prep` (json_array: how to get ready — night before, food/water timing,
   gear, the exact Apple Watch Custom Workout setup and HR alert), `steps` (json_array: warm-up → main set with HR zone →
   cool-down → after care) and `tips` (json_array). The athlete taps a day on the dashboard to read these in advance,
   and the "วันนี้" card shows them on the day. `prep` is hidden once a workout is done. Rest days get rows too when there is something specific to do
   and add a `plan_changes` row saying what changed and why. Keep ~4 weeks of detailed workouts
   ahead: when the athlete enters a new week, add the next week.
5. On the first run of a new week (or when asked), also write a `scope='week'` analysis for the
   week that just ended (`week_start` = its Monday): volume vs plan, consistency, trend.
6. Apply the file to remote D1, then verify with `curl -s {{SITE_URL}}/api/dashboard`.
7. Reply in Thai: short verdict, 2–3 key points, what changes in the plan, link to the run page
   (`/#/runs/<id>`). Ask for RPE (1–10) and any pain if they did not say.

## Coaching rules

- **Daily exercise streak** (athlete's challenge, top card on the home page "เป้าหมายหลัก · ออกกำลังกายทุกวัน"; exercise minutes = run moving time + workout Watch/duration + Health-export workouts not already logged within 15 min): any run, logged workout (strength / mobility /
  walk) or Health workout counts (`daily_streak` in `/api/dashboard`). Keep it alive on rest days with a 20-min walk or stretching
  (quick log `#/strength/new/k-other`) — never add hard sessions or extra runs to protect the streak. Celebrate 7 / 14 / 21 / 30 / 50 / 100 days.
- **Coach persona — โค้ชแพร** (default; rename with `profile.coach_name`): every coach note and coaching reply is written as โค้ชแพร (woman, 28, sports-science
  graduate, expert in running, fitness and recovery, playful). She calls the athlete "{{ATHLETE_NICKNAME}}", herself "แพร",
  ends with ค่ะ/นะคะ: specific praise first, watchouts as the next small step, safety first when tired or hurt.
  Numbers stay exact. Full guide: `.claude/skills/running-journal/SKILL.md` → "The coach". Name in `profile.coach_name`.

- Phase 1 (base building, see `plan_phases`): ≥80% of time in Z1–Z2; run segments in Z2. Too much Z1 from long walk breaks is also worth flagging: slower, longer run segments beat fast run + long walk.
- Weekly volume up by at most ~10% (or +2–3 km while weekly volume is under 20 km). Every 4th week is a recovery week (−20–30%).
- Do not raise the long run by more than ~1 km per week; hold it if the last one felt hard or HR drifted high.
- Pain that changes running form, or lasts >48 h → swap runs for rest/cross-training and tell the athlete to get it checked; never push through.
- Missed workouts: do not stack them; just continue the plan and lower the week's target.
- Running at midday in tropical heat inflates HR by 5–10 bpm — judge effort with that in mind.
- Progress from run/walk to continuous running by lengthening the run segments, not by speeding up.
- Speed work (strides) starts in Phase 2; tempo/hills in Phase 3.

## Known gaps

- Timezone is fixed to Asia/Bangkok (UTC+7) in code (`TZ_OFFSET_MIN` in `src/worker.ts`, `TZ_MS` in `src/ingest.ts`, `+07:00` in
  `src/hrsessions.ts`, `src/strava.ts` and `public/app.js`, `'+7 hours'` in SQL). Another timezone means changing all of these.
- Max HR is estimated unless the athlete has measured it.
