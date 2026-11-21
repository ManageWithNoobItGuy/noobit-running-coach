// Heart-rate sessions (Apple Watch workouts) that strength / mobility logs link to — at the time or after the fact.
// Stored in hr_sessions by the run Shortcut (attachWatchWorkout) and the morning Shortcut (dense HR clusters);
// Apple Health export workouts (other_activities, negative ids) are offered too and copied in when linked.

import { bkkDate, type IngestEnv } from "./ingest";
import { parseSessions, type WatchWorkout } from "./runingest";
import { authorized } from "./workouts";

type Row = Record<string, any>;
const RANK: Record<string, number> = { watch: 3, daily: 2, export: 1 };
const DAY = 86_400_000;
const bkkMs = (date: string, time = "00:00") => Date.parse(`${date}T${time}:00+07:00`);

/** Insert a session, or update the stored one it overlaps (≥ 50 % of the shorter one) when this source is as good or better. */
export async function upsertSession(env: IngestEnv, w: WatchWorkout, source: "watch" | "daily"): Promise<number> {
  const end = w.start_ms + w.secs * 1000;
  const near = (await env.DB.prepare(
    "SELECT id, start_ms, secs, source FROM hr_sessions WHERE start_ms < ? AND start_ms + secs * 1000 > ?",
  ).bind(end, w.start_ms).all()).results as Row[];
  const same = near.find((s) => {
    const ov = Math.min(end, s.start_ms + s.secs * 1000) - Math.max(w.start_ms, s.start_ms);
    return ov >= 0.5 * Math.min(w.secs, s.secs) * 1000;
  });
  const vals = [w.start_ms, w.secs, w.avg_hr, w.max_hr, w.kcal, JSON.stringify(w.hr), source];
  if (same) {
    // A copy cut by the Shortcut's time window (>10 % shorter) never replaces the stored session, whatever its source.
    if ((RANK[source] ?? 0) >= (RANK[same.source] ?? 0) && w.secs >= 0.9 * same.secs) {
      await env.DB.prepare("UPDATE hr_sessions SET start_ms = ?, secs = ?, avg_hr = ?, max_hr = ?, kcal = COALESCE(?, kcal), hr = ?, source = ? WHERE id = ?")
        .bind(...vals, same.id).run();
      // A workout linked to it gets the better numbers too.
      await env.DB.prepare(`UPDATE workouts SET watch_start_ms = ?, watch_secs = ?, avg_hr = ?, max_hr = ?, calories = COALESCE(?, calories), hr = ?
        WHERE hr_session_id = ?`).bind(w.start_ms, w.secs, w.avg_hr, w.max_hr, w.kcal, JSON.stringify(w.hr), same.id).run();
    }
    return same.id;
  }
  const r = (await env.DB.prepare(
    "INSERT INTO hr_sessions (start_ms, secs, avg_hr, max_hr, kcal, hr, source) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
  ).bind(...vals).first()) as Row;
  return r.id;
}

/** Morning Shortcut: yesterday's heart-rate samples hold every Watch workout as a dense cluster. */
export async function storeDailySessions(env: IngestEnv, body: Row): Promise<number> {
  const found = parseSessions(body).filter((s) => s.type === "workout") as { type: "workout"; workout: WatchWorkout }[];
  for (const s of found) await upsertSession(env, s.workout, "daily");
  return found.length;
}

/** Re-read the stored Shortcut payloads (the ones still complete) for sessions. Bearer token. */
export async function rescan(env: IngestEnv, req: Request): Promise<Response> {
  if (!authorized(env, req)) return Response.json({ ok: false, message: "รหัสบันทึกไม่ถูกต้อง" }, { status: 401 });
  const logs = (await env.DB.prepare("SELECT id, kind, payload FROM ingest_log ORDER BY id").all()).results as Row[];
  let n = 0, skipped = 0;
  for (const l of logs) {
    let body: Row;
    try { body = JSON.parse(l.payload); } catch { skipped++; continue; }
    const found = parseSessions(body).filter((s) => s.type === "workout") as { type: "workout"; workout: WatchWorkout }[];
    for (const s of found) { await upsertSession(env, s.workout, l.kind === "run" ? "watch" : "daily"); n++; }
  }
  return Response.json({ ok: true, sessions: n, skipped_payloads: skipped });
}

const unlinkSql = "hr_session_id = NULL, watch_start_ms = NULL, watch_secs = NULL, avg_hr = NULL, max_hr = NULL, calories = NULL, hr = NULL";

/**
 * Sessions to pick from for one day ± `days`: stored sessions + Apple Health export workouts not stored yet.
 * Sessions that overlap a logged run are marked (they are the run, not a gym session).
 */
export async function candidates(env: IngestEnv, date: string, days = 1) {
  const from = bkkMs(date) - days * DAY, to = bkkMs(date) + (days + 1) * DAY;
  const dFrom = bkkDate(from), dTo = bkkDate(to - 1);
  const [stored, exp, runs, wks] = await Promise.all([
    env.DB.prepare("SELECT id, start_ms, secs, avg_hr, max_hr, kcal, source, sport, ref, hr IS NOT NULL AS has_hr FROM hr_sessions WHERE start_ms >= ? AND start_ms < ?").bind(from, to).all(),
    env.DB.prepare("SELECT strava_id, activity_date, start_time, sport_type, moving_time_s, avg_hr FROM other_activities WHERE activity_date BETWEEN ? AND ? AND start_time IS NOT NULL").bind(dFrom, dTo).all(),
    env.DB.prepare("SELECT id, run_date, start_time, coalesce(elapsed_time_s, moving_time_s) AS secs FROM runs WHERE run_date BETWEEN ? AND ? AND start_time IS NOT NULL").bind(dFrom, dTo).all(),
    env.DB.prepare("SELECT id, workout_date, title, hr_session_id FROM workouts WHERE hr_session_id IS NOT NULL").all(),
  ]);
  const runWin = (runs.results as Row[]).map((r) => { const s = bkkMs(r.run_date, r.start_time); return { id: r.id, s, e: s + (r.secs || 0) * 1000 }; });
  const linked = new Map((wks.results as Row[]).map((w) => [w.hr_session_id, w]));
  const out: Row[] = [];
  for (const s of stored.results as Row[]) {
    const e = s.start_ms + s.secs * 1000;
    const run = runWin.find((r) => r.s < e - 60_000 && r.e > s.start_ms + 60_000 && Math.min(e, r.e) - Math.max(s.start_ms, r.s) > 0.5 * Math.min(e - s.start_ms, r.e - r.s));
    const w = linked.get(s.id);
    out.push({ key: `s:${s.id}`, start_ms: s.start_ms, secs: s.secs, avg_hr: s.avg_hr, max_hr: s.max_hr, kcal: s.kcal, source: s.source, sport: s.sport,
      has_hr: Boolean(s.has_hr), run_id: run?.id ?? null, workout: w ? { id: w.id, date: w.workout_date, title: w.title } : null });
  }
  const storedRefs = new Set((stored.results as Row[]).map((s) => s.ref).filter((x) => x != null));
  for (const a of exp.results as Row[]) {
    if (storedRefs.has(a.strava_id) || /run/i.test(a.sport_type || "")) continue;
    const start = bkkMs(a.activity_date, a.start_time);
    // Same workout already stored from the Watch (better data): skip the export copy.
    if (out.some((o) => Math.abs(o.start_ms - start) < 10 * 60_000)) continue;
    out.push({ key: `oa:${a.strava_id}`, start_ms: start, secs: a.moving_time_s, avg_hr: a.avg_hr, max_hr: null, kcal: null, source: "export",
      sport: a.sport_type, has_hr: false, run_id: null, workout: null });
  }
  return { date, sessions: out.sort((a, b) => a.start_ms - b.start_ms) };
}

/** POST /api/workouts/:id/hr {key: "s:<id>" | "oa:<strava_id>" | null} — link (moving it off any other workout) or unlink. */
export async function linkHr(env: IngestEnv, req: Request, workoutId: number): Promise<Response> {
  if (!authorized(env, req)) return Response.json({ ok: false, message: "รหัสบันทึกไม่ถูกต้อง" }, { status: 401 });
  let b: Row;
  try { b = await req.json(); } catch { b = {}; }
  const wk = await env.DB.prepare("SELECT id FROM workouts WHERE id = ?").bind(workoutId).first();
  if (!wk) return Response.json({ ok: false, message: "ไม่พบบันทึกนี้" }, { status: 404 });
  const key = typeof b.key === "string" ? b.key : null;
  if (!key) {
    await env.DB.prepare(`UPDATE workouts SET ${unlinkSql}, updated_at = datetime('now') WHERE id = ?`).bind(workoutId).run();
    return Response.json({ ok: true, linked: null });
  }
  let sid: number | null = null;
  const m = key.match(/^(s|oa):(-?\d+)$/);
  if (m?.[1] === "s") sid = Number(m[2]);
  else if (m?.[1] === "oa") {
    const a = (await env.DB.prepare("SELECT * FROM other_activities WHERE strava_id = ?").bind(Number(m[2])).first()) as Row | null;
    if (!a) return Response.json({ ok: false, message: "ไม่พบ session นี้" }, { status: 404 });
    const have = (await env.DB.prepare("SELECT id FROM hr_sessions WHERE ref = ?").bind(a.strava_id).first()) as Row | null;
    sid = have?.id ?? ((await env.DB.prepare(
      "INSERT INTO hr_sessions (start_ms, secs, avg_hr, source, sport, ref) VALUES (?, ?, ?, 'export', ?, ?) RETURNING id",
    ).bind(bkkMs(a.activity_date, a.start_time || "00:00"), a.moving_time_s || 0, a.avg_hr, a.sport_type, a.strava_id).first()) as Row).id;
  }
  const s = sid ? ((await env.DB.prepare("SELECT * FROM hr_sessions WHERE id = ?").bind(sid).first()) as Row | null) : null;
  if (!s) return Response.json({ ok: false, message: "ไม่พบ session นี้" }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare(`UPDATE workouts SET ${unlinkSql}, updated_at = datetime('now') WHERE hr_session_id = ? AND id != ?`).bind(s.id, workoutId),
    env.DB.prepare(`UPDATE workouts SET hr_session_id = ?, watch_start_ms = ?, watch_secs = ?, avg_hr = ?, max_hr = ?, calories = ?, hr = ?,
      duration_min = COALESCE(duration_min, ?), updated_at = datetime('now') WHERE id = ?`)
      .bind(s.id, s.start_ms, s.secs, s.avg_hr, s.max_hr, s.kcal, s.hr, Math.max(1, Math.round(s.secs / 60)), workoutId),
  ]);
  return Response.json({ ok: true, linked: s.id });
}
