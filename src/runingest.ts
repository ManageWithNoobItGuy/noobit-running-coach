// Latest run from Apple Health, sent by the "Running Journal – วิ่ง" iOS Shortcut (POST /api/ingest/run, Bearer INGEST_TOKEN).
//
// Shortcuts cannot read the workout itself reliably, so it sends raw Health samples from the last few hours and the
// run is rebuilt here (same maths as scripts/health_calc.py, which matched Strava splits to ±1 s):
//   dist_value / dist_start / dist_end / dist_source   Distance Walking + Running samples, line-aligned
//   hr_value / hr_start                                 Heart Rate samples
//   kcal_value / kcal_start                             Active Energy samples (optional)
//   step_value / step_start / step_end / step_source    Steps samples (optional) → cadence (Watch writes one every ~2.5 s in a workout)
// The Watch samples heart rate every ~5 s only while a workout is running, so the latest dense heart-rate cluster
// marks the run; the Watch distance samples inside it give distance, time, splits and the pace/HR stream.

import { bkkDate, bkkTime, lines, nums, parseDate, timingSafeEqual, type IngestEnv } from "./ingest";
import { attachWatchWorkout } from "./workouts";

type Row = Record<string, any>;
type Sample = { v: number; s: number; e: number; src: string };

const RUN_KINDS = ["easy", "runwalk", "long", "strides", "tempo", "interval", "test", "race", "recovery"];
const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

function distSamples(body: Row): Sample[] {
  const raw = lines(body.dist_value), v = nums(body.dist_value), st = lines(body.dist_start), en = lines(body.dist_end), src = lines(body.dist_source);
  let items = v.map((x, i) => ({ v: x, s: parseDate(st[i]), e: parseDate(en[i]), src: src[i] || "" }))
    .filter((x) => x.s != null && x.e != null && x.e! >= x.s! && x.v >= 0) as Sample[];
  if (items.some((x) => /watch/i.test(x.src))) items = items.filter((x) => /watch/i.test(x.src));
  // Value arrives in the phone's unit. Workout samples are a few metres each: a median above 1 means metres.
  const unitM = raw.some((x) => /\d\s*m$/i.test(x)) && !raw.some((x) => /km/i.test(x));
  const mi = raw.some((x) => /mi/i.test(x));
  const sorted = items.map((x) => x.v).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const f = mi ? 1.609344 : unitM || median > 1 ? 0.001 : 1;
  return items.map((x) => ({ ...x, v: x.v * f })).sort((a, b) => a.s - b.s);
}

/** Groups of timestamps where each one is at most `gap` ms after the previous. */
function clusters(ts: number[], gap: number): number[][] {
  const out: number[][] = [];
  for (const t of [...ts].sort((a, b) => a - b)) {
    if (!out.length || t - out[out.length - 1][out[out.length - 1].length - 1] > gap) out.push([]);
    out[out.length - 1].push(t);
  }
  return out;
}

export interface ParsedRun {
  start: number; end: number; km: number; moving_s: number; elapsed_s: number;
  avg_hr: number | null; max_hr: number | null; kcal: number | null;
  splits: { n: number; km: number; pace: number; hr: number | null; cad: number | null }[];
  stream: { t: number[]; d: number[]; hr: (number | null)[]; v: number[]; cad?: number[] };
  cadence: { cad: number | null; steps: number; stride: number | null } | null;
  walk_share: number; window: "hr" | "distance";
}

export type WatchWorkout = { start_ms: number; secs: number; avg_hr: number | null; max_hr: number | null; kcal: number | null; hr: number[][] };
export type Session = { type: "run"; start: number; run: ParsedRun } | { type: "workout"; start: number; workout: WatchWorkout };

function hrSamples(body: Row): [number, number][] {
  const hrS = lines(body.hr_start).map(parseDate), hrV = nums(body.hr_value);
  return hrV.map((v, i) => [hrS[i], v] as [number | null, number])
    .filter(([t, v]) => t != null && v > 30 && v < 230).map(([t, v]) => [t!, v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/** Dense distance samples grouped into continuous stretches (pauses up to 3 min stay in the same stretch). */
function distStretches(ds: Sample[], gap = 180_000): Sample[][] {
  const out: Sample[][] = [];
  for (const x of [...ds].sort((p, q) => p.s - q.s)) {
    const cur = out[out.length - 1];
    if (!cur || x.s - Math.max(...cur.map((c) => c.e)) > gap) out.push([x]); else cur.push(x);
  }
  return out;
}

function watchWorkout(hr: [number, number][], body: Row, start: number, end: number): WatchWorkout {
  const inside = hr.filter(([t]) => t >= start && t <= end);
  const vals = inside.map((h) => h[1]);
  const kS = lines(body.kcal_start).map(parseDate), kV = nums(body.kcal_value);
  const kcal = kV.reduce((t, v, i) => (kS[i] != null && kS[i]! >= start - 5_000 && kS[i]! <= end ? t + v : t), 0);
  const series: number[][] = [];
  let lastT = -Infinity;
  for (const [t, v] of inside) if (t - lastT >= 30_000) { series.push([round((t - start) / 60000, 1), Math.round(v)]); lastT = t; }
  return {
    start_ms: start, secs: Math.round((end - start) / 1000),
    avg_hr: vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null,
    max_hr: vals.length ? Math.round(Math.max(...vals)) : null,
    kcal: kcal > 0 ? Math.round(kcal) : null, hr: series,
  };
}

/** Every Watch session in the delivery, oldest first. A dense heart-rate cluster is one Watch session (or several
 * back to back): stretches of dense distance ≥ 0.8 km inside it are runs, the rest (10 min+) is a non-run workout. */
export function parseSessions(body: Row): Session[] {
  const short = distSamples(body).filter((x) => x.e - x.s <= 30_000);
  const hr = hrSamples(body);
  const hrCl = clusters(hr.map((h) => h[0]), 60_000).filter((c) => c.length >= 30 && c[c.length - 1] - c[0] >= 5 * 60_000);
  const out: Session[] = [];
  const addRun = (ds: Sample[], source: ParsedRun["window"]) => {
    const start = ds[0].s, end = Math.max(...ds.map((x) => x.e)), km = ds.reduce((t, x) => t + x.v, 0);
    out.push({ type: "run", start, run: build(ds, hr, body, start, end, km, source) });
  };
  if (!hrCl.length) {
    for (const c of clusters(short.map((x) => x.s), 60_000).filter((c) => c.length >= 30)) {
      const ds = short.filter((x) => x.s >= c[0] && x.s <= c[c.length - 1]);
      if (ds.reduce((t, x) => t + x.v, 0) >= 0.8) addRun(ds, "distance");
    }
    return out;
  }
  for (const c of hrCl) {
    const a = c[0], b = c[c.length - 1];
    const runs = distStretches(short.filter((x) => x.s >= a - 120_000 && x.e <= b + 120_000))
      .filter((st) => st.reduce((t, x) => t + x.v, 0) >= 0.8);
    let segStart = a;
    for (const st of runs) {
      const rs = st[0].s, re = Math.max(...st.map((x) => x.e));
      if (rs - segStart >= 10 * 60_000) out.push({ type: "workout", start: segStart, workout: watchWorkout(hr, body, segStart, rs) });
      addRun(st, "hr");
      segStart = Math.max(segStart, re);
    }
    if (b - segStart >= 10 * 60_000) out.push({ type: "workout", start: segStart, workout: watchWorkout(hr, body, segStart, b) });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Latest run in the delivery (kept for tests / tools). */
export function parseRun(body: Row): ParsedRun | null {
  const runs = parseSessions(body).filter((x) => x.type === "run") as Extract<Session, { type: "run" }>[];
  return runs.length ? runs[runs.length - 1].run : null;
}

function build(ds: Sample[], hrAll: [number, number][], body: Row, start: number, end: number, km: number, source: ParsedRun["window"]): ParsedRun {
  // Pauses: gaps of 30 s+ between distance samples are not moving time.
  let paused = 0;
  for (let i = 1; i < ds.length; i++) {
    const gap = ds[i].s - ds[i - 1].e;
    if (gap > 30_000) paused += gap;
  }
  const elapsed = (end - start) / 1000, moving = Math.round(elapsed - paused / 1000);
  // cumulative distance curve (t seconds from start, km)
  const pts: [number, number][] = [[0, 0]];
  let cum = 0;
  for (const x of [...ds].sort((p, q) => p.e - q.e)) { cum += x.v; pts.push([(x.e - start) / 1000, cum]); }
  const hr = hrAll.filter(([t]) => t >= start - 30_000 && t <= end + 30_000).map(([t, v]) => [(t - start) / 1000, v] as [number, number]);
  const inside = hr.filter(([t]) => t >= 0 && t <= elapsed).map((h) => h[1]);
  const kS = lines(body.kcal_start).map(parseDate), kV = nums(body.kcal_value);
  const kcal = kV.reduce((t, v, i) => (kS[i] != null && kS[i]! >= start - 5_000 && kS[i]! <= end ? t + v : t), 0);
  const cad = cadenceBins(stepSamples(body, start), elapsed);
  const stream = makeStream(pts, hr, elapsed, cad);
  return {
    start, end, km: round(km, 2), moving_s: moving, elapsed_s: Math.round(elapsed),
    avg_hr: avgHr(hr, 0, elapsed), max_hr: inside.length ? Math.round(Math.max(...inside)) : null,
    kcal: kcal > 0 ? Math.round(kcal) : null,
    splits: splits(pts, hr, round(km, 2), cad), stream, cadence: cad ? cadenceSummary(cad, pts, elapsed) : null,
    walk_share: stream.v.length ? stream.v.filter((x) => x < 1000 / 660).length / stream.v.length : 0,
    window: source,
  };
}

// ---- same maths as scripts/health_calc.py ----

function distAt(pts: [number, number][], t: number) {
  let i = pts.findIndex((p) => p[0] > t);
  if (i === 0) return 0;
  if (i === -1) return pts[pts.length - 1][1];
  const [t0, d0] = pts[i - 1], [t1, d1] = pts[i];
  return t1 > t0 ? d0 + ((d1 - d0) * (t - t0)) / (t1 - t0) : d1;
}
function timeAt(pts: [number, number][], d: number) {
  for (let i = 1; i < pts.length; i++) {
    const [t0, d0] = pts[i - 1], [t1, d1] = pts[i];
    if ((d1 >= d && d > d0) || (d1 >= d && d0 === d)) return d1 > d0 ? t0 + ((t1 - t0) * (d - d0)) / (d1 - d0) : t1;
  }
  return pts[pts.length - 1][0];
}
function hrAt(hr: [number, number][], t: number, maxGap = 30): number | null {
  let i = -1;
  for (let k = 0; k < hr.length && hr[k][0] <= t; k++) i = k;
  if (i < 0) return hr.length && hr[0][0] - t < maxGap ? hr[0][1] : null;
  return t - hr[i][0] <= maxGap ? hr[i][1] : null;
}
function avgHr(hr: [number, number][], t0: number, t1: number, step = 2): number | null {
  const v: number[] = [];
  for (let t = t0; t < t1; t += step) { const h = hrAt(hr, t); if (h) v.push(h); }
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}
function splits(pts: [number, number][], hr: [number, number][], total: number, cad: number[] | null) {
  const out: ParsedRun["splits"] = [];
  let prev = 0, k = 1;
  while (k <= total + 1e-9) {
    const t = timeAt(pts, k);
    out.push({ n: k, km: 1, pace: Math.round(t - prev), hr: avgHr(hr, prev, t), cad: cadenceBetween(cad, prev, t) });
    prev = t; k++;
  }
  const rest = round(total - (k - 1), 2);
  if (rest >= 0.05) {
    const tEnd = pts[pts.length - 1][0];
    out.push({ n: k, km: rest, pace: Math.round((tEnd - prev) / rest), hr: avgHr(hr, prev, tEnd), cad: cadenceBetween(cad, prev, tEnd) });
  }
  return out;
}
function makeStream(pts: [number, number][], hr: [number, number][], dur: number, cad: number[] | null, n = 300) {
  const step = Math.max(5, dur / n);
  const s: ParsedRun["stream"] = { t: [], d: [], hr: [], v: [] };
  if (cad) s.cad = [];
  for (let x = 0; x < dur; x += step) {
    const a = Math.max(0, x - 15), b = Math.min(dur, x + 15);
    const speed = b > a ? ((distAt(pts, b) - distAt(pts, a)) * 1000) / (b - a) : 0;
    s.t.push(Math.round(x)); s.d.push(round(distAt(pts, x), 3)); s.hr.push(hrAt(hr, x)); s.v.push(round(speed, 2));
    if (cad) { // mean of the bins centred within ±15 s
      let near = cad.filter((_, i) => (i + 0.5) * CAD_BIN >= a && (i + 0.5) * CAD_BIN <= b);
      if (!near.length) near = [cad[Math.min(cad.length - 1, Math.floor(x / CAD_BIN))]];
      s.cad!.push(Math.round(near.reduce((p, q) => p + q, 0) / near.length));
    }
  }
  let last = s.hr.find((x) => x) ?? null;
  s.hr = s.hr.map((x) => { if (x) last = x; return last == null ? null : Math.round(last); });
  return s;
}

// ---- cadence (same maths as health_calc.cadence_bins / cadence_summary / cadence_between) ----
// Single Watch step samples are too coarse (7 steps in 2 or 3 s reads 140 or 210 spm), so steps are spread over 15-s bins.
// A bin at 140+ spm is running; below that walking or standing.
const CAD_BIN = 15, RUN_CAD = 140;

/** Watch step samples as [startS, endS, steps] relative to the run start (iPhone samples dropped: they double-count). */
function stepSamples(body: Row, start: number): [number, number, number][] {
  const v = nums(body.step_value), st = lines(body.step_start), en = lines(body.step_end), src = lines(body.step_source);
  let items = v.map((x, i) => ({ v: x, s: parseDate(st[i]), e: parseDate(en[i]), src: src[i] || "" }))
    .filter((x) => x.s != null && x.e != null && x.v >= 0);
  if (items.some((x) => /watch/i.test(x.src))) items = items.filter((x) => /watch/i.test(x.src));
  return items.map((x) => [(x.s! - start) / 1000, (x.e! - start) / 1000, x.v] as [number, number, number]).sort((a, b) => a[0] - b[0]);
}

function cadenceBins(steps: [number, number, number][], dur: number): number[] | null {
  const dense = steps.filter(([s, e]) => e - s <= 60 && e > 0 && s < dur);
  if (dense.length < 50) return null;
  const n = Math.max(1, Math.floor(dur / CAD_BIN) + (dur % CAD_BIN >= 5 ? 1 : 0));
  const bins = new Array(n).fill(0);
  for (const [s, e, v] of dense) {
    if (e <= s) { const k = Math.floor(s / CAD_BIN); if (k >= 0 && k < n) bins[k] += v; continue; }
    let t = s;
    while (t < e) {
      const k = Math.floor(t / CAD_BIN), nxt = Math.min(e, (k + 1) * CAD_BIN);
      if (k >= 0 && k < n) bins[k] += (v * (nxt - t)) / (e - s);
      t = nxt;
    }
  }
  return bins.map((b, i) => (b * 60) / Math.min(CAD_BIN, dur - i * CAD_BIN));
}
function cadenceSummary(cad: number[], pts: [number, number][], dur: number) {
  const run = cad.map((c, i) => (c >= RUN_CAD ? i : -1)).filter((i) => i >= 0);
  const steps = Math.round(cad.reduce((t, c, i) => t + (c * Math.min(CAD_BIN, dur - i * CAD_BIN)) / 60, 0));
  if (run.length < 4) return { cad: null, steps, stride: null };
  const runSteps = run.reduce((t, i) => t + (cad[i] * CAD_BIN) / 60, 0);
  const runKm = run.reduce((t, i) => t + distAt(pts, (i + 1) * CAD_BIN) - distAt(pts, i * CAD_BIN), 0);
  return { cad: Math.round(run.reduce((t, i) => t + cad[i], 0) / run.length), steps, stride: runKm && runSteps ? round((runKm * 1000) / runSteps, 2) : null };
}
function cadenceBetween(cad: number[] | null, t0: number, t1: number): number | null {
  if (!cad) return null;
  const run = cad.filter((c, i) => (i + 0.5) * CAD_BIN >= t0 && (i + 0.5) * CAD_BIN < t1 && c >= RUN_CAD);
  return run.length >= 4 ? Math.round(run.reduce((a, b) => a + b, 0) / run.length) : null;
}

// ---- endpoint ----

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const title = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return (h < 11 ? "Morning" : h < 14 ? "Lunch" : h < 17 ? "Afternoon" : "Evening") + " Run";
};

export async function ingestRun(env: IngestEnv, req: Request): Promise<Response> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!env.INGEST_TOKEN || !token || !timingSafeEqual(token, env.INGEST_TOKEN)) {
    return Response.json({ ok: false, message: "รหัสไม่ถูกต้อง" }, { status: 401 });
  }
  const raw = await req.text();
  if (raw.length > 4_000_000) return Response.json({ ok: false, message: "ข้อมูลใหญ่เกินไป" }, { status: 413 });
  let body: Row;
  try { body = JSON.parse(raw); } catch { body = {}; }
  const now = new Date().toISOString();
  const log = (ok: boolean, summary: string) => [
    env.DB.prepare("INSERT INTO ingest_log (received_at, ok, summary, payload, kind) VALUES (?, ?, ?, ?, 'run')").bind(now, ok ? 1 : 0, summary, raw.slice(0, 1_500_000)),
    env.DB.prepare("DELETE FROM ingest_log WHERE id NOT IN (SELECT id FROM ingest_log ORDER BY id DESC LIMIT 60)"),
    env.DB.prepare("UPDATE ingest_log SET payload = substr(payload, 1, 50000) WHERE length(payload) > 50000 AND id NOT IN (SELECT id FROM ingest_log ORDER BY id DESC LIMIT 5)"),
  ];

  const sessions = parseSessions(body);
  if (!sessions.length) {
    const message = "ไม่เจอการวิ่งหรือ workout ใน 3 ชม.ล่าสุด (ต้องบันทึกด้วย Apple Watch) — รอสักครู่แล้วกดใหม่นะคะ";
    await env.DB.batch(log(false, message));
    return Response.json({ ok: false, message });
  }
  const parts: string[] = [];
  const results: Row[] = [];
  for (const ses of sessions) {
    if (ses.type === "workout") {
      const wk = ses.workout;
      const res = await attachWatchWorkout(env, { ...wk, date: bkkDate(wk.start_ms), time: bkkTime(wk.start_ms) });
      parts.push(`workout ${bkkTime(wk.start_ms)} · ${Math.round(wk.secs / 60)} นาที${wk.avg_hr ? ` · HR ${wk.avg_hr}` : ""}${wk.kcal ? ` · ${wk.kcal} kcal` : ""}` +
        (res.created ? " (กรอกท่ากับน้ำหนักในเว็บด้วยนะคะ)" : ""));
      results.push({ type: "workout", workout_id: res.id });
    } else {
      const res = await saveRun(env, ses.run);
      parts.push(res.message);
      results.push({ type: "run", run_id: res.runId });
    }
  }
  const hasRun = sessions.some((x) => x.type === "run");
  const message = `บันทึกแล้ว ${sessions.length} รายการ: ${parts.join(" | ")}${hasRun ? " — บอก RPE ให้แพรด้วยนะคะ" : ""}`;
  await env.DB.batch(log(true, message));
  return Response.json({ ok: true, message, sessions: results });
}

/** Save one rebuilt run: insert, or update the same run sent before / logged from screenshots (same day, start ±10 min). */
async function saveRun(env: IngestEnv, r: ParsedRun): Promise<{ message: string; runId: number }> {
  // ---- reads ----
  const date = bkkDate(r.start), time = bkkTime(r.start);
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  // Same run sent twice, or already logged from screenshots: same day, start within 10 min.
  const sameDay = (await env.DB.prepare("SELECT id, start_time, source, run_type, distance_km, coalesce(elapsed_time_s, moving_time_s) AS secs, (SELECT count(*) FROM splits s WHERE s.run_id = runs.id) AS n_splits FROM runs WHERE run_date = ?").bind(date).all()).results as Row[];
  // A delivery whose 3-h window starts mid-run carries that run cut at the window start. Never let the cut copy
  // replace or duplicate the longer stored run: it overlaps it in time and is >10 % shorter.
  const longer = sameDay.find((x) => x.start_time && x.distance_km && r.km < 0.9 * x.distance_km &&
    minutes(time) >= minutes(x.start_time) - 10 && minutes(time) <= minutes(x.start_time) + (x.secs ?? 0) / 60);
  if (longer) {
    return { message: `วิ่ง ${longer.start_time} มีในระบบแล้ว ${Number(longer.distance_km).toFixed(2)} กม. (รอบนี้ได้ข้อมูลไม่ครบ ${r.km.toFixed(2)} กม. เก็บของเดิมไว้)`, runId: longer.id };
  }
  const existing = sameDay.find((x) => x.start_time && Math.abs(minutes(x.start_time) - minutes(time)) <= 10) ?? null;
  const planned = (await env.DB.prepare(
    `SELECT * FROM planned_workouts WHERE workout_date = ? AND kind IN (${RUN_KINDS.map(() => "?").join(",")})
     AND (run_id IS NULL ${existing ? "OR run_id = ?" : ""}) ORDER BY id LIMIT 1`,
  ).bind(date, ...RUN_KINDS, ...(existing ? [existing.id] : [])).first()) as Row | null;
  // Share of time in Z1–Z2 for the notification (Karvonen zones from the profile).
  const kv = (await env.DB.prepare("SELECT key, value FROM profile WHERE key IN ('max_hr', 'resting_hr')").all()).results as Row[];
  const prof = Object.fromEntries(kv.map((x) => [x.key, Number(x.value)]));
  let easy = "";
  if (prof.max_hr && prof.resting_hr) {
    const cap = prof.resting_hr + 0.7 * (prof.max_hr - prof.resting_hr); // top of Z2 (70% HRR)
    const hs = r.stream.hr.filter((x): x is number => x != null);
    if (hs.length) easy = ` · Z1–2 ${Math.round((hs.filter((x) => x < cap).length / hs.length) * 100)}%`;
  }

  // ---- writes ----
  const values: Row = {
    run_date: date, start_time: time, title: title(time),
    run_type: existing?.run_type || (planned?.kind && planned.kind !== "runwalk" ? planned.kind : r.walk_share > 0.08 ? "runwalk" : "easy"),
    distance_km: r.km, moving_time_s: r.moving_s, elapsed_time_s: r.elapsed_s,
    avg_pace_s: Math.round(r.moving_s / r.km), avg_hr: r.avg_hr, max_hr: r.max_hr, calories: r.kcal,
    steps: r.cadence?.steps ?? null, cadence_spm: r.cadence?.cad ?? null, stride_m: r.cadence?.stride ?? null,
    device: "Apple Watch", source: "shortcut",
  };
  const kept = existing != null && existing.source !== "shortcut";
  let runId: number;
  const stmts: D1PreparedStatement[] = [];
  if (kept) {
    // Logged from screenshots / Strava already: keep its numbers, only fill what is missing.
    runId = existing!.id;
    stmts.push(env.DB.prepare(
      "UPDATE runs SET avg_hr = COALESCE(avg_hr, ?), max_hr = COALESCE(max_hr, ?), calories = COALESCE(calories, ?), " +
      "steps = COALESCE(steps, ?), cadence_spm = COALESCE(?, cadence_spm), stride_m = COALESCE(stride_m, ?) WHERE id = ?",
    ).bind(r.avg_hr, r.max_hr, r.kcal, r.cadence?.steps ?? null, r.cadence?.cad ?? null, r.cadence?.stride ?? null, runId));
  } else if (existing) {
    runId = existing.id;
    const cols = Object.keys(values);
    stmts.push(env.DB.prepare(`UPDATE runs SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).bind(...Object.values(values), runId));
  } else {
    const cols = Object.keys(values);
    const row = (await env.DB.prepare(`INSERT INTO runs (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING id`)
      .bind(...Object.values(values)).first()) as Row;
    runId = row.id;
  }
  if (!kept || existing!.n_splits === 0) {
    stmts.push(env.DB.prepare("DELETE FROM splits WHERE run_id = ?").bind(runId));
    for (const s of r.splits) {
      stmts.push(env.DB.prepare("INSERT INTO splits (run_id, split_no, distance_km, pace_s, avg_hr, cadence_spm) VALUES (?, ?, ?, ?, ?, ?)").bind(runId, s.n, s.km, s.pace, s.hr, s.cad));
    }
  } else if (r.cadence) {
    // Splits from screenshots / Strava stay; add cadence per km where they line up.
    for (const s of r.splits) stmts.push(env.DB.prepare("UPDATE splits SET cadence_spm = ? WHERE run_id = ? AND split_no = ?").bind(s.cad, runId, s.n));
  }
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO run_streams (run_id, points) VALUES (?, ?)").bind(runId, JSON.stringify(r.stream)));
  if (planned && planned.run_id == null) {
    const st = !planned.target_km || r.km >= planned.target_km * 0.8 ? "done" : "partial";
    stmts.push(env.DB.prepare("UPDATE planned_workouts SET run_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?").bind(runId, st, planned.id));
  }
  const message = kept
    ? `วิ่ง ${existing!.start_time} มีในระบบแล้ว เติมกราฟเพซ/หัวใจให้${existing!.n_splits ? "" : " พร้อม split"}${easy}`
    : `${existing ? "อัปเดต" : ""}วิ่ง ${time} · ${r.km.toFixed(2)} กม. · ${mmss(r.moving_s)} · เพซ ${mmss(r.moving_s / r.km)}` +
      (r.avg_hr ? ` · HR ${r.avg_hr}` : "") + easy + (r.cadence?.cad ? ` · รอบขา ${r.cadence.cad}` : "");
  await env.DB.batch(stmts);
  return { message, runId };
}
