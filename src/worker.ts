// Running Journal — Cloudflare Worker
// Serves the static app from /public and a read-only JSON API from D1.
// Data is written by Claude with `wrangler d1 execute` (see CLAUDE.md).

import * as strava from "./strava";
import { ingestDaily, ingestStatus, type IngestEnv } from "./ingest";
import { ingestRun } from "./runingest";
import { candidates, linkHr, rescan } from "./hrsessions";
import { authorized, deleteWorkout, listWorkouts, saveFavourites, saveWorkout, workoutDetail } from "./workouts";

interface Env extends strava.StravaEnv, IngestEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

type Row = Record<string, any>;

const TZ_OFFSET_MIN = 7 * 60; // Asia/Bangkok
const BUILD = "2026-11-19-no-truncate-runs";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p.startsWith("/strava/")) {
        if (p === "/strava/connect") return await strava.connect(env, url.origin);
        if (p === "/strava/callback") return await strava.callback(env, url, ctx);
        if (p === "/strava/webhook") {
          return req.method === "POST" ? await strava.webhookEvent(env, req, ctx) : await strava.webhookVerify(env, url);
        }
        return json({ error: "not found" }, 404);
      }
      if (!p.startsWith("/api/")) return env.ASSETS.fetch(req);
      if (p === "/api/strava/sync" && req.method === "POST") return json(await strava.manualSync(env));
      if (p === "/api/ingest/daily" && req.method === "POST") return await ingestDaily(env, req);
      if (p === "/api/ingest/run" && req.method === "POST") return await ingestRun(env, req);
      if (p === "/api/auth/check" && req.method === "POST") return authorized(env, req) ? json({ ok: true }) : json({ ok: false }, 401);
      if (p === "/api/workouts" && req.method === "POST") return await saveWorkout(env, req);
      if (p === "/api/settings/favourites" && req.method === "POST") return await saveFavourites(env, req);
      if (p === "/api/hr-sessions/rescan" && req.method === "POST") return await rescan(env, req);
      const wh = p.match(/^\/api\/workouts\/(\d+)\/hr$/);
      if (wh && req.method === "POST") return await linkHr(env, req, Number(wh[1]));
      const wd = p.match(/^\/api\/workouts\/(\d+)$/);
      if (wd && req.method === "DELETE") return await deleteWorkout(env, req, Number(wd[1]));
      if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
      return await route(url, env);
    } catch (err) {
      console.error(err);
      return json({ error: "server error" }, 500);
    }
  },

  // Backup for missed webhooks; also finishes the first backfill in batches.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(strava.sync(env, 15).then((r) => console.log("cron sync", JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;

async function route(url: URL, env: Env): Promise<Response> {
  const p = url.pathname.replace(/\/+$/, "");
  if (p === "/api/dashboard") return json(await dashboard(env));
  if (p === "/api/runs") return json(await listRuns(env));
  const m = p.match(/^\/api\/runs\/(\d+)$/);
  if (m) {
    const run = await runDetail(env, Number(m[1]));
    return run ? json(run) : json({ error: "not found" }, 404);
  }
  if (p === "/api/plan") return json(await plan(env));
  if (p === "/api/workouts") return json(await listWorkouts(env));
  const wm = p.match(/^\/api\/workouts\/(\d+)$/);
  if (wm) {
    const w = await workoutDetail(env, Number(wm[1]));
    return w ? json({ ...w, zones: zoneDefs(await profileMap(env)) }) : json({ error: "not found" }, 404);
  }
  if (p === "/api/hr-sessions") {
    const date = url.searchParams.get("date") || todayLocal();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bad date" }, 400);
    return json(await candidates(env, date, Math.min(3, Math.max(0, Number(url.searchParams.get("days") ?? 1) || 0))));
  }
  if (p === "/api/notes") return json(await notes(env));
  if (p === "/api/strava/status") return json(await strava.status(env));
  if (p === "/api/health") return json(await health(env));
  const sn = p.match(/^\/api\/sleep\/night\/(\d{4}-\d{2}-\d{2})$/);
  if (sn) {
    const [night, detail, prev, next] = await Promise.all([
      first(env, "SELECT * FROM daily_metrics WHERE date = ?", sn[1]),
      first(env, "SELECT start_ms, segments, hr FROM sleep_detail WHERE date = ?", sn[1]),
      first(env, "SELECT max(date) AS d FROM daily_metrics WHERE sleep_min IS NOT NULL AND date < ?", sn[1]),
      first(env, "SELECT min(date) AS d FROM daily_metrics WHERE sleep_min IS NOT NULL AND date > ?", sn[1]),
    ]);
    if (!night) return json({ error: "not found" }, 404);
    return json({
      night,
      detail: detail ? { start_ms: detail.start_ms, segments: JSON.parse(detail.segments), hr: detail.hr ? JSON.parse(detail.hr) : null } : null,
      prev: prev?.d ?? null, next: next?.d ?? null,
    });
  }
  if (p === "/api/sleep") {
    const nights = await all(env, `SELECT date, sleep_min, deep_min, rem_min, core_min, awake_min, bed_time, wake_time, resting_hr, hrv
      FROM daily_metrics WHERE sleep_min IS NOT NULL AND date >= ? ORDER BY date`, addDays(todayLocal(), -400));
    return json({ today: todayLocal(), nights, note: parseJsonArrays(await first(env, "SELECT * FROM analyses WHERE scope = 'sleep' ORDER BY created_at DESC, id DESC LIMIT 1")) });
  }
  if (p === "/api/ingest/status") return json(await ingestStatus(env));
  return json({ error: "not found" }, 404);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-app-build": BUILD },
  });
}

// ---------- dates (all YYYY-MM-DD strings, Bangkok calendar) ----------

function todayLocal(): string {
  return new Date(Date.now() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}
function toDate(d: string): Date {
  return new Date(d + "T00:00:00Z");
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}
function weekStart(d: string): string {
  const dow = (toDate(d).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(d, -dow);
}
function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

const RUN_KINDS = new Set(["easy", "runwalk", "long", "strides", "tempo", "interval", "test", "race", "recovery"]);

function parseJsonArrays(r: Row | null): Row | null {
  if (!r) return r;
  for (const k of ["highlights", "watchouts", "next_steps", "key_sessions", "steps", "tips", "prep"]) {
    if (typeof r[k] === "string") {
      try { r[k] = JSON.parse(r[k]); } catch { r[k] = [r[k]]; }
    }
  }
  return r;
}

async function all(env: Env, sql: string, ...binds: unknown[]): Promise<Row[]> {
  const res = await env.DB.prepare(sql).bind(...binds).all();
  return res.results as Row[];
}
async function first(env: Env, sql: string, ...binds: unknown[]): Promise<Row | null> {
  return (await env.DB.prepare(sql).bind(...binds).first()) as Row | null;
}

async function profileMap(env: Env): Promise<Record<string, string>> {
  const rows = await all(env, "SELECT key, value FROM profile");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ---------- heart-rate zones (Karvonen / heart-rate reserve) ----------

type Zone = { z: number; name: string; lo: number; hi: number | null };
const ZONE_NAMES = ["ฟื้นตัว", "แอโรบิกเบา", "แอโรบิกกลาง", "Threshold", "VO2max"];
const ZONE_PCT = [0.5, 0.6, 0.7, 0.8, 0.9];

function zoneDefs(profile: Record<string, string>): Zone[] {
  const max = Number(profile.max_hr) || 178;
  const rest = Number(profile.resting_hr) || 65;
  const hrr = max - rest;
  const starts = ZONE_PCT.map((p, i) => (i === 0 ? 0 : Math.floor(rest + p * hrr) + 1));
  return ZONE_NAMES.map((name, i) => ({ z: i + 1, name, lo: starts[i], hi: i < 4 ? starts[i + 1] - 1 : null }));
}
function zoneOf(hr: number, zones: Zone[]): number {
  for (let i = zones.length - 1; i >= 0; i--) if (hr >= zones[i].lo) return i;
  return 0;
}
/** Seconds in each zone: Apple Watch numbers if logged, else the HR stream, else per-km splits. */
function zoneTime(zones: Zone[], points: Row | null, splits: Row[], watch?: string | null) {
  if (watch) {
    try {
      const w = JSON.parse(watch);
      if (Array.isArray(w) && w.length === 5) return { secs: w.map(Number), source: "watch" };
    } catch { /* fall through to estimates */ }
  }
  const secs = [0, 0, 0, 0, 0];
  if (points?.hr?.length && points?.t?.length) {
    for (let i = 0; i < points.hr.length - 1; i++) {
      const dt = points.t[i + 1] - points.t[i];
      if (dt > 0 && dt < 120 && points.hr[i]) secs[zoneOf(points.hr[i], zones)] += dt;
    }
    return { secs, source: "stream" };
  }
  for (const s of splits) if (s.avg_hr) secs[zoneOf(s.avg_hr, zones)] += Math.round(s.pace_s * s.distance_km);
  return { secs, source: splits.length ? "splits" : "none" };
}

// ---------- readiness from Apple Health daily metrics ----------

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Compares the latest day with the 30 days before it. Null when there is no recent data. */
async function readiness(env: Env, today: string) {
  const rows = await all(env, "SELECT * FROM daily_metrics WHERE date BETWEEN ? AND ? ORDER BY date", addDays(today, -40), today);
  const latest = [...rows].reverse().find((r) => r.resting_hr != null || r.hrv != null);
  if (!latest) return null;
  const base = rows.filter((r) => r.date < latest.date && r.date >= addDays(latest.date, -30));
  const last3 = rows.filter((r) => r.date <= latest.date && r.date > addDays(latest.date, -3));
  const last7 = rows.filter((r) => r.date <= latest.date && r.date > addDays(latest.date, -7));
  const out = {
    date: latest.date,
    stale_days: daysBetween(latest.date, today),
    rhr: latest.resting_hr, rhr_base: avg(base.map((r) => r.resting_hr)),
    hrv: avg(last3.map((r) => r.hrv)), hrv_base: avg(base.map((r) => r.hrv)),
    sleep_min: latest.sleep_min, sleep_avg7: avg(last7.map((r) => r.sleep_min)),
    flags: [] as string[], status: "good",
  };
  if (out.rhr != null && out.rhr_base != null && out.rhr >= out.rhr_base + 4) out.flags.push("rhr");
  if (out.hrv != null && out.hrv_base != null && out.hrv <= out.hrv_base * 0.85) out.flags.push("hrv");
  if (out.sleep_min != null && out.sleep_min < 390) out.flags.push("sleep");
  out.status = out.flags.length >= 2 ? "low" : out.flags.length === 1 ? "fair" : "good";
  return out;
}

async function health(env: Env) {
  const today = todayLocal();
  const [daily, years, ready, profile, weeks, races] = await Promise.all([
    all(env, `SELECT date, resting_hr, hrv, vo2max, sleep_min, walking_hr, hrr1 FROM daily_metrics
              WHERE resting_hr IS NOT NULL OR hrv IS NOT NULL OR vo2max IS NOT NULL OR sleep_min IS NOT NULL ORDER BY date`),
    all(env, "SELECT * FROM running_years ORDER BY year"),
    readiness(env, today),
    profileMap(env),
    all(env, "SELECT run_date, distance_km, moving_time_s, indoor FROM runs WHERE run_date >= ? ORDER BY run_date", addDays(today, -365)),
    all(env, "SELECT * FROM races ORDER BY race_date"),
  ]);
  const dayNote = parseJsonArrays(await first(env, "SELECT * FROM analyses WHERE scope = 'day' ORDER BY for_date DESC, id DESC LIMIT 1"));
  return { today, daily, years, readiness: ready, profile, runs: weeks, races, day_note: dayNote };
}

// ---------- streaks ----------

/** Daily exercise streak: any run, logged workout (strength / mobility / walk) or Health workout counts.
 * Today without activity yet doesn't break the streak until the day ends. */
function dailyStreak(acts: Row[], today: string) {
  const by = new Map<string, Set<string>>();
  for (const a of acts) if (a.d && a.d <= today) (by.get(a.d) ?? by.set(a.d, new Set()).get(a.d)!).add(a.t);
  let cursor = by.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (by.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  let best = 0, run = 0, prev: string | null = null;
  for (const d of [...by.keys()].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const days: Row[] = [];
  for (let i = 34; i >= 0; i--) { const d = addDays(today, -i); days.push({ date: d, types: [...(by.get(d) ?? [])] }); }
  const goals = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
  const last30 = days.slice(-30).filter((x) => x.types.length).length;
  return { current, best, today_active: by.has(today), days, next_goal: goals.find((g) => g > current) ?? current + 100, active_30: last30 };
}

function weeklyStreak(runDates: string[], today: string) {
  const weeks = new Set(runDates.map(weekStart));
  const thisWeek = weekStart(today);
  // A week without a run yet doesn't break the streak until it ends.
  let cursor = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let current = 0;
  while (weeks.has(cursor)) {
    current++;
    cursor = addDays(cursor, -7);
  }
  const sorted = [...weeks].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of sorted) {
    run = prev && addDays(prev, 7) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best, active_this_week: weeks.has(thisWeek) };
}

// ---------- races ----------

/** Earliest future race (no finish time yet) other than the goal half, with its countdown and goals A/B/C parsed from notes ("A: …· B: …"). */
async function nextUpcomingRace(env: Env, today: string, goalDate: string | undefined) {
  const r = await first(env,
    "SELECT id, race_date, name, distance_km, location, notes FROM races WHERE race_date >= ? AND time_s IS NULL AND race_date <> ? ORDER BY race_date, id LIMIT 1",
    today, goalDate ?? "");
  if (!r) return null;
  // split notes on "·" outside brackets, e.g. "C: ต่ำกว่า 1:15 (เป้าหลัก · เพซ 7:30/กม.)" stays one part
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of String(r.notes ?? "")) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "·" && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  const goals: Record<string, string> = {};
  for (const part of parts) {
    const m = part.trim().match(/^([ABC])\s*:\s*(.+)$/);
    if (m) goals[m[1]] = m[2].trim();
  }
  // the athlete's own target is the goal tagged "เป้าหลัก" in its brackets (else none)
  const mainGoal = (["A", "B", "C"] as const).find((k) => goals[k]?.includes("เป้าหลัก")) ?? null;
  return { ...r, days_to: daysBetween(today, r.race_date), goals, main_goal: mainGoal };
}

// ---------- endpoints ----------

async function dashboard(env: Env) {
  const today = todayLocal();
  const thisWeek = weekStart(today);
  const [profile, runs, phases, milestones, fastest, latestNote, weekPlan, upcoming, plannedByWeek] = await Promise.all([
    profileMap(env),
    all(env, `SELECT id, run_date, start_time, title, run_type, distance_km, moving_time_s, avg_pace_s, avg_hr, zone_secs
              FROM runs ORDER BY run_date, start_time`),
    all(env, "SELECT * FROM plan_phases ORDER BY start_date"),
    all(env, "SELECT * FROM milestones ORDER BY sort"),
    first(env, `SELECT s.pace_s, s.run_id, r.run_date FROM splits s JOIN runs r ON r.id = s.run_id
                WHERE s.distance_km >= 0.95 ORDER BY s.pace_s LIMIT 1`),
    first(env, "SELECT * FROM analyses ORDER BY created_at DESC, id DESC LIMIT 1"),
    all(env, "SELECT * FROM planned_workouts WHERE workout_date BETWEEN ? AND ? ORDER BY workout_date, id", thisWeek, addDays(thisWeek, 6)),
    all(env, `SELECT * FROM planned_workouts WHERE workout_date >= ? AND status = 'planned' AND kind <> 'rest'
              ORDER BY workout_date, id LIMIT 4`, today),
    all(env, `SELECT workout_date, kind, target_km FROM planned_workouts WHERE target_km IS NOT NULL`),
  ]);
  const since = addDays(today, -27);
  const [otherThisWeek, stravaStatus, todayPlan, nextPlan, zSplits, zStreams, workoutsThisWeek] = await Promise.all([
    all(env, "SELECT * FROM other_activities WHERE activity_date BETWEEN ? AND ? ORDER BY activity_date", thisWeek, addDays(thisWeek, 6)),
    strava.status(env),
    all(env, "SELECT * FROM planned_workouts WHERE workout_date = ? ORDER BY id", today),
    first(env, "SELECT * FROM planned_workouts WHERE workout_date > ? AND kind <> 'rest' ORDER BY workout_date, id LIMIT 1", today),
    all(env, "SELECT s.* FROM splits s JOIN runs r ON r.id = s.run_id WHERE r.run_date >= ?", since),
    all(env, "SELECT rs.run_id, rs.points FROM run_streams rs JOIN runs r ON r.id = rs.run_id WHERE r.run_date >= ?", since),
    all(env, "SELECT workout_date, start_time, kind, duration_min, watch_secs FROM workouts WHERE workout_date BETWEEN ? AND ?", thisWeek, addDays(thisWeek, 6)),
  ]);
  const zones = zoneDefs(profile);
  const zone4w = [0, 0, 0, 0, 0];
  const streamBy = new Map(zStreams.map((x) => [x.run_id, JSON.parse(x.points)]));
  for (const r of runs.filter((r) => r.run_date >= since)) {
    const zt = zoneTime(zones, streamBy.get(r.id) ?? null, zSplits.filter((s) => s.run_id === r.id), r.zone_secs);
    zt.secs.forEach((v, i) => (zone4w[i] += v));
  }
  todayPlan.forEach(parseJsonArrays);
  weekPlan.forEach(parseJsonArrays);
  upcoming.forEach(parseJsonArrays);
  parseJsonArrays(nextPlan);

  // Weekly volume: 16 weeks back + 4 ahead (planned)
  const weekly: Row[] = [];
  for (let i = -15; i <= 4; i++) {
    const ws = addDays(thisWeek, i * 7);
    weekly.push({ week_start: ws, km: 0, runs: 0, time_s: 0, planned_km: 0 });
  }
  const byWeek = new Map(weekly.map((w) => [w.week_start, w]));
  for (const r of runs) {
    const w = byWeek.get(weekStart(r.run_date));
    if (w) { w.km += r.distance_km; w.runs++; w.time_s += r.moving_time_s; }
  }
  for (const pw of plannedByWeek) {
    if (!RUN_KINDS.has(pw.kind)) continue;
    const w = byWeek.get(weekStart(pw.workout_date));
    if (w) w.planned_km += pw.target_km;
  }
  for (const w of weekly) { w.km = round(w.km, 2); w.planned_km = round(w.planned_km, 1); }

  const thisWeekRuns = runs.filter((r) => weekStart(r.run_date) === thisWeek);
  const totals = {
    runs: runs.length,
    km: round(runs.reduce((s, r) => s + r.distance_km, 0), 2),
    time_s: runs.reduce((s, r) => s + r.moving_time_s, 0),
  };
  // Home summary: km since the athlete started this journal + every minute of exercise this week.
  const journalStart = profile.journal_start || today;
  const journalRuns = runs.filter((r) => r.run_date >= journalStart);
  const minsOf = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
  const near = (date: string, time: string | null, list: { d: string; t: string | null }[]) =>
    list.some((x) => x.d === date && minsOf(x.t) != null && minsOf(time) != null && Math.abs(minsOf(x.t)! - minsOf(time)!) <= 15);
  const logged = [...thisWeekRuns.map((r) => ({ d: r.run_date, t: r.start_time })), ...workoutsThisWeek.map((w) => ({ d: w.workout_date, t: w.start_time }))];
  const activeMin = { run: 0, strength: 0, other: 0 };
  for (const r of thisWeekRuns) activeMin.run += (r.moving_time_s || 0) / 60;
  for (const w of workoutsThisWeek) activeMin[w.kind === "strength" || !w.kind ? "strength" : "other"] += w.watch_secs ? w.watch_secs / 60 : w.duration_min || 0;
  // Health-export workouts count unless the same session is already logged as a run or workout (start within 15 min).
  for (const a of otherThisWeek) {
    if (/run/i.test(a.sport_type || "") || near(a.activity_date, a.start_time, logged)) continue;
    activeMin[/strength|weight/i.test(a.sport_type || "") ? "strength" : "other"] += (a.moving_time_s || 0) / 60;
  }
  const longest = runs.reduce<Row | null>((b, r) => (!b || r.distance_km > b.distance_km ? r : b), null);
  const longestTime = runs.reduce<Row | null>((b, r) => (!b || r.moving_time_s > b.moving_time_s ? r : b), null);
  const bestPace = runs
    .filter((r) => r.distance_km >= 3)
    .reduce<Row | null>((b, r) => (!b || r.avg_pace_s < b.avg_pace_s ? r : b), null);

  const currentPhase = phases.find((ph) => ph.start_date <= today && today <= ph.end_date) ?? null;
  const raceDate = profile.goal_race_date;
  const nextRace = await nextUpcomingRace(env, today, raceDate);

  // Last 26 weeks of daily km for the heatmap
  const heatStart = addDays(thisWeek, -25 * 7);
  const daily: Record<string, number> = {};
  for (const r of runs) if (r.run_date >= heatStart) daily[r.run_date] = round((daily[r.run_date] ?? 0) + r.distance_km, 2);

  return {
    today,
    week_start: thisWeek,
    profile,
    days_to_race: raceDate ? daysBetween(today, raceDate) : null,
    next_race: nextRace,
    streak: weeklyStreak(runs.map((r) => r.run_date), today),
    daily_streak: dailyStreak(await all(env, `SELECT run_date AS d, 'run' AS t FROM runs
      UNION ALL SELECT workout_date, COALESCE(kind, 'strength') FROM workouts
      UNION ALL SELECT activity_date, CASE WHEN sport_type LIKE '%Strength%' OR sport_type LIKE '%Weight%' THEN 'strength' ELSE 'other' END FROM other_activities`), today),
    this_week: {
      km: round(thisWeekRuns.reduce((s, r) => s + r.distance_km, 0), 2),
      time_s: thisWeekRuns.reduce((s, r) => s + r.moving_time_s, 0),
      runs: thisWeekRuns,
      planned: weekPlan,
      other: otherThisWeek,
      planned_km: round(weekPlan.filter((w) => RUN_KINDS.has(w.kind)).reduce((s, w) => s + (w.target_km ?? 0), 0), 1),
    },
    upcoming,
    weekly,
    heatmap: { start: heatStart, daily },
    totals,
    summary: {
      journal_start: journalStart,
      journal_km: round(journalRuns.reduce((s, r) => s + r.distance_km, 0), 2),
      journal_runs: journalRuns.length,
      active_min: {
        total: Math.round(activeMin.run + activeMin.strength + activeMin.other),
        run: Math.round(activeMin.run), strength: Math.round(activeMin.strength), other: Math.round(activeMin.other),
      },
    },
    records: {
      longest_run: longest,
      longest_time: longestTime,
      best_avg_pace: bestPace,
      fastest_km: fastest,
    },
    phases,
    current_phase: currentPhase,
    milestones,
    latest_note: parseJsonArrays(latestNote),
    recent_runs: runs.slice(-5).reverse(),
    strava: stravaStatus,
    readiness: await readiness(env, today),
    today_workouts: await all(env, "SELECT w.id, w.title, w.duration_min, w.avg_hr, (SELECT count(DISTINCT exercise) FROM workout_sets s WHERE s.workout_id = w.id) AS n_ex FROM workouts w WHERE w.workout_date = ? ORDER BY w.id", today),
    today_note: parseJsonArrays(await first(env, "SELECT * FROM analyses WHERE scope = 'day' AND for_date = ? ORDER BY id DESC LIMIT 1", today)),
    zones,
    zone_4w: zone4w,
    today_plan: todayPlan,
    today_runs: runs.filter((r) => r.run_date === today),
    next_plan: nextPlan,
  };
}

async function listRuns(env: Env) {
  const [rows, st, profile, streams] = await Promise.all([
    runRows(env), strava.status(env), profileMap(env), all(env, "SELECT run_id, points FROM run_streams"),
  ]);
  const zones = zoneDefs(profile);
  const byRun = new Map(streams.map((x) => [x.run_id, JSON.parse(x.points)]));
  for (const r of rows) (r as Row).zone_time = zoneTime(zones, byRun.get(r.id) ?? null, r.splits, r.zone_secs);
  return { runs: rows, strava: st, zones };
}

async function runRows(env: Env) {
  const runs = await all(env, "SELECT * FROM runs ORDER BY run_date DESC, start_time DESC");
  const splits = await all(env, "SELECT run_id, split_no, distance_km, pace_s, avg_hr FROM splits ORDER BY run_id, split_no");
  const verdicts = await all(env, "SELECT run_id, verdict, rating FROM analyses WHERE scope = 'run'");
  const byRun = new Map<number, Row[]>();
  for (const s of splits) {
    if (!byRun.has(s.run_id)) byRun.set(s.run_id, []);
    byRun.get(s.run_id)!.push(s);
  }
  const v = new Map(verdicts.map((x) => [x.run_id, x]));
  return runs.map((r): Row => ({ ...r, splits: byRun.get(r.id) ?? [], verdict: v.get(r.id)?.verdict ?? null, rating: v.get(r.id)?.rating ?? null }));
}

async function runDetail(env: Env, id: number) {
  const run = await first(env, "SELECT * FROM runs WHERE id = ?", id);
  if (!run) return null;
  const [splits, analysis, planned, prev, next, profile, stream] = await Promise.all([
    all(env, "SELECT * FROM splits WHERE run_id = ? ORDER BY split_no", id),
    first(env, "SELECT * FROM analyses WHERE run_id = ? ORDER BY created_at DESC LIMIT 1", id),
    first(env, "SELECT * FROM planned_workouts WHERE run_id = ?", id),
    first(env, "SELECT id, run_date FROM runs WHERE run_date < ? OR (run_date = ? AND id < ?) ORDER BY run_date DESC, id DESC LIMIT 1", run.run_date, run.run_date, id),
    first(env, "SELECT id, run_date FROM runs WHERE run_date > ? OR (run_date = ? AND id > ?) ORDER BY run_date, id LIMIT 1", run.run_date, run.run_date, id),
    profileMap(env),
    first(env, "SELECT points FROM run_streams WHERE run_id = ?", id),
  ]);
  const points = stream ? JSON.parse(stream.points) : null;
  const zones = zoneDefs(profile);
  parseJsonArrays(planned);
  return { run, splits, analysis: parseJsonArrays(analysis), planned, prev, next, profile, points, zones, zone_time: zoneTime(zones, points, splits, run.zone_secs) };
}

async function plan(env: Env) {
  const today = todayLocal();
  const [profile, phases, workouts, changes, milestones, runs] = await Promise.all([
    profileMap(env),
    all(env, "SELECT * FROM plan_phases ORDER BY start_date"),
    all(env, "SELECT * FROM planned_workouts ORDER BY workout_date, id"),
    all(env, "SELECT * FROM plan_changes ORDER BY changed_on DESC, id DESC"),
    all(env, "SELECT * FROM milestones ORDER BY sort"),
    all(env, "SELECT id, run_date, distance_km, moving_time_s, avg_pace_s, avg_hr, title FROM runs ORDER BY run_date"),
  ]);
  phases.forEach(parseJsonArrays);
  workouts.forEach(parseJsonArrays);
  return { today, week_start: weekStart(today), profile, phases, workouts, changes, milestones, runs, zones: zoneDefs(profile) };
}

async function notes(env: Env) {
  const rows = await all(
    env,
    `SELECT a.*, r.run_date, r.distance_km, r.title AS run_title, r.zone_secs, wk.workout_date FROM analyses a
     LEFT JOIN runs r ON r.id = a.run_id LEFT JOIN workouts wk ON wk.id = a.workout_id ORDER BY a.created_at DESC, a.id DESC`,
  );
  const [profile, splits, streams] = await Promise.all([
    profileMap(env),
    all(env, "SELECT * FROM splits ORDER BY run_id, split_no"),
    all(env, "SELECT run_id, points FROM run_streams"),
  ]);
  const zones = zoneDefs(profile);
  const streamBy = new Map(streams.map((x) => [x.run_id, JSON.parse(x.points)]));
  for (const r of rows) {
    if (r.run_id) r.zone_time = zoneTime(zones, streamBy.get(r.run_id) ?? null, splits.filter((s) => s.run_id === r.run_id), r.zone_secs);
    delete r.zone_secs;
  }
  return { notes: rows.map(parseJsonArrays), zones, coach_name: profile.coach_name || null };
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
