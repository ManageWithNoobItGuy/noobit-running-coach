// Daily Apple Health metrics sent by an iOS Shortcut (POST /api/ingest/daily, Bearer INGEST_TOKEN).
//
// The Shortcut puts Health-sample properties straight into a JSON body, so every field is text and
// list properties arrive newline-separated. Fields (all optional):
//   rhr, rhr_date            latest Resting Heart Rate value + its start date (ISO 8601)
//   hrv                      HRV (SDNN) values from the last 24 h
//   vo2, vo2_date            latest VO2 Max value + date
//   sleep_value / sleep_start / sleep_end / sleep_source   Sleep samples from the last 24 h, line-aligned
//   hr_value / hr_start      optional Heart Rate samples (last 24 h) — kept for the nights they fall in
// Every payload is kept in ingest_log so the parser can be adjusted to what the phone really sends.

import { storeDailySessions } from "./hrsessions";

export interface IngestEnv {
  DB: D1Database;
  INGEST_TOKEN?: string;
}

type Row = Record<string, any>;
const TZ_MS = 7 * 3600_000; // Asia/Bangkok

export const bkkDate = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
export const lines = (v: unknown): string[] =>
  v == null ? [] : (Array.isArray(v) ? v.map(String) : String(v).split(/\r?\n/)).map((s) => s.trim()).filter(Boolean);
export const nums = (v: unknown): number[] =>
  lines(v).flatMap((s) => (s.replace(/,(\d)/g, ".$1").match(/-?\d+(\.\d+)?(e[-+]?\d+)?/gi) || []).map(Number).slice(0, 1));

export function parseDate(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s.trim().replace(" ", "T"));
  return Number.isNaN(t) ? null : t;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Classify a sleep sample value (English, Thai, or HealthKit's numeric codes). */
function sleepKind(v: string): "asleep" | "core" | "deep" | "rem" | "awake" | "skip" {
  const s = v.toLowerCase();
  if (/^\d+$/.test(s)) return ({ "1": "asleep", "2": "awake", "3": "core", "4": "deep", "5": "rem" } as Record<string, any>)[s] ?? "skip";
  if (/bed|เตียง/.test(s)) return "skip";
  if (/awake|ตื่น/.test(s)) return "awake";
  if (/deep|ลึก/.test(s)) return "deep";
  if (/rem/.test(s)) return "rem";
  if (/core|แกน|หลัก/.test(s)) return "core";
  return "asleep";
}

export const bkkTime = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(11, 16);
const STAGE_CODE: Record<string, number> = { awake: 0, rem: 1, core: 2, deep: 3, asleep: 4 };

function mergedMs(items: { s: number; e: number }[]): number {
  if (!items.length) return 0;
  const sorted = [...items].sort((a, b) => a.s - b.s);
  let total = 0, curS = sorted[0].s, curE = sorted[0].e;
  for (const x of sorted.slice(1)) {
    if (x.s <= curE) curE = Math.max(curE, x.e);
    else { total += curE - curS; curS = x.s; curE = x.e; }
  }
  return total + (curE - curS);
}

/** Split sleep samples into nights (a gap of 3 h+ starts a new night) and summarise each one.
 * Shortcuts' "in the last 1 day" filter includes all of yesterday, so one delivery often holds two nights. */
function sleepNights(body: Row) {
  const vals = lines(body.sleep_value), starts = lines(body.sleep_start), ends = lines(body.sleep_end), srcs = lines(body.sleep_source);
  let items = vals.map((v, i) => ({ kind: sleepKind(v), s: parseDate(starts[i]), e: parseDate(ends[i]), src: srcs[i] || "" }))
    .filter((x) => x.kind !== "skip" && x.s != null && x.e != null && x.e! > x.s!) as { kind: string; s: number; e: number; src: string }[];
  if (items.some((x) => /watch/i.test(x.src))) items = items.filter((x) => /watch/i.test(x.src));
  if (!items.length) return [];
  items.sort((a, b) => a.s - b.s);
  const GAP = 3 * 3600_000;
  const groups: (typeof items)[] = [];
  let groupEnd = -Infinity;
  for (const x of items) {
    if (x.s - groupEnd > GAP) groups.push([]);
    groups[groups.length - 1].push(x);
    groupEnd = Math.max(groupEnd, x.e);
  }
  // Same rules as scripts/extract_sleep_nights.py: naps never replace the main night of the same wake-up date.
  const byDate = new Map<string, Row>();
  for (const g of groups) {
    const asleep = g.filter((x) => x.kind !== "awake");
    if (!asleep.length) continue;
    const bed = Math.min(...asleep.map((x) => x.s)), wake = Math.max(...asleep.map((x) => x.e));
    const total = Math.round(mergedMs(asleep) / 60000);
    if (total <= 30) continue;
    const stage = (k: string) => Math.round(asleep.filter((x) => x.kind === k).reduce((a, x) => a + (x.e - x.s), 0) / 60000);
    const off = (ms: number) => Math.round(((ms - bed) / 60000) * 10) / 10;
    const n = {
      date: bkkDate(wake), sleep_min: total, deep_min: stage("deep"), rem_min: stage("rem"), core_min: stage("core"),
      awake_min: Math.round(mergedMs(g.filter((x) => x.kind === "awake" && x.s >= bed && x.e <= wake)) / 60000),
      bed_time: bkkTime(bed), wake_time: bkkTime(wake),
      start_ms: bed, end_ms: wake,
      segments: g.filter((x) => x.s >= bed - 60_000 && x.e <= wake + 60_000).map((x) => [off(x.s), off(x.e), STAGE_CODE[x.kind]]),
    };
    const prev = byDate.get(n.date);
    if (!prev || n.sleep_min > prev.sleep_min) byDate.set(n.date, n);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function ingestDaily(env: IngestEnv, req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!env.INGEST_TOKEN || !token || !timingSafeEqual(token, env.INGEST_TOKEN)) {
    return Response.json({ ok: false, message: "รหัสไม่ถูกต้อง" }, { status: 401 });
  }
  const raw = await req.text();
  if (raw.length > 200_000) return Response.json({ ok: false, message: "ข้อมูลใหญ่เกินไป" }, { status: 413 });
  let body: Row;
  try { body = JSON.parse(raw); } catch { body = {}; }

  const now = Date.now();
  const today = bkkDate(now);
  const updates: { date: string; col: string; val: number | string }[] = [];

  const rhr = nums(body.rhr)[0];
  if (rhr && rhr > 25 && rhr < 120) updates.push({ date: bkkDate(parseDate(lines(body.rhr_date)[0]) ?? now), col: "resting_hr", val: rhr });
  const hrv = nums(body.hrv).filter((x) => x > 3 && x < 300);
  if (hrv.length) updates.push({ date: today, col: "hrv", val: Math.round((hrv.reduce((a, b) => a + b, 0) / hrv.length) * 10) / 10 });
  const vo2 = nums(body.vo2)[0];
  if (vo2 && vo2 > 15 && vo2 < 90) updates.push({ date: bkkDate(parseDate(lines(body.vo2_date)[0]) ?? now), col: "vo2max", val: vo2 });
  const parsedNights = sleepNights(body);
  // The Shortcut's "last 1 day" window starts at yesterday 00:00, so the next morning's delivery repeats the
  // previous night cut off at midnight. Never let a shorter copy of a night replace a longer stored one.
  const stored = new Map<string, number>();
  if (parsedNights.length) {
    const r = await env.DB.prepare(`SELECT date, sleep_min FROM daily_metrics WHERE date IN (${parsedNights.map(() => "?").join(",")})`)
      .bind(...parsedNights.map((n) => n.date)).all<{ date: string; sleep_min: number | null }>();
    for (const x of r.results) if (x.sleep_min != null) stored.set(x.date, x.sleep_min);
  }
  const nights = parsedNights.filter((n) => !((stored.get(n.date) ?? 0) > n.sleep_min));
  for (const n of nights) {
    for (const col of ["sleep_min", "deep_min", "rem_min", "core_min", "awake_min", "bed_time", "wake_time"]) {
      updates.push({ date: n.date, col, val: n[col] });
    }
  }
  const sleep = parsedNights[parsedNights.length - 1];
  // Timeline for the night view; heart rate is optional (only if the Shortcut sends hr_value/hr_start).
  const hrVals = nums(body.hr_value), hrStarts = lines(body.hr_start).map(parseDate);
  const detailStmts = nights.map((n) => {
    const hr = hrVals
      .map((v, i) => [hrStarts[i], v] as [number | null, number])
      .filter(([t, v]) => t != null && v > 25 && v < 220 && t >= n.start_ms - 900_000 && t <= n.end_ms + 900_000)
      .map(([t, v]) => [Math.round(((t! - n.start_ms) / 60000) * 10) / 10, Math.round(v)])
      .sort((a, b) => a[0] - b[0]);
    return env.DB.prepare(
      `INSERT INTO sleep_detail (date, start_ms, segments, hr) VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET start_ms = excluded.start_ms, segments = excluded.segments, hr = COALESCE(excluded.hr, sleep_detail.hr)`,
    ).bind(n.date, n.start_ms, JSON.stringify(n.segments), hr.length ? JSON.stringify(hr) : null);
  });

  const stmts = [...detailStmts, ...updates.map((u) =>
    env.DB.prepare(`INSERT INTO daily_metrics (date, ${u.col}) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET ${u.col} = excluded.${u.col}`).bind(u.date, u.val),
  )];
  const parts = [
    rhr ? `HR พัก ${Math.round(rhr)}` : "",
    hrv.length ? `HRV ${Math.round(hrv.reduce((a, b) => a + b, 0) / hrv.length)}` : "",
    sleep ? `นอน ${Math.floor(sleep.sleep_min / 60)}:${String(sleep.sleep_min % 60).padStart(2, "0")}` : "",
    vo2 ? `VO₂max ${vo2}` : "",
  ].filter(Boolean);
  // Watch workouts from yesterday's heart rate → hr_sessions (to link to strength logs). Never fails the delivery.
  let nSessions = 0;
  try { nSessions = await storeDailySessions(env, body); } catch (err) { console.error("daily sessions", err); }
  if (nSessions) parts.push(`พบ workout ${nSessions} รายการ`);
  const ok = updates.length > 0;
  const message = ok ? `อัปเดตแล้ว · ${parts.join(" · ")}` : "ได้รับข้อมูลแล้ว แต่ยังอ่านค่าไม่ได้ — บอก Claude ให้ตรวจ";
  // One delivery per day: a re-run replaces that day's earlier log entry (metric values above are overwritten per day too).
  stmts.push(env.DB.prepare("DELETE FROM ingest_log WHERE kind = 'daily' AND date(received_at, '+7 hours') = ?").bind(today));
  stmts.push(env.DB.prepare("INSERT INTO ingest_log (received_at, ok, summary, payload) VALUES (?, ?, ?, ?)").bind(new Date(now).toISOString(), ok ? 1 : 0, message, raw.slice(0, 50_000)));
  stmts.push(env.DB.prepare("DELETE FROM ingest_log WHERE id NOT IN (SELECT id FROM ingest_log ORDER BY id DESC LIMIT 60)"));
  await env.DB.batch(stmts);
  return Response.json({ ok, message, updated: updates });
}

/** Public status for the setup page (no payloads). */
export async function ingestStatus(env: IngestEnv) {
  const last = await env.DB.prepare("SELECT received_at, ok, summary, kind FROM ingest_log ORDER BY id DESC LIMIT 8").all();
  return { configured: Boolean(env.INGEST_TOKEN), recent: last.results };
}
