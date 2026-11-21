// Strength workouts: logged in the web app (sets / reps / weight) and filled with Apple Watch data
// (duration, HR, calories) by the run Shortcut. Writes need the same Bearer token as the Shortcuts.

import { timingSafeEqual, type IngestEnv } from "./ingest";
import { upsertSession } from "./hrsessions";

type Row = Record<string, any>;

export function authorized(env: IngestEnv, req: Request): boolean {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(env.INGEST_TOKEN && token && timingSafeEqual(token, env.INGEST_TOKEN));
}

const deny = () => Response.json({ ok: false, message: "รหัสบันทึกไม่ถูกต้อง" }, { status: 401 });

/** Every workout with its sets (small table: the page computes progress itself). */
export async function listWorkouts(env: IngestEnv) {
  const [w, s] = await Promise.all([
    env.DB.prepare(`SELECT w.*, (SELECT a.id FROM analyses a WHERE a.workout_id = w.id ORDER BY a.id DESC LIMIT 1) AS note_id
                    FROM workouts w ORDER BY w.workout_date DESC, w.start_time DESC, w.id DESC`).all(),
    env.DB.prepare("SELECT * FROM workout_sets ORDER BY workout_id, set_no").all(),
  ]);
  const sets = new Map<number, Row[]>();
  for (const x of s.results as Row[]) (sets.get(x.workout_id) ?? sets.set(x.workout_id, []).get(x.workout_id)!).push(x);
  return { workouts: (w.results as Row[]).map((x) => ({ ...x, hr: undefined, sets: sets.get(x.id) ?? [] })), favourites: await favourites(env) };
}

/** Favourite exercises (profile key fav_exercises, JSON array of exercise ids / "custom:<name>"), shown as quick-add tiles. */
async function favourites(env: IngestEnv): Promise<string[]> {
  const r = (await env.DB.prepare("SELECT value FROM profile WHERE key = 'fav_exercises'").first()) as Row | null;
  try { const v = JSON.parse(r?.value ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

export async function saveFavourites(env: IngestEnv, req: Request): Promise<Response> {
  if (!authorized(env, req)) return deny();
  let b: Row;
  try { b = await req.json(); } catch { b = {}; }
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x: unknown) => text(x, 80)).filter(Boolean))].slice(0, 24);
  await env.DB.prepare("INSERT INTO profile (key, value) VALUES ('fav_exercises', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify(ids)).run();
  return Response.json({ ok: true, favourites: ids });
}

export async function workoutDetail(env: IngestEnv, id: number) {
  const w = (await env.DB.prepare("SELECT * FROM workouts WHERE id = ?").bind(id).first()) as Row | null;
  if (!w) return null;
  const [sets, note, planned] = await Promise.all([
    env.DB.prepare("SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY set_no").bind(id).all(),
    env.DB.prepare("SELECT * FROM analyses WHERE workout_id = ? ORDER BY id DESC LIMIT 1").bind(id).first(),
    w.planned_id ? env.DB.prepare("SELECT id, workout_date, title, kind, steps FROM planned_workouts WHERE id = ?").bind(w.planned_id).first() : null,
  ]);
  if (w.hr) w.hr = JSON.parse(w.hr);
  const n = note as Row | null;
  if (n) for (const k of ["highlights", "watchouts", "next_steps"]) if (typeof n[k] === "string") n[k] = JSON.parse(n[k]);
  const p = planned as Row | null;
  if (p?.steps) p.steps = JSON.parse(p.steps);
  return { workout: w, sets: sets.results, note: n, planned: p };
}

const int = (v: unknown, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const num = (v: unknown, lo: number, hi: number) => {
  const n = Math.round(Number(v) * 100) / 100;
  return v !== "" && v != null && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Create or update a workout and replace its sets. Body: {id?, workout_date, start_time, title, kind, duration_min, rpe, notes, planned_id, sets:[{exercise, reps, weight_kg, secs}]} */
export async function saveWorkout(env: IngestEnv, req: Request): Promise<Response> {
  if (!authorized(env, req)) return deny();
  let b: Row;
  try { b = await req.json(); } catch { return Response.json({ ok: false, message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const date = typeof b.workout_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.workout_date) ? b.workout_date : null;
  if (!date) return Response.json({ ok: false, message: "ต้องใส่วันที่" }, { status: 400 });
  const sets = (Array.isArray(b.sets) ? b.sets : []).slice(0, 120).map((s: Row) => ({
    // 0 is stored as NULL: a rep set has secs NULL, a timed set has reps NULL (the app decides reps vs time from that).
    exercise: text(s.exercise, 80), reps: int(s.reps, 1, 500), weight_kg: num(s.weight_kg, 0, 500), secs: int(s.secs, 1, 3600),
  })).filter((s: Row) => s.exercise && (s.reps || s.secs));
  const values: Row = {
    workout_date: date,
    start_time: typeof b.start_time === "string" && /^\d{2}:\d{2}$/.test(b.start_time) ? b.start_time : null,
    kind: ["strength", "mobility", "other"].includes(b.kind) ? b.kind : "strength",
    title: text(b.title, 120) ?? "เวท",
    duration_min: int(b.duration_min, 1, 600),
    rpe: int(b.rpe, 1, 10),
    notes: text(b.notes, 2000),
    planned_id: int(b.planned_id, 1, 1e9),
  };
  const id = int(b.id, 1, 1e9);
  let workoutId: number;
  if (id) {
    const exists = await env.DB.prepare("SELECT id FROM workouts WHERE id = ?").bind(id).first();
    if (!exists) return Response.json({ ok: false, message: "ไม่พบบันทึกนี้" }, { status: 404 });
    const cols = Object.keys(values);
    await env.DB.prepare(`UPDATE workouts SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .bind(...Object.values(values), id).run();
    workoutId = id;
  } else {
    // A session the Watch already sent today (no sets yet) becomes this log instead of a duplicate.
    const watchOnly = (await env.DB.prepare(
      "SELECT id FROM workouts WHERE workout_date = ? AND source = 'watch' AND NOT EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_id = workouts.id) ORDER BY id DESC LIMIT 1",
    ).bind(date).first()) as Row | null;
    if (watchOnly) {
      const cols = Object.keys(values);
      await env.DB.prepare(`UPDATE workouts SET ${cols.map((c) => `${c} = ?`).join(", ")}, source = 'app', updated_at = datetime('now') WHERE id = ?`)
        .bind(...Object.values(values), watchOnly.id).run();
      workoutId = watchOnly.id;
    } else {
      const cols = Object.keys(values);
      const r = (await env.DB.prepare(`INSERT INTO workouts (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING id`)
        .bind(...Object.values(values)).first()) as Row;
      workoutId = r.id;
    }
  }
  const stmts = [env.DB.prepare("DELETE FROM workout_sets WHERE workout_id = ?").bind(workoutId)];
  sets.forEach((s: Row, i: number) => stmts.push(env.DB.prepare(
    "INSERT INTO workout_sets (workout_id, set_no, exercise, reps, weight_kg, secs) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(workoutId, i + 1, s.exercise, s.reps, s.weight_kg, s.secs)));
  if (values.planned_id) {
    stmts.push(env.DB.prepare("UPDATE planned_workouts SET status = 'done', workout_id = ?, updated_at = datetime('now') WHERE id = ?").bind(workoutId, values.planned_id));
  }
  await env.DB.batch(stmts);
  return Response.json({ ok: true, id: workoutId, sets: sets.length });
}

export async function deleteWorkout(env: IngestEnv, req: Request, id: number): Promise<Response> {
  if (!authorized(env, req)) return deny();
  await env.DB.batch([
    env.DB.prepare("UPDATE planned_workouts SET status = 'planned', workout_id = NULL WHERE workout_id = ?").bind(id),
    env.DB.prepare("DELETE FROM workout_sets WHERE workout_id = ?").bind(id),
    env.DB.prepare("DELETE FROM workouts WHERE id = ?").bind(id),
  ]);
  return Response.json({ ok: true });
}

/** Apple Watch session (non-run) found by the run Shortcut: attach to today's log, or start one. */
export async function attachWatchWorkout(env: IngestEnv, w: { date: string; time: string; start_ms: number; secs: number; avg_hr: number | null; max_hr: number | null; kcal: number | null; hr: number[][] }) {
  // Every Watch session is kept, so it can be linked to another log later (/api/workouts/:id/hr).
  const sid = await upsertSession(env, w, "watch");
  const already = (await env.DB.prepare("SELECT id FROM workouts WHERE hr_session_id = ? LIMIT 1").bind(sid).first()) as Row | null;
  if (already) return { id: already.id as number, created: false };
  const same = (await env.DB.prepare(
    "SELECT id FROM workouts WHERE workout_date = ? AND hr_session_id IS NULL AND (watch_start_ms IS NULL OR abs(watch_start_ms - ?) < 600000) ORDER BY (watch_start_ms IS NOT NULL) DESC, id DESC LIMIT 1",
  ).bind(w.date, w.start_ms).first()) as Row | null;
  const vals = [w.start_ms, w.secs, w.avg_hr, w.max_hr, w.kcal, JSON.stringify(w.hr)];
  if (same) {
    await env.DB.prepare(
      "UPDATE workouts SET watch_start_ms = ?, watch_secs = ?, avg_hr = ?, max_hr = ?, calories = ?, hr = ?, hr_session_id = ?, start_time = COALESCE(start_time, ?), duration_min = COALESCE(duration_min, ?), updated_at = datetime('now') WHERE id = ?",
    ).bind(...vals, sid, w.time, Math.round(w.secs / 60), same.id).run();
    return { id: same.id as number, created: false };
  }
  const planned = (await env.DB.prepare("SELECT id FROM planned_workouts WHERE workout_date = ? AND kind = 'strength' AND workout_id IS NULL ORDER BY id LIMIT 1").bind(w.date).first()) as Row | null;
  const r = (await env.DB.prepare(
    `INSERT INTO workouts (workout_date, start_time, kind, title, duration_min, planned_id, source, watch_start_ms, watch_secs, avg_hr, max_hr, calories, hr, hr_session_id)
     VALUES (?, ?, 'strength', 'เวท (Apple Watch)', ?, ?, 'watch', ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(w.date, w.time, Math.round(w.secs / 60), planned?.id ?? null, ...vals, sid).first()) as Row;
  if (planned) await env.DB.prepare("UPDATE planned_workouts SET status = 'done', workout_id = ?, updated_at = datetime('now') WHERE id = ?").bind(r.id, planned.id).run();
  return { id: r.id as number, created: true };
}
