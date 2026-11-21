// Running Journal — single-page app (no build step)
import { EXERCISES, exercisesIn, pictoMini, pictogram, plannedSets, ytLink } from "./exercises.js";

const app = document.getElementById("app");

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const pad = (n) => String(n).padStart(2, "0");
function pace(s) {
  if (!s && s !== 0) return "–";
  s = Math.round(s);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
function duration(s) {
  if (!s && s !== 0) return "–";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
function hoursMin(s) {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} ชม. ${m} น.` : `${m} นาที`;
}
const kmFixed = (n, d = 1) => (n == null ? "–" : Number(n).toFixed(d));

const toD = (s) => new Date(s + "T00:00:00Z");
const fmtD = (d) => d.toISOString().slice(0, 10);
function addDays(s, n) { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fmtD(d); }
function weekStart(s) { const dow = (toD(s).getUTCDay() + 6) % 7; return addDays(s, -dow); }
const dt = (opts) => new Intl.DateTimeFormat("th-TH", { timeZone: "UTC", ...opts });
const dShort = (s) => dt({ day: "numeric", month: "short" }).format(toD(s));
const dLong = (s) => dt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(toD(s));
const dMed = (s) => dt({ day: "numeric", month: "short", year: "numeric" }).format(toD(s));
const dWeekday = (s) => dt({ weekday: "short" }).format(toD(s));
const dMonth = (s) => dt({ month: "short" }).format(toD(s));
const DOW = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function md(text) {
  if (!text) return "";
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const KIND = {
  easy: "วิ่งเบา", runwalk: "วิ่งสลับเดิน", long: "Long Run", strides: "Easy + Strides", tempo: "Tempo",
  interval: "Interval", test: "ทดสอบ", race: "Race", strength: "เวทเทรนนิ่ง", rest: "พัก", recovery: "Recovery",
};
const STATUS = { planned: "ตามแผน", done: "สำเร็จ", partial: "บางส่วน", skipped: "ข้าม", moved: "ย้ายวัน", missed: "ยังไม่มีบันทึก" };
const RUN_KINDS = new Set(["easy", "runwalk", "long", "strides", "tempo", "interval", "test", "race", "recovery"]);
const chip = (kind) => `<span class="chip k-${esc(kind)}">${esc(KIND[kind] ?? kind)}</span>`;
const statusChip = (s) => (s && s !== "planned" ? `<span class="chip s-${esc(s)}">${esc(STATUS[s] ?? s)}</span>` : "");

const ZCOL = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z5)"];
function zoneIdx(hr, zones) {
  if (!hr || !zones?.length) return -1;
  for (let i = zones.length - 1; i >= 0; i--) if (hr >= zones[i].lo) return i;
  return 0;
}
const zColor = (hr, zones) => (zoneIdx(hr, zones) < 0 ? "var(--ink-3)" : ZCOL[zoneIdx(hr, zones)]);
const zRange = (z) => (z.hi ? `${z.lo}–${z.hi}` : `${z.lo}+`);
const zRangeFirst = (z) => `< ${z.hi + 1}`;

function zoneLegend(zones) {
  return `<div class="legend">${zones.map((z, i) => `<span><i style="background:${ZCOL[i]}"></i>Z${z.z} ${i === 0 ? zRangeFirst(z) : zRange(z)}</span>`).join("")}</div>`;
}

function zoneBar(secs, thin = false) {
  const total = secs.reduce((a, b) => a + b, 0);
  if (!total) return "";
  return `<div class="zbar ${thin ? "thin" : ""}">${secs.map((v, i) => (v ? `<i style="width:${(v / total) * 100}%;background:${ZCOL[i]}" title="Z${i + 1} ${Math.round((v / total) * 100)}%"></i>` : "")).join("")}</div>`;
}

function zoneSummary(zt, zones) {
  const total = zt?.secs?.reduce((a, b) => a + b, 0);
  if (!total) return "";
  const easy = Math.round(((zt.secs[0] + zt.secs[1]) / total) * 100);
  return `<div class="zsum">
    <div class="zsum-head"><h4>แบ่งตามโซนหัวใจ</h4><span class="small"><b style="color:var(--z2)">เบา Z1–Z2 ${easy}%</b> · <b style="color:var(--z4)">หนัก Z3+ ${100 - easy}%</b></span></div>
    ${zoneBar(zt.secs)}
    <div class="zchips">${zones.map((z, i) => {
      const pct = Math.round((zt.secs[i] / total) * 100);
      return `<div class="zchip ${pct ? "" : "zero"}" style="border-top-color:${ZCOL[i]}"><b>Z${z.z}</b><span class="num">${pct}%</span><small>${duration(zt.secs[i])}</small></div>`;
    }).join("")}</div>
  </div>`;
}

function zoneTable(zt, zones) {
  const total = zt.secs.reduce((a, b) => a + b, 0);
  if (!total) return `<div class="empty">ไม่มีข้อมูลหัวใจ</div>`;
  return `${zoneBar(zt.secs)}
    <div class="ztable">${zones.map((z, i) => {
      const pct = Math.round((zt.secs[i] / total) * 100);
      return `<div class="zrow ${pct ? "" : "zero"}"><span class="zsw" style="background:${ZCOL[i]}"></span>
        <span class="zn"><b>Z${z.z}</b> ${esc(z.name)}</span><span class="zr">${i === 0 ? zRangeFirst(z) : zRange(z)} bpm</span>
        <span class="zt">${duration(zt.secs[i])}</span><span class="zp">${pct}%</span></div>`;
    }).join("")}</div>
    <p class="small muted" style="margin-top:8px">${{
      watch: "จากหน้า Heart Rate Zones ใน Apple Watch / แอป Fitness",
      stream: "คำนวณจากข้อมูลหัวใจทุกวินาที",
      splits: "ประมาณจาก HR เฉลี่ยรายกิโล — ส่งภาพหน้า Heart Rate Zones จากแอป Fitness มาจะได้ตัวเลขจริง",
    }[zt.source] || ""}</p>`;
}

const ICON = {
  flame: `<svg viewBox="0 0 24 24"><path fill="var(--amber)" d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.3.9 2.3 2 2.3 1.5 0 2.2-1.4 1.8-3.2 2.6 1.7 4.2 4.3 4.2 7.1A6.5 6.5 0 0 1 12 22a6.5 6.5 0 0 1-6.5-6.3C5.5 10.6 10.5 8 12 2z"/><path fill="var(--card)" opacity=".55" d="M12 22a3 3 0 0 1-3-3c0-2 1.6-3 3-5 1.4 2 3 3 3 5a3 3 0 0 1-3 3z"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  shoe: `<svg viewBox="0 0 24 24"><path d="M3 17V8.5l4 1.5 2.5-2 1.5 3.5 6 2.5c2 .8 4 1.6 4 3.5V17z"/><path d="M3 17v2h19v-2M12 14l1.5-1M14.5 15l1.5-1"/></svg>`,
  dumbbell: `<svg viewBox="0 0 24 24"><path d="M6 8v8M3.5 10v4M18 8v8M20.5 10v4M6 12h12"/></svg>`,
  cal: `<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>`,
  chart: `<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8M9.5 17h5"/></svg>`,
  flag: `<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>`,
  coach: `<svg viewBox="0 0 24 24"><path d="M5 4h14v12H9l-4 4z"/><path d="M9 9h6M9 12h4"/></svg>`,
  grid: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>`,
  left: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  right: `<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
};

// ---------- sections: every page belongs to one main tab; pages inside a tab share a sub-menu ----------
const SUBNAV = {
  plan: [["#/plan", "แผนรายสัปดาห์"], ["#/goal", "เป้าหมาย & เส้นทาง"]],
  runs: [["#/runs", "บันทึกการวิ่ง"], ["#/runs/stats", "สถิติ"], ["#/zones", "โซนหัวใจ"]],
  strength: [["#/strength", "บันทึก"], ["#/strength/progress", "พัฒนาการ"], ["#/exercises", "คลังท่า"]],
  health: [["#/health", "การฟื้นตัว"], ["#/sleep", "การนอน"]],
};
function subnav(group, active) {
  return `<nav class="subnav" aria-label="เมนูย่อย">${SUBNAV[group].map(([href, label]) =>
    `<a href="${href}" class="${href === active ? "on" : ""}"${href === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

// ---------- charts (drawn at the container's real width so text stays readable) ----------
const charts = [];
function slot(fn) {
  const id = `c${charts.length}`;
  charts.push({ id, fn });
  return `<div class="chart-slot" id="${id}"></div>`;
}
function drawCharts() {
  for (const c of charts) {
    const el = document.getElementById(c.id);
    if (el) el.innerHTML = c.fn(Math.max(260, el.clientWidth));
  }
}
let resizeT;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(drawCharts, 120); });

function weeklyChart(weekly, thisWeek) {
  return (W) => {
    const H = Math.round(Math.min(300, Math.max(220, W * 0.6))), padL = 30, padR = 6, padT = 22, padB = 28;
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = Math.max(10, ...weekly.map((w) => Math.max(w.km, w.planned_km))) * 1.15;
    const step = max > 30 ? 10 : 5;
    const n = weekly.length, bw = iw / n, gap = Math.min(10, bw * 0.28);
    const y = (v) => padT + ih - (v / max) * ih;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="ระยะวิ่งรายสัปดาห์">`;
    for (let v = 0; v <= max; v += step) {
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    const labelEvery = W < 500 ? 4 : 2;
    weekly.forEach((w, i) => {
      const x = padL + i * bw + gap / 2, bwid = bw - gap;
      const future = w.week_start > thisWeek;
      const current = w.week_start === thisWeek;
      if (w.km > 0) {
        const h = Math.max(3, ih - (y(w.km) - padT));
        s += `<rect class="bar" x="${x}" y="${y(w.km)}" width="${bwid}" height="${h}" rx="${Math.min(6, bwid / 3)}"/>`;
      }
      if (w.planned_km > 0) {
        if (future || w.km < w.planned_km) {
          s += `<rect x="${x}" y="${y(w.planned_km)}" width="${bwid}" height="${ih - (y(w.planned_km) - padT)}" rx="${Math.min(6, bwid / 3)}" fill="none" stroke="var(--sky)" stroke-width="1.5" stroke-dasharray="4 4" opacity=".8"/>`;
        } else {
          s += `<line class="plan-cap" x1="${x + 2}" x2="${x + bwid - 2}" y1="${y(w.planned_km)}" y2="${y(w.planned_km)}"/>`;
        }
      }
      if (current) {
        s += `<text x="${x + bwid / 2}" y="${H - 8}" text-anchor="middle" style="fill:var(--ink);font-weight:700">สัปดาห์นี้</text>`;
        if (w.km > 0) s += `<text class="val" x="${x + bwid / 2}" y="${y(w.km) - 6}" text-anchor="middle" style="fill:var(--volt)">${kmFixed(w.km)}</text>`;
      } else if ((i - (weekly.length - 5)) % labelEvery === 0 && Math.abs(i - (weekly.length - 5)) > 1) {
        s += `<text x="${x + bwid / 2}" y="${H - 8}" text-anchor="middle">${dShort(w.week_start)}</text>`;
      }
    });
    return s + "</svg>";
  };
}

function paceHrChart(splits, cap) {
  return (W) => {
    const H = 230, padL = 40, padR = 40, padT = 18, padB = 28;
    const iw = W - padL - padR, ih = H - padT - padB;
    const paces = splits.map((s) => s.pace_s), hrs = splits.map((s) => s.avg_hr).filter(Boolean);
    const pMin = Math.min(...paces) - 30, pMax = Math.max(...paces) + 30;
    const hMin = Math.min(...hrs, cap) - 10, hMax = Math.max(...hrs, cap) + 8;
    const n = splits.length;
    const x = (i) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const yp = (p) => padT + ((p - pMin) / (pMax - pMin)) * ih; // faster = higher
    const yh = (h) => padT + ih - ((h - hMin) / (hMax - hMin)) * ih;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="เพซและหัวใจรายกิโล">`;
    for (let k = 0; k <= 4; k++) {
      const yy = padT + (k / 4) * ih;
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
      s += `<text x="${padL - 6}" y="${yy + 4}" text-anchor="end" style="fill:var(--sky)">${pace(pMin + (k / 4) * (pMax - pMin))}</text>`;
      s += `<text x="${W - padR + 6}" y="${yy + 4}" style="fill:var(--coral)">${Math.round(hMax - (k / 4) * (hMax - hMin))}</text>`;
    }
    s += `<line x1="${padL}" x2="${W - padR}" y1="${yh(cap)}" y2="${yh(cap)}" stroke="var(--coral)" stroke-dasharray="3 5" opacity=".5"/>`;
    s += `<text x="${W - padR - 4}" y="${yh(cap) - 6}" text-anchor="end" style="fill:var(--coral);opacity:.8">HR เบา ≤ ${cap}</text>`;
    const pPts = splits.map((sp, i) => `${x(i)},${yp(sp.pace_s)}`).join(" ");
    const hPts = splits.filter((sp) => sp.avg_hr).map((sp) => `${x(splits.indexOf(sp))},${yh(sp.avg_hr)}`).join(" ");
    s += `<polygon points="${padL},${padT + ih} ${pPts} ${x(n - 1)},${padT + ih}" fill="var(--sky)" opacity=".08"/>`;
    s += `<polyline points="${pPts}" fill="none" stroke="var(--sky)" stroke-width="2.5" stroke-linejoin="round"/>`;
    s += `<polyline points="${hPts}" fill="none" stroke="var(--coral)" stroke-width="2.5" stroke-linejoin="round"/>`;
    splits.forEach((sp, i) => {
      s += `<circle cx="${x(i)}" cy="${yp(sp.pace_s)}" r="3.5" fill="var(--card)" stroke="var(--sky)" stroke-width="2"/>`;
      if (sp.avg_hr) s += `<circle cx="${x(i)}" cy="${yh(sp.avg_hr)}" r="3.5" fill="var(--card)" stroke="var(--coral)" stroke-width="2"/>`;
      s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${sp.distance_km < 0.95 ? kmFixed(sp.distance_km, 2) : sp.split_no}</text>`;
    });
    return s + "</svg>";
  };
}

// Full-route pace or HR area chart from downsampled Strava streams
// Cadence: 15-s windows at 140+ spm count as running (same rule as src/runingest.ts); suggested running band.
const CAD_RUN = 140, CAD_BAND = [165, 180];

function streamChart(pts, kind, cap) {
  return (W) => {
    const H = 170, padL = 44, padR = 10, padT = 10, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const d = pts.d, maxD = d[d.length - 1] || 1;
    const x = (km) => padL + (km / maxD) * iw;
    let vals, lo, hi, color, fmtY, invert;
    if (kind === "pace") {
      const SLOW = 960; // clip walking at 16:00/km like Strava
      vals = pts.v.map((v) => (v > 0.4 ? Math.min(SLOW, 1000 / v) : SLOW));
      lo = Math.max(240, Math.floor((Math.min(...vals) - 20) / 60) * 60); hi = SLOW;
      color = "var(--sky)"; fmtY = pace; invert = true;
    } else if (kind === "cad") {
      lo = 110; hi = 200; // ticks 110 / 140 (run threshold) / 170 / 200
      vals = pts.cad.map((v) => Math.max(lo, Math.min(hi, v ?? lo)));
      color = "var(--amber)"; fmtY = (v) => Math.round(v); invert = false;
    } else {
      vals = pts.hr;
      lo = Math.floor((Math.min(...vals) - 5) / 10) * 10; hi = Math.ceil((Math.max(...vals, cap) + 5) / 10) * 10;
      color = "var(--coral)"; fmtY = (v) => Math.round(v); invert = false;
    }
    const y = (v) => invert ? padT + ((v - lo) / (hi - lo)) * ih : padT + ih - ((v - lo) / (hi - lo)) * ih;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${{ pace: "เพซ", hr: "หัวใจ", cad: "รอบขา" }[kind]}ตลอดเส้นทาง">`;
    if (kind === "cad") s += `<rect x="${padL}" width="${iw}" y="${y(CAD_BAND[1])}" height="${y(CAD_BAND[0]) - y(CAD_BAND[1])}" fill="var(--amber-soft)"/>`;
    for (let k = 0; k <= 3; k++) {
      const v = lo + (k / 3) * (hi - lo), yy = y(v);
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end">${fmtY(v)}</text>`;
    }
    const tick = maxD > 12 ? 2 : 1;
    for (let k = tick; k < maxD; k += tick) s += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">${k} km</text>`;
    if (kind === "hr") s += `<line x1="${padL}" x2="${W - padR}" y1="${y(cap)}" y2="${y(cap)}" stroke="var(--coral)" stroke-dasharray="3 5" opacity=".6"/>`;
    const line = vals.map((v, i) => `${x(d[i]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const base = padT + ih;
    s += `<polygon points="${padL},${base} ${line} ${x(maxD)},${base}" fill="${color}" opacity=".22"/>`;
    s += `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`;
    return s + "</svg>";
  };
}

function sparkSplits(splits, zones) {
  if (!splits.length) return "";
  const W = 160, H = 44, n = splits.length, bw = W / n;
  const speeds = splits.map((s) => 1 / s.pace_s);
  const max = Math.max(...speeds), min = Math.min(...speeds) * 0.8;
  let s = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  splits.forEach((sp, i) => {
    const h = 6 + ((speeds[i] - min) / (max - min || 1)) * (H - 6);
    s += `<rect x="${i * bw + 1.5}" y="${H - h}" width="${bw - 3}" height="${h}" rx="3" style="fill:${zColor(sp.avg_hr, zones)}"/>`;
  });
  return s + "</svg>";
}

function ring(value, total) {
  const r = 46, c = 2 * Math.PI * r, f = Math.min(1, value / total);
  return `<svg class="ring" viewBox="0 0 112 112" aria-hidden="true">
    <circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
    <circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--volt)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c * f} ${c}" transform="rotate(-90 56 56)"/>
    <text x="56" y="53" text-anchor="middle" style="font-family:var(--num);font-weight:700;font-size:24px;fill:var(--ink)">${Math.round(f * 100)}%</text>
    <text x="56" y="72" text-anchor="middle" style="font-size:11px;fill:var(--ink-3)">ของ 21.1 km</text>
  </svg>`;
}

// ---------- views ----------
function journey(phases, today) {
  if (!phases.length) return "";
  const total = phases.reduce((s, p) => s + (toD(p.end_date) - toD(p.start_date)), 0);
  const segs = phases.map((p) => {
    const len = toD(p.end_date) - toD(p.start_date);
    const flex = (len / total).toFixed(4);
    let fill = 0;
    if (today > p.end_date) fill = 100;
    else if (today >= p.start_date) fill = Math.max(2, ((toD(today) - toD(p.start_date)) / len) * 100);
    const cur = today >= p.start_date && today <= p.end_date;
    return { p, flex, fill, cur };
  });
  return `<div class="journey">
    <div class="journey-track">${segs.map((s) => `<div class="journey-seg ${s.cur ? "current" : ""}" style="flex:${s.flex}"><i style="width:${s.fill}%"></i></div>`).join("")}</div>
    <div class="journey-labels">${segs.map((s) => `<div class="${s.cur ? "current" : ""}" style="flex:${s.flex}"><b>${esc(s.p.name)}</b><span>${dShort(s.p.start_date)}</span></div>`).join("")}</div>
  </div>`;
}

function weekDots(d) {
  const ws = d.week_start;
  const acts = new Map((d.daily_streak?.days || []).map((x) => [x.date, x.types]));
  let html = "";
  for (let i = 0; i < 7; i++) {
    const day = addDays(ws, i);
    const ran = d.this_week.runs.filter((r) => r.run_date === day);
    // A plan moved to another day no longer belongs on this one.
    const planned = d.this_week.planned.filter((p) => p.workout_date === day && p.status !== "moved");
    const runPlan = planned.find((p) => RUN_KINDS.has(p.kind));
    const strength = planned.find((p) => p.kind === "strength");
    // What was actually done that day (same source and colours as the main-goal calendar).
    const act = actOf((acts.get(day) || []).filter((t) => t !== "run"));
    let cls = "", inner = "";
    if (ran.length) { cls = "done"; inner = kmFixed(ran.reduce((s, r) => s + r.distance_km, 0)); }
    else if (runPlan && runPlan.status === "done") { cls = "done"; inner = ICON.check; }
    else if (runPlan && day < d.today) { cls = "missed"; inner = "!"; }
    else if (runPlan) { cls = "planned"; inner = runPlan.target_km ? kmFixed(runPlan.target_km, 0) : "•"; }
    else if (act) { cls = `act act-${act}`; inner = act === "strength" ? ICON.dumbbell : ICON.check; }
    else if (strength?.status === "done") { cls = "act act-strength"; inner = ICON.dumbbell; }
    else if (strength) { cls = "strength"; inner = ICON.dumbbell; }
    const label = `${dLong(day)}: ${planned.map((p) => p.title).join(", ") || "วันพัก"}`;
    html += `<button type="button" class="day ${cls} ${day === d.today ? "today" : ""}" data-day="${day}" aria-label="${esc(label)}">
      <span class="dot">${inner}</span><span class="lbl">${DOW[i]}</span></button>`;
  }
  return `<div class="week-dots">${html}</div><p class="dots-hint">แตะแต่ละวันเพื่อดูว่าต้องเตรียมตัวและซ้อมอย่างไร</p>`;
}

// Time is the target for run/walk sessions; km is only an estimate of where that time lands.
function targetTags(w) {
  const timed = w.target_min && w.status !== "done";
  return [
    w.target_min ? `<span class="tag ${timed ? "main" : ""}">${timed ? "⏱ " : ""}${w.target_min} นาที</span>` : "",
    w.target_km ? `<span class="tag">${timed ? `ระยะประมาณ ${kmFixed(w.target_km)} km` : `${kmFixed(w.target_km)} km`}</span>` : "",
    w.target_pace ? `<span class="tag">เพซ ${esc(w.target_pace)}</span>` : "",
    w.target_hr ? `<span class="tag hr">HR ${esc(w.target_hr)}</span>` : "",
  ].join("");
}

function workoutRow(w, today, opts = {}) {
  const missed = w.status === "planned" && w.workout_date < today && w.kind !== "rest";
  const st = missed ? "missed" : w.status;
  const targets = targetTags(w);
  return `<div class="workout ${w.status === "done" ? "done" : ""} ${w.kind === "rest" ? "rest" : ""}">
    <div class="wdate ${w.workout_date === today ? "today" : ""}"><div class="d">${toD(w.workout_date).getUTCDate()}</div><div class="m">${dWeekday(w.workout_date)}</div></div>
    <div class="wbody">
      <div class="wtitle">${esc(w.title)} ${chip(w.kind)} ${statusChip(st)}</div>
      ${w.details && !opts.compact ? `<div class="wdetails">${esc(w.details)}</div>` : ""}
      ${targets ? `<div class="wtargets">${targets}</div>` : ""}
      ${!opts.compact && (w.steps?.length || w.purpose) ? `<details class="wsteps"><summary>ดูวิธีทำทีละขั้น</summary>${dayDetail(w)}</details>` : ""}
      ${opts.actual ? opts.actual : ""}
    </div>
  </div>`;
}

function exCard(ex, open = false) {
  return `<details class="ex" ${open ? "open" : ""}>
    <summary>${pictogram(ex)}<div class="ex-name"><b>${esc(ex.name)}</b><span>${esc(ex.th)}</span><small>${esc(ex.muscles)}</small></div><span class="ex-toggle" aria-hidden="true"></span></summary>
    <div class="ex-body">
      <p class="purpose"><b>ทำไมนักวิ่งต้องทำ:</b> ${esc(ex.why)}</p>
      <h4 class="sec">วิธีทำ</h4>
      <ol class="steps">${ex.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      ${ex.cues.length ? `<h4 class="sec">จุดสังเกต</h4><ul class="bullets">${ex.cues.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${ex.mistakes.length ? `<h4 class="sec">ผิดบ่อย</h4><ul class="bullets warn">${ex.mistakes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <a class="ex-video" href="${ytLink(ex)}" target="_blank" rel="noopener">▶ ดูวิดีโอตัวอย่างใน YouTube</a>
    </div>
  </details>`;
}

function exerciseSection(w) {
  const list = exercisesIn(w.steps);
  if (!list.length) return "";
  return `<div class="ex-sec"><div class="ex-sec-head"><h4 class="sec">ท่าที่ใช้วันนี้ · แตะเพื่อดูวิธีทำ</h4><a class="link small" href="#/exercises">ท่าทั้งหมด →</a></div>
    <div class="ex-list">${list.map((ex) => exCard(ex)).join("")}</div></div>`;
}

function dayDetail(w, opts = {}) {
  const showPrep = w.prep?.length && w.status !== "done" && !opts.noPrep;
  return `${w.purpose ? `<p class="purpose"><b>ทำไปเพื่อ:</b> ${esc(w.purpose)}</p>` : ""}
    ${showPrep ? `<div class="prep"><h4>เตรียมตัวล่วงหน้า</h4><ul class="checks">${w.prep.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${w.steps?.length ? `${opts.stepsTitle ? `<h4 class="sec">${opts.stepsTitle}</h4>` : ""}<ol class="steps">${w.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    ${w.kind === "strength" ? exerciseSection(w) : ""}
    ${w.kind === "strength" && w.id ? (w.workout_id ? `<a class="btn-log done" href="#/strength/${w.workout_id}">${ICON.dumbbell} ดูบันทึกเวท</a>` : `<a class="btn-log" href="#/strength/go/p${w.id}">${ICON.dumbbell} เริ่มเล่นเวท · ดูท่าและบันทึกทีละเซ็ต</a>
      <a class="link small btn-log-alt" href="#/strength/new/p${w.id}">หรือกรอกย้อนหลังแบบฟอร์ม</a>`) : ""}
    ${w.tips?.length ? `<div class="tips"><h4>เคล็ดลับ</h4><ul class="bullets next">${w.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}`;
}

const REST_DAY = {
  purpose: "วันพักค่ะ ให้ร่างกายได้ซ่อมแซม ความฟิตเกิดขึ้นตอนพัก ไม่ใช่ตอนซ้อมนะคะ",
  steps: ["เดินสบายๆ 20–30 นาที ให้ HR อยู่ Z1", "ยืดน่อง ต้นขา สะโพก ท่าละ 30–45 วินาที", "ดื่มน้ำให้พอ นอน 7–8 ชม."],
  tips: ["ไม่ต้องวิ่งชดเชยวันที่พลาดไปนะคะ แพรปรับแผนให้เอง"],
};

function whenLabel(day, today) {
  const n = Math.round((toD(day) - toD(today)) / 86400000);
  if (n === 0) return "วันนี้";
  if (n === 1) return "พรุ่งนี้";
  if (n > 1) return `อีก ${n} วัน`;
  if (n === -1) return "เมื่อวาน";
  return `${-n} วันที่แล้ว`;
}

function openDay(day, items, runs = []) {
  const d = lastDash;
  let dlg = document.getElementById("daySheet");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "daySheet";
    dlg.className = "sheet";
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
  }
  const targets = targetTags;
  const ranHtml = runs.length ? `<a class="done-banner" href="#/runs/${runs[runs.length - 1].id}">${ICON.check}<span>วิ่งแล้ว ${runs.map((r) => `${kmFixed(r.distance_km, 2)} km · ${pace(r.avg_pace_s)}/km${r.avg_hr ? ` · HR ${r.avg_hr}` : ""}`).join(" / ")} — ดูบทวิเคราะห์</span></a>` : "";
  const body = items.length
    ? items.map((w) => `<div class="today-item">
        <div class="wtitle" style="font-size:19px">${esc(w.title)} ${chip(w.kind)} ${statusChip(w.status)}</div>
        ${targets(w) ? `<div class="wtargets">${targets(w)}</div>` : ""}
        ${w.status === "done" && RUN_KINDS.has(w.kind) ? `<h4 class="after">หลังวิ่ง</h4>` : ""}
        ${dayDetail(w, { stepsTitle: w.status === "done" ? "" : "ขั้นตอนการซ้อม" })}
      </div>`).join("")
    : `<div class="today-item"><div class="wtitle" style="font-size:19px">วันพัก ${chip("rest")}</div>${dayDetail(REST_DAY)}</div>`;
  dlg.innerHTML = `<div class="sheet-inner">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      <div><div class="eyebrow">${whenLabel(day, d?.today ?? day)}</div><h2>${dLong(day)}</h2></div>
      <button type="button" class="sheet-x" data-close aria-label="ปิด">✕</button>
    </div>
    ${ranHtml}${body}
  </div>`;
  dlg.showModal();
  dlg.querySelector(".sheet-inner").scrollTop = 0;
}

const READY = {
  good: ["พร้อมซ้อม", "ร่างกายฟื้นตัวดีค่ะ ลุยตามแผนได้เลย"],
  fair: ["พอใช้ — เบาลงนิด", "ซ้อมได้ค่ะ แต่คุม HR ให้อยู่ครึ่งล่างของโซน ถ้ารู้สึกหนักตัดให้สั้นลงได้เลยนะคะ"],
  low: ["ควรพักหรือเบามาก", "ร่างกายส่งสัญญาณล้าหลายอย่างค่ะ วันนี้แพรขอให้เดินเบาหรือพัก พรุ่งนี้เรากลับมาแรงกว่าเดิม"],
};
const FLAG = { rhr: "HR พักสูงกว่าปกติ", hrv: "HRV ต่ำกว่าปกติ", sleep: "นอนน้อยกว่า 6.5 ชม." };
const r0 = (v) => (v == null ? "–" : Math.round(v));
const hrsMin = (m) => (m == null ? "–" : `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`);

function readinessStrip(r) {
  if (!r) return "";
  const [label, advice] = READY[r.status];
  return `<a class="ready r-${r.status}" href="#/health">
    <div class="ready-top"><span class="ready-dot"></span><b>ความพร้อม: ${label}</b><span class="ready-date">${r.stale_days > 0 ? `ข้อมูล ${dShort(r.date)}` : "วันนี้"}</span></div>
    <div class="ready-nums">
      <span>HR พัก <b>${r0(r.rhr)}</b> <small>ปกติ ${r0(r.rhr_base)}</small></span>
      <span>HRV <b>${r0(r.hrv)}</b> <small>ปกติ ${r0(r.hrv_base)}</small></span>
      <span>นอน <b>${hrsMin(r.sleep_min)}</b> <small>ชม.</small></span>
    </div>
    <div class="ready-adv">${r.flags.length ? `${r.flags.map((f) => FLAG[f]).join(" · ")} — ` : ""}${advice}</div>
  </a>`;
}

/** Morning check written by the coach (analyses.scope = 'day'). */
/** "โค้ชแพร" from profile.coach_name, else plain "โค้ช". */
const coachLabel = (name) => (name ? `โค้ช${name}` : "โค้ช");

function dayNoteBlock(n, today, coach) {
  if (!n) return "";
  const when = n.for_date && n.for_date !== today ? `${dShort(n.for_date)} · ` : "";
  return `<div class="day-note">
    <div class="dn-head">${ICON.coach}<b>${esc(coachLabel(coach))} เช็ควันนี้</b><span class="dn-time">${when}${esc((n.created_at || "").slice(11, 16))}</span></div>
    <div class="dn-verdict">${esc(n.verdict || n.title)}</div>
    ${n.next_steps?.length ? `<ul class="bullets next">${n.next_steps.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <a class="link small" href="#/notes">อ่านเต็ม →</a>
  </div>`;
}

function todayCard(d) {
  const items = d.today_plan || [];
  const ran = d.today_runs || [];
  const head = `<div class="card-head"><h2>${ICON.cal} วันนี้ · ${dLong(d.today)}</h2></div>`;
  const wk = d.today_workouts || [];
  const wkBanner = wk.length ? `<a class="done-banner" href="#/strength/${wk[wk.length - 1].id}">${ICON.dumbbell}<span>บันทึกเวทแล้ววันนี้ · ${wk.map((x) => (x.n_ex ? `${x.n_ex} ท่า` : "ยังไม่ได้กรอกท่า") + (x.avg_hr ? ` · HR ${x.avg_hr}` : "")).join(" / ")}</span></a>` : "";
  const doneBanner = ran.length ? `<a class="done-banner" href="#/runs/${ran[ran.length - 1].id}">${ICON.check}<span>วิ่งแล้ววันนี้ ${ran.map((r) => `${kmFixed(r.distance_km, 2)} km · ${pace(r.avg_pace_s)}/km${r.avg_hr ? ` · HR ${r.avg_hr}` : ""}`).join(" / ")}</span></a>` : "";
  let body;
  if (items.length) {
    body = items.map((w) => `<div class="today-item">
      <div class="wtitle" style="font-size:18px">${esc(w.title)} ${chip(w.kind)} ${statusChip(w.status)}</div>
      <div class="wtargets">
        ${targetTags(w)}
      </div>
      ${ran.length && RUN_KINDS.has(w.kind) ? `<h4 class="after">หลังวิ่งวันนี้</h4>` : ""}
      ${dayDetail(w)}
    </div>`).join("");
  } else {
    body = `<div class="today-item"><div class="wtitle" style="font-size:18px">วันพัก ${chip("rest")}</div>
      ${dayDetail({ purpose: "วันพักค่ะ ให้ร่างกายได้ซ่อมแซม ความฟิตเกิดขึ้นตอนพัก ไม่ใช่ตอนซ้อมนะคะ",
        steps: [`เดินสบายๆ 20–30 นาที ให้ HR อยู่ Z1 (ต่ำกว่า ${d.zones[1].lo})`, "ยืดน่อง ต้นขา สะโพก ท่าละ 30–45 วินาที", "ดื่มน้ำให้พอ นอน 7–8 ชม."],
        tips: ["ไม่ต้องวิ่งชดเชยวันที่พลาดไปนะคะ แพรปรับแผนให้เอง"] })}</div>`;
  }
  // Quick log: today's planned strength session pre-fills the form; an existing log opens for editing.
  const sPlan = items.find((w) => w.kind === "strength" && !w.workout_id);
  const logged = wk[wk.length - 1];
  const draft = loadDraft();
  const quick = `<div class="quick-log">
    ${draftSets(draft) ? `<a class="btn-primary" href="#/strength/go/${draft.key}">${ICON.dumbbell} เล่นต่อ: ${esc(draft.title)} (${draftSets(draft)} เซ็ต)</a>`
      : logged ? `<a class="btn-primary" href="#/strength/${logged.id}">${ICON.dumbbell} ดูบันทึกเวทวันนี้</a>`
      : `<a class="btn-primary" href="#/strength/go/${sPlan ? `p${sPlan.id}` : "new"}">${ICON.dumbbell} เริ่มเล่นเวท</a>`}
    <a class="btn-ghost" href="#/strength/progress">ดูพัฒนาการ</a></div>`;
  const next = d.next_plan ? `<div class="next-line">ถัดไป: <b>${esc(d.next_plan.title)}</b> · ${dWeekday(d.next_plan.workout_date)} ${dShort(d.next_plan.workout_date)}</div>` : "";
  return `<section class="card today span-7">${head}${quick}${readinessStrip(d.readiness)}${dayNoteBlock(d.today_note, d.today, d.profile?.coach_name)}${doneBanner}${wkBanner}${body}${next}</section>`;
}

const ACT = { run: ["วิ่ง", "var(--volt)"], strength: ["เวท", "var(--sky)"], mobility: ["ยืดเหยียด", "var(--mobility)"], other: ["เดิน/อื่นๆ", "var(--amber)"] };
const actOf = (types) => ["run", "strength", "mobility", "other"].find((t) => types.includes(t)) || (types.length ? "other" : null);

/** Top of the home page: the main goal (exercise every day) and the four numbers the athlete checks first —
 * streak, km this week vs plan, km since the journal started, minutes of exercise this week — then the 4-week calendar. */
function dailyCard(d) {
  const ds = d.daily_streak;
  if (!ds) return "";
  const sm = d.summary || {}, tw = d.this_week, am = sm.active_min || { total: 0, run: 0, strength: 0, other: 0 };
  const map = Object.fromEntries(ds.days.map((x) => [x.date, x.types]));
  const dow = (toD(d.today).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(d.today, -dow - 21);
  const cells = Array.from({ length: 28 }, (_, i) => {
    const day = addDays(start, i), types = map[day] || [], a = actOf(types);
    const cls = day > d.today ? "future" : day === d.today ? "today" : "";
    const tip = `${dShort(day)}${types.length ? ` · ${types.map((t) => ACT[t]?.[0] || t).join(" + ")}` : day > d.today ? "" : " · พัก"}`;
    return `<i class="${cls}" title="${esc(tip)}" style="${a ? `background:${ACT[a][1]}` : ""}">${types.length > 1 ? "<b></b>" : ""}</i>`;
  }).join("");
  const toGo = ds.next_goal - ds.current;
  const streakPct = Math.min(100, (ds.current / ds.next_goal) * 100);
  const kmPct = tw.planned_km ? Math.min(100, (tw.km / tw.planned_km) * 100) : 0;
  const coach = coachLabel(d.profile?.coach_name);
  const state = ds.today_active
    ? `<div class="ds-state ok">${ICON.check} วันนี้ขยับแล้ว เยี่ยมค่ะ!</div>`
    : `<div class="ds-state todo">วันนี้ยังไม่ได้ขยับ${ds.current ? ` · ทำวันนี้เพื่อเป็น ${ds.current + 1} วัน` : ""}</div>`;
  const line = ds.current
    ? `เดินเบา 20 นาทีหรือยืดเหยียดก็นับแล้วค่ะ รักษา ${ds.current} วันไว้นะคะ!`
    : "เริ่มนับวันแรกกันค่ะ วันพักก็นับได้ แค่เดินหรือยืดเหยียด 20 นาที";
  const parts = [["run", am.run], ["strength", am.strength], ["other", am.other]].filter(([, v]) => v > 0);
  const minBar = am.total ? `<div class="sum-bar">${parts.map(([t, v]) => `<i style="width:${(v / am.total) * 100}%;background:${ACT[t][1]}"></i>`).join("")}</div>` : `<div class="sum-bar"></div>`;
  return `<section class="card span-12 daily main-streak">
    <div class="eyebrow">เป้าหมายหลัก · ออกกำลังกายทุกวัน</div>
    <div class="sum-tiles">
      <div class="sum-tile streak-tile">
        <div class="label">${ICON.flame} ติดกัน</div>
        <div class="v"><span class="num">${ds.current}</span><small>วัน</small></div>
        <div class="progress-line amber"><i style="width:${streakPct}%"></i></div>
        <div class="foot">เป้า ${ds.next_goal} วัน · อีก ${toGo}${toGo === 1 ? "!" : ""}</div>
      </div>
      <a class="sum-tile" href="#/plan">
        <div class="label">${ICON.shoe} วิ่งสัปดาห์นี้</div>
        <div class="v"><span class="num">${kmFixed(tw.km)}</span><small>/ ${kmFixed(tw.planned_km)} km</small></div>
        <div class="progress-line"><i style="width:${kmPct}%"></i></div>
        <div class="foot">${tw.runs.length} ครั้ง${tw.planned_km ? ` · ${tw.km >= tw.planned_km ? "ครบเป้าแล้ว!" : `เหลือ ${kmFixed(tw.planned_km - tw.km)} km`}` : ""}</div>
      </a>
      <a class="sum-tile" href="#/runs/stats">
        <div class="label">${ICON.trophy} วิ่งรวม</div>
        <div class="v"><span class="num">${kmFixed(sm.journal_km ?? 0)}</span><small>km</small></div>
        <div class="foot">${sm.journal_runs ?? 0} ครั้ง · ตั้งแต่ ${sm.journal_start ? dShort(sm.journal_start) : "เริ่มใช้"}</div>
      </a>
      <div class="sum-tile">
        <div class="label">${ICON.heart} นาทีสัปดาห์นี้</div>
        <div class="v"><span class="num">${am.total}</span><small>นาที</small></div>
        ${minBar}
        <div class="foot">${parts.length ? parts.map(([t, v]) => `${{ run: "วิ่ง", strength: "เวท", other: "อื่นๆ" }[t]} ${v}`).join(" · ") : "ยังไม่มี"}</div>
      </div>
    </div>
    <div class="sum-row">
      <div>${state}<div class="small muted">ดีสุด ${ds.best} วัน · 30 วันล่าสุดขยับ ${ds.active_30} วัน</div></div>
      <div class="sum-cal">
        <div class="dcal-head">${["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((x) => `<span>${x}</span>`).join("")}</div>
        <div class="dcal">${cells}</div>
        <div class="dcal-legend">${["run", "strength", "mobility", "other"].map((t) => `<span><i style="background:${ACT[t][1]}"></i>${ACT[t][0]}</span>`).join("")}</div>
      </div>
    </div>
    ${ds.today_active ? "" : `<p class="daily-coach"><b>${esc(coach)}:</b> ${esc(line)}</p>
    <div class="quick-log"><a class="btn-primary" href="#/strength/new/k-other">+ เดิน / ยืดเหยียด</a><a class="btn-ghost" href="#/strength/go/new">เริ่มเล่นเวท</a></div>`}
  </section>`;
}

/** This week's running: km vs plan, the plan day dots, and the (secondary) weeks-in-a-row run count. */
function weekCard(d) {
  const tw = d.this_week, st = d.streak;
  const pct = tw.planned_km ? Math.min(100, (tw.km / tw.planned_km) * 100) : 0;
  const chip = st.active_this_week
    ? `<span class="run-weeks" title="มีวิ่งอย่างน้อย 1 ครั้งทุกสัปดาห์ · ดีสุด ${st.best} สัปดาห์">${ICON.check} วิ่งครบทุกสัปดาห์ <b>${st.current}</b> สัปดาห์</span>`
    : `<span class="run-weeks todo" title="ดีสุด ${st.best} สัปดาห์">สัปดาห์นี้ยังไม่ได้วิ่ง</span>`;
  return `<section class="card span-5 week-card">
    <div class="card-head"><h2>${ICON.shoe} วิ่งสัปดาห์นี้</h2>${chip}</div>
    <div class="week-nums"><span class="num">${kmFixed(tw.km)}</span><span class="of">/ ${kmFixed(tw.planned_km)} km ตามแผน</span></div>
    <div class="progress-line"><i style="width:${pct}%"></i></div>
    <div class="small muted">${tw.runs.length} ครั้ง · ${hoursMin(tw.time_s)}</div>
    <div style="margin-top:16px">${weekDots(d)}</div>
  </section>`;
}

function renderZones(d) {
  const p = d.profile;
  const info = [
    ["เดิน / วอร์มอัพ / คูลดาวน์ / ฟื้นตัว", "หายใจทางจมูกได้สบายๆ ค่ะ ใช้ตอนช่วงเดินในวิ่งสลับเดิน และวันฟื้นตัว"],
    ["โซนหลักของการสร้างฐาน (ซ้อม ~80% ของเวลา)", "ยังพูดเป็นประโยคยาวได้ โซนนี้แหละที่สร้างเส้นเลือดฝอยกับไมโทคอนเดรีย อีกไม่นาน HR ที่เพซเดิมจะลดลงเองค่ะ"],
    ["เหนื่อยปานกลาง ‘โซนเทา’", "พูดได้แค่วลีสั้นๆ ช่วงสร้างฐานแพรขอให้เลี่ยงก่อนนะคะ เดี๋ยวได้ใช้ใน long run ช่วงเฉพาะทาง Half (เพซแข่ง)"],
    ["เหนื่อยหนัก ใกล้ขีดจำกัด", "พูดได้ไม่กี่คำ เก็บไว้ใช้ใน tempo / interval ตั้งแต่ Phase 3 ค่ะ"],
    ["เต็มที่", "ช่วงสั้นมาก Half แรกของเรายังไม่จำเป็นค่ะ"],
  ];
  app.innerHTML = `<div class="view">
    ${subnav("runs", "#/zones")}
    <div class="page-head"><div><h1>โซนหัวใจ (HR Zones)</h1>
      <p>คำนวณแบบ Heart Rate Reserve (Karvonen) แบบเดียวกับ Apple Watch: HR สูงสุด ~${esc(p.max_hr)} (สูตร 208 − 0.7 × อายุ ${esc(p.age)}) · HR พัก ${esc(p.resting_hr)}${p.resting_hr_assumed === "1" ? " (ค่าประมาณ — ส่งค่าจริงจากแอป Health มาได้)" : ""}</p></div></div>
    <div class="run-list">${d.zones.map((z, i) => `<section class="card zcard" style="border-left:6px solid ${ZCOL[i]}">
      <div class="zhead"><div><div class="eyebrow">ZONE ${z.z}</div><h2>${esc(z.name)}</h2></div><div class="num zbig">${i === 0 ? zRangeFirst(z) : zRange(z)}<small> bpm</small></div></div>
      <p><b>${info[i][0]}</b></p><p class="muted">${info[i][1]}</p></section>`).join("")}</div>
  </div>`;
}

function rolling(vals, n) {
  return vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - n + 1), i + 1).filter((v) => v != null);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

function tsChart(rows, key, o = {}) {
  return (W) => {
    const H = o.height || 190, padL = 38, padR = 10, padT = 14, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const vals = rows.map((r) => (r[key] == null ? null : o.map ? o.map(r[key]) : r[key]));
    const xs = rows.map((r) => toD(r.date).getTime());
    const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
    const real = vals.filter((v) => v != null);
    if (!real.length) return `<div class="empty">ไม่มีข้อมูล</div>`;
    let lo = Math.min(...real, o.guide ?? Infinity), hi = Math.max(...real, o.guide ?? -Infinity);
    const padv = (hi - lo) * 0.12 || 2; lo -= padv; hi += padv;
    const x = (t) => padL + ((t - x0) / (x1 - x0 || 1)) * iw;
    const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (let k = 0; k <= 3; k++) {
      const v = lo + (k / 3) * (hi - lo);
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${(o.fmt || Math.round)(v)}</text>`;
    }
    let lastM = "";
    rows.forEach((r, i) => {
      const m = r.date.slice(0, 7);
      if (m !== lastM && r.date.slice(8) <= "07") { s += `<text x="${x(xs[i])}" y="${H - 6}" text-anchor="middle">${dMonth(r.date)}</text>`; }
      lastM = m;
    });
    if (o.guide != null) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(o.guide)}" y2="${y(o.guide)}" stroke="${o.color}" stroke-dasharray="4 4" opacity=".7"/><text x="${W - padR}" y="${y(o.guide) - 5}" text-anchor="end" style="fill:${o.color}">${esc(o.guideLabel || "")}</text>`;
    if (o.bars) {
      const bw = Math.max(1.5, iw / rows.length - 1.5);
      vals.forEach((v, i) => { if (v != null) s += `<rect x="${x(xs[i]) - bw / 2}" y="${y(v)}" width="${bw}" height="${padT + ih - y(v)}" rx="${Math.min(2, bw / 2)}" fill="${o.color}" opacity="${o.guide != null && v < o.guide ? 0.45 : 0.9}"/>`; });
    } else {
      vals.forEach((v, i) => { if (v != null) s += `<circle cx="${x(xs[i])}" cy="${y(v)}" r="${o.sparse ? 4 : 1.8}" fill="${o.color}" opacity="${o.sparse ? 1 : 0.35}"/>`; });
      const line = o.sparse ? vals : rolling(vals, o.roll || 7);
      const ptsStr = line.map((v, i) => (v == null ? null : `${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
      s += `<polyline points="${ptsStr}" fill="none" stroke="${o.color}" stroke-width="2.4" stroke-linejoin="round"/>`;
    }
    return s + "</svg>";
  };
}

function yearBars(years) {
  return (W) => {
    const H = 200, padL = 34, padR = 6, padT = 22, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = Math.max(...years.map((y) => y.km), 10) * 1.12;
    const bw = iw / years.length, g = Math.min(10, bw * 0.25);
    const y = (v) => padT + ih - (v / max) * ih;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (let v = 0; v <= max; v += 50) s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    years.forEach((r, i) => {
      const xx = padL + i * bw + g / 2, hm = r.longest_km >= 21;
      s += `<rect x="${xx}" y="${y(r.km)}" width="${bw - g}" height="${padT + ih - y(r.km)}" rx="4" fill="${hm ? "var(--volt)" : "var(--sky)"}" opacity="${hm ? 1 : 0.7}"/>`;
      s += `<text x="${xx + (bw - g) / 2}" y="${H - 6}" text-anchor="middle">${String(r.year).slice(2)}</text>`;
      if (r.km >= 20) s += `<text class="val" x="${xx + (bw - g) / 2}" y="${y(r.km) - 5}" text-anchor="middle">${Math.round(r.km)}</text>`;
    });
    return s + "</svg>";
  };
}

// ---------- health charts with range + suggested bands ----------
let healthRange = "365";
const HRANGES = [["7", "7 วัน"], ["30", "30 วัน"], ["365", "1 ปี"], ["all", "ทั้งหมด"]];

function inRange(rows, key, today) {
  const withVal = rows.filter((r) => r[key] != null);
  if (healthRange === "all") return withVal;
  const from = addDays(today, -Number(healthRange));
  return withVal.filter((r) => r.date > from);
}

/** Time-series chart sized to its slot. o: color, bands [{lo,hi,color,label}], lines [{v,color,label}],
 *  bars, map, fmt, yMin/yMax hints, sparse (no rolling). */
function healthChart(rows, key, o = {}) {
  return (W) => {
    const H = 210, padL = 40, padR = 12, padT = 14, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    if (!rows.length) return `<div class="empty">ไม่มีข้อมูลในช่วงนี้</div>`;
    const val = (r) => (o.map ? o.map(r[key]) : r[key]);
    const vals = rows.map(val);
    const t0 = toD(rows[0].date).getTime(), t1 = toD(rows[rows.length - 1].date).getTime();
    const spanDays = Math.max(1, (t1 - t0) / 86400000);
    let lo = Math.min(...vals, o.yMin ?? Infinity), hi = Math.max(...vals, o.yMax ?? -Infinity);
    if (!o.fixed) for (const b of o.bands || []) { if (b.lo != null && b.lo > lo - (hi - lo)) lo = Math.min(lo, b.lo); if (b.hi != null && b.hi < hi + (hi - lo)) hi = Math.max(hi, b.hi); }
    for (const l of o.lines || []) { lo = Math.min(lo, l.v); hi = Math.max(hi, l.v); }
    if (o.bars) lo = 0;
    const padV = (hi - lo) * 0.08 || 1; if (!o.bars) lo -= padV; hi += padV;
    const x = (r) => padL + (t1 === t0 ? iw / 2 : ((toD(r.date).getTime() - t0) / (t1 - t0)) * iw);
    const y = (v) => padT + ih - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * ih;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (const b of o.bands || []) {
      const top = y(Math.min(hi, b.hi ?? hi)), bot = y(Math.max(lo, b.lo ?? lo));
      if (bot - top < 2) continue;
      s += `<rect x="${padL}" y="${top}" width="${iw}" height="${bot - top}" fill="${b.color}" opacity="${b.opacity ?? 0.13}"/>`;
      if (b.label) s += `<text class="halo" x="${W - padR - 4}" y="${top + 13}" text-anchor="end" style="fill:${b.color};font-weight:600">${esc(b.label)}</text>`;
    }
    for (let k = 0; k <= 3; k++) { const v = lo + (k / 3) * (hi - lo); s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${(o.fmt || Math.round)(v)}</text>`; }
    // x labels by span (never closer than 34 px)
    let last = "", lastX = -Infinity;
    const put = (xx, lab) => { if (xx - lastX >= 34 && xx >= padL - 2 && xx <= W - padR + 2) { s += `<text x="${xx}" y="${H - 7}" text-anchor="middle">${lab}</text>`; lastX = xx; } };
    if (spanDays > 400) {
      for (let yv = Number(rows[0].date.slice(0, 4)) + 1; yv <= Number(rows[rows.length - 1].date.slice(0, 4)); yv++) put(x({ date: `${yv}-01-01` }), String(yv + 543));
    } else rows.forEach((r, i) => {
      if (spanDays <= 10) put(x(r), `${DOW[(toD(r.date).getUTCDay() + 6) % 7]} ${toD(r.date).getUTCDate()}`);
      else if (spanDays <= 45) { if (i % Math.ceil(rows.length / 6) === 0) put(x(r), dShort(r.date)); }
      else { const m = r.date.slice(0, 7); if (m !== last) { put(x(r), dMonth(r.date)); last = m; } }
    });
    if (o.bars) {
      const bw = Math.max(1.5, iw / Math.max(rows.length, spanDays + 1) - 1.5);
      rows.forEach((r, i) => { const v = vals[i]; s += `<rect x="${x(r) - bw / 2}" y="${y(v)}" width="${bw}" height="${padT + ih - y(v)}" rx="${Math.min(3, bw / 3)}" fill="${o.color}" opacity="${o.dim && o.dim(v) ? 0.4 : 0.9}"/>`; });
    } else {
      const dense = rows.length > 40;
      rows.forEach((r, i) => { s += `<circle cx="${x(r)}" cy="${y(vals[i])}" r="${o.sparse || !dense ? 3.5 : 1.6}" fill="${o.color}" opacity="${o.sparse || !dense ? 0.95 : 0.3}"/>`; });
      const win = o.sparse ? 1 : healthRange === "all" ? 30 : healthRange === "365" ? 7 : 1;
      const line = rolling(vals, win);
      // break the line across gaps of more than 14 days (watch not worn) instead of drawing straight across
      let seg = [];
      const flush = () => { if (seg.length > 1) s += `<polyline points="${seg.join(" ")}" fill="none" stroke="${o.color}" stroke-width="2.2" stroke-linejoin="round"/>`; seg = []; };
      rows.forEach((r, i) => {
        if (i && !o.sparse && toD(r.date) - toD(rows[i - 1].date) > 14 * 86400000) flush();
        seg.push(`${x(r).toFixed(1)},${y(line[i]).toFixed(1)}`);
      });
      flush();
    }
    for (const l of o.lines || []) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(l.v)}" y2="${y(l.v)}" stroke="${l.color}" stroke-dasharray="5 4" stroke-width="1.5"/><text class="halo" x="${padL + 4}" y="${y(l.v) - 5}" style="fill:${l.color}">${esc(l.label)}</text>`;
    return s + "</svg>";
  };
}

function bandStatus(v, lo, hi, fmt, goodLabel = "อยู่ในกรอบ") {
  if (v == null) return "";
  const where = v < lo ? ["low", "ต่ำกว่ากรอบ"] : v > hi ? ["high", "สูงกว่ากรอบ"] : ["ok", goodLabel];
  return `<span class="bstat b-${where[0]}">${fmt(v)} · ${where[1]}</span>`;
}

function healthCharts(d) {
  const today = d.today;
  const base = (key, n) => avgOf(d.daily.filter((r) => r.date > addDays(today, -n)).map((r) => r[key]));
  const rhr30 = base("resting_hr", 30), hrv30 = base("hrv", 30);
  const hrv60 = d.daily.filter((r) => r.date > addDays(today, -60)).map((r) => r.hrv).filter((v) => v != null);
  const hrvLo = Math.round(avgOf(hrv60) - sd(hrv60)), hrvHi = Math.round(avgOf(hrv60) + sd(hrv60));
  const R = { rhr: inRange(d.daily, "resting_hr", today), hrv: inRange(d.daily, "hrv", today), sleep: inRange(d.daily, "sleep_min", today), vo2: inRange(d.daily, "vo2max", today) };
  const avgR = (rows, key) => avgOf(rows.map((r) => r[key]));
  const lastVo2 = [...d.daily].reverse().find((r) => r.vo2max)?.vo2max;
  const vo2Level = (v) => (v == null ? "–" : v < 35 ? "ต่ำ" : v < 40 ? "ปานกลาง" : v < 45 ? "ดี" : "ดีมาก");
  const label = HRANGES.find(([k]) => k === healthRange)[1];
  return `<div class="span-12 hrange"><span class="small muted">ช่วงเวลาของกราฟ</span>
      <div class="seg">${HRANGES.map(([k, l]) => `<button type="button" class="${k === healthRange ? "on" : ""}" data-hrange="${k}">${l}</button>`).join("")}</div></div>
    <section class="card span-6"><div class="card-head"><h2>HR พัก (bpm)</h2>${bandStatus(avgR(R.rhr, "resting_hr"), 50, 57, (v) => `เฉลี่ย ${label} ${Math.round(v)}`)}</div>
      ${slot(healthChart(R.rhr, "resting_hr", { color: "var(--coral)", bands: [{ lo: 50, hi: 57, color: "var(--volt)", label: "เป้าหมาย 50–57" }],
        lines: rhr30 ? [{ v: Math.round(rhr30 + 4), color: "var(--coral)", label: `เตือน ≥ ${Math.round(rhr30 + 4)} (ปกติ+4)` }] : [] }))}
      <p class="small muted"><b>ควรอยู่ในกรอบสีเขียว 50–57</b> (ดีสำหรับผู้ชายวัย 40+ ที่ออกกำลังสม่ำเสมอ ยิ่งฟิตยิ่งลดลง) · ถ้าวันไหนแตะเส้นประแดง แปลว่ายังไม่ฟื้น ป่วย หรือนอนไม่พอ ให้ซ้อมเบาลง</p></section>
    <section class="card span-6"><div class="card-head"><h2>HRV (ms)</h2>${bandStatus(avgR(R.hrv, "hrv"), hrvLo, hrvHi, (v) => `เฉลี่ย ${label} ${Math.round(v)}`, "ปกติ")}</div>
      ${slot(healthChart(R.hrv, "hrv", { color: "var(--sky)", bands: [{ lo: hrvLo, hi: hrvHi, color: "var(--sky)", label: `ช่วงปกติของคุณ ${hrvLo}–${hrvHi}` }],
        lines: hrv30 ? [{ v: Math.round(hrv30 * 0.85), color: "var(--coral)", label: `ต่ำกว่า ${Math.round(hrv30 * 0.85)} = ล้า` }] : [] }))}
      <p class="small muted"><b>ควรอยู่ในกรอบสีฟ้า</b> (ค่าเฉลี่ย ± 1 SD ของ 60 วันล่าสุดของคุณเอง — HRV เทียบกับคนอื่นไม่ได้) · ค่ารายวันแกว่งเป็นปกติ ให้ดูเส้นแนวโน้ม ถ้าต่ำกว่าเส้นประแดงหลายวันติด แปลว่าสะสมความล้า</p></section>
    <section class="card span-6"><div class="card-head"><h2>การนอน (ชม.)</h2><a class="link small" href="#/sleep">ดูรายคืน →</a>${bandStatus(avgR(R.sleep, "sleep_min") == null ? null : avgR(R.sleep, "sleep_min") / 60, 7, 9, (v) => `เฉลี่ย ${label} ${hm(v * 60)}`)}</div>
      ${slot(healthChart(R.sleep, "sleep_min", { color: "var(--z3)", bars: true, map: (m) => m / 60, fmt: (v) => v.toFixed(0), yMax: 9.5, dim: (v) => v < 7,
        bands: [{ lo: 7, hi: 9, color: "var(--volt)", label: "แนะนำ 7–9 ชม." }] }))}
      <p class="small muted"><b>ควรอยู่ในกรอบ 7–9 ชม.</b> (คำแนะนำสำหรับผู้ใหญ่ และนักวิ่งที่ซ้อมสม่ำเสมอควรอยู่ฝั่งบนของกรอบ) · แท่งจาง = คืนที่ไม่ถึง 7 ชม. · <a class="link" href="#/sleep">ดูวิเคราะห์การนอน →</a></p></section>
    <section class="card span-6"><div class="card-head"><h2>VO₂max (ml/kg/min)</h2><span class="bstat b-${lastVo2 >= 40 ? "ok" : "low"}">ล่าสุด ${lastVo2 ? lastVo2.toFixed(1) : "–"} · ${vo2Level(lastVo2)}</span></div>
      ${slot(healthChart(R.vo2, "vo2max", { color: "var(--volt)", sparse: true, fmt: (v) => v.toFixed(0), yMin: 33, yMax: 47, fixed: true,
        bands: [{ lo: 45, hi: 60, color: "var(--sky)", label: "ดีมาก 45+" }, { lo: 40, hi: 45, color: "var(--volt)", label: "ดี 40–45" }, { lo: 35, hi: 40, color: "var(--amber)", label: "ปานกลาง 35–40" }, { lo: 0, hi: 35, color: "var(--coral)", label: "ต่ำ <35" }] }))}
      <p class="small muted"><b>เป้าหมาย: ขึ้นไปอยู่กรอบ “ดี” 40+</b> (เกณฑ์โดยประมาณสำหรับผู้ชาย 40–49 ปี) · Apple Watch ประมาณจากการวิ่ง/เดินกลางแจ้ง ค่าจะขยับช้าๆ ตามความฟิต การวิ่ง Z2 สม่ำเสมอคือวิธีที่ดีที่สุดที่จะดันค่านี้ขึ้น</p></section>`;
}

function renderHealth(d) {
  const r = d.readiness, last = d.daily[d.daily.length - 1];
  const vo2 = [...d.daily].reverse().find((x) => x.vo2max);
  const vo2first = d.daily.find((x) => x.vo2max);
  const recent = (key, n) => avgOf(d.daily.slice(-n).map((x) => x[key]));
  const prev = (key, n) => avgOf(d.daily.slice(-n * 2, -n).map((x) => x[key]));
  const sleep60 = d.daily.slice(-60);
  const stat = (label, value, unit, foot, cls = "") => `<div class="stat ${cls}"><div class="label">${label}</div><div class="value">${value}${unit ? `<small>${unit}</small>` : ""}</div>${foot ? `<div class="foot">${foot}</div>` : ""}</div>`;
  const trend = (now, before, lowerIsBetter) => {
    if (now == null || before == null) return "";
    const diff = now - before, good = lowerIsBetter ? diff < 0 : diff > 0;
    return `<span style="color:${Math.abs(diff) < 0.5 ? "var(--ink-3)" : good ? "var(--volt)" : "var(--coral)"}">${diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} ${Math.abs(diff).toFixed(1)}</span> จาก 30 วันก่อน`;
  };
  app.innerHTML = `<div class="view">
    ${subnav("health", "#/health")}
    <div class="page-head"><div><h1>การฟื้นตัว</h1>
      <p>ข้อมูลจาก Apple Health · ล่าสุด ${last ? dMed(last.date) : "–"} · <a class="link" href="#/sync">สถานะการส่งข้อมูล →</a></p></div></div>
    <div class="grid">
      <section class="card span-12">${readinessStrip(r)}${dayNoteBlock(d.day_note, d.today, d.profile?.coach_name)}
        <div class="stat-row run-stats" style="margin-top:14px">
          ${stat("HR พัก (เฉลี่ย 30 วัน)", r0(recent("resting_hr", 30)), "bpm", trend(recent("resting_hr", 30), prev("resting_hr", 30), true), "hr")}
          ${stat("HRV (เฉลี่ย 30 วัน)", r0(recent("hrv", 30)), "ms", trend(recent("hrv", 30), prev("hrv", 30), false))}
          ${stat("นอนเฉลี่ย 30 คืน", hrsMin(recent("sleep_min", 30)), "ชม.", "เป้า 7:00+")}
          ${stat("VO₂max", vo2 ? vo2.vo2max.toFixed(1) : "–", "", vo2 && vo2first ? `${dShort(vo2first.date)}: ${vo2first.vo2max.toFixed(1)}` : "")}
        </div>
      </section>
      ${healthCharts(d)}
    </div>
  </div>`;
}

const INGEST_URL = `${location.origin}/api/ingest/daily`;
const SC_FIELDS = [
  ["rhr", "A", "Value", ""],
  ["rhr_date", "A", "Start Date", "iso"],
  ["hrv", "B", "Value", ""],
  ["sleep_value", "C", "Value", ""],
  ["sleep_start", "C", "Start Date", "iso"],
  ["sleep_end", "C", "End Date", "iso"],
  ["sleep_source", "C", "Source", ""],
  ["vo2", "D", "Value", ""],
  ["vo2_date", "D", "Start Date", "iso"],
  ["hr_value", "E", "Value", ""],
  ["hr_start", "E", "Start Date", "iso"],
];

function copyBtn(text, label = "คัดลอก") {
  return `<button type="button" class="btn-ghost copy" data-copy="${esc(text)}">${label}</button>`;
}

function renderSync(st) {
  const finds = [
    ["A", "Resting Heart Rate", "อัตราการเต้นของหัวใจขณะพัก", "Filter: Start Date · is in the last · 7 days · Sort by: Start Date · Latest First · Limit: 1"],
    ["B", "Heart Rate Variability", "ความแปรปรวนของอัตราการเต้นของหัวใจ", "เพิ่ม Filter: Start Date · is in the last · 1 days"],
    ["C", "Sleep", "การนอน (ไม่ใช่ Sleep Analysis)", "Filter: Start Date · is in the last · 1 days · Sort by: Start Date · Oldest First"],
    ["D", "Cardio Fitness", "สมรรถภาพหัวใจ (VO₂max)", "Filter: Start Date · is in the last · 7 days · Sort by: Start Date · Latest First · Limit: 1"],
    ["E", "Heart Rate", "อัตราการเต้นของหัวใจ (ใช้วาดกราฟหัวใจระหว่างนอน)", "Filter: Start Date · is in the last · 14 hours · Sort by: Start Date · Oldest First"],
  ];
  const recent = st.recent || [];
  app.innerHTML = `<div class="view">
    <a class="back" href="#/settings">${ICON.left} ตั้งค่า</a>
    <div class="page-head"><div><h1>ส่งข้อมูล Health อัตโนมัติ</h1>
      <p>คำสั่งลัด (Shortcut) บน iPhone 2 ตัว: ตัวแรกส่ง HR พัก, HRV, การนอน, VO₂max ทุกเช้า · ตัวที่สองส่งการวิ่งเข้าระบบเองทันทีที่จบ workout ไม่ต้องแคปภาพ</p></div></div>
    <section class="card sync-status">
      <div class="card-head"><h2>${ICON.heart} สถานะ</h2></div>
      ${!st.configured ? `<p class="muted">ยังไม่ได้ตั้งรหัสลับฝั่งเว็บ</p>` : recent.length
        ? `<ul class="changes">${recent.map((r) => `<li><div class="cd">${new Date(r.received_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div><div class="ct" style="color:${r.ok ? "var(--volt)" : "var(--amber)"}">${r.kind === "run" ? "🏃 " : "🌙 "}${esc(r.summary)}</div></li>`).join("")}</ul>`
        : `<p class="muted">ยังไม่เคยได้รับข้อมูล — ทำตามขั้นตอนด้านล่าง แล้วกดทดสอบ</p>`}
    </section>

    <section class="card quick-install">
      <h2>วิธีเร็วที่สุด: ติดตั้งคำสั่งลัดสำเร็จรูป</h2>
      <p>เปิดหน้านี้บน iPhone แล้วแตะปุ่มด้านล่าง → <b>Add Shortcut</b> → ระบบจะถามรหัสลับ ให้วางรหัสจากไฟล์ <code>.secrets/ingest-token.txt</code> จากนั้นเปิดแก้ไข แล้วแตะเลือกชนิดข้อมูลใหม่หนึ่งครั้งใน action ตัวที่ 4 (<b>Cardio Fitness</b>) และตัวที่ 5 (<b>Heart Rate</b>) — ถ้าไม่ทำ สองค่านี้จะส่งมาว่าง แล้วทำขั้นที่ 6–7 (ทดสอบ + ตั้ง Automation)</p>
      <p class="small muted" style="margin-top:6px">ถ้าขึ้น “trying to share … Health items, which is not allowed” ให้เปิด การตั้งค่า → แอป → คำสั่งลัด → ขั้นสูง → อนุญาตให้แชร์ข้อมูลจำนวนมาก</p>
      <a class="btn-strava" style="background:var(--volt);color:var(--volt-ink);display:inline-block;margin-top:12px" href="/shortcut/running-journal.shortcut" download>⬇︎ ติดตั้ง “running-journal”</a>
      <p class="small muted" style="margin-top:10px">ถ้าเคยเพิ่มบน Mac แล้ว คำสั่งลัดจะ sync มาที่ iPhone เองผ่าน iCloud ไม่ต้องติดตั้งซ้ำ · ถ้าหลังติดตั้งช่องไหนว่าง ให้ทำตามขั้นตอนด้านล่างแทน</p>
    </section>
    <section class="card quick-install run-install">
      <h2>🏃 คำสั่งลัดที่ 2: ส่งการวิ่งอัตโนมัติ</h2>
      <p>ดึงระยะทาง หัวใจ แคลอรี่ และจำนวนก้าวจาก Apple Health ช่วง 3 ชม.ล่าสุด แล้วเว็บจะหาช่วงที่วิ่ง คำนวณ split รายกิโล กราฟเพซ/หัวใจ/รอบขา และเวลาในแต่ละโซนให้เอง พร้อมผูกกับแผนซ้อมของวันนั้น</p>
      <ol class="mini-steps">
        <li>แตะปุ่มด้านล่างบน iPhone → <b>Add Shortcut</b> → วางรหัสลับตัวเดียวกับคำสั่งลัดแรก</li>
        <li>เปิดแก้ไขคำสั่งลัด แตะเลือกชนิดข้อมูลใหม่หนึ่งครั้งใน 4 action: <b>Walking + Running Distance</b>, <b>Heart Rate</b>, <b>Active Energy</b>, <b>Steps</b> (ไม่งั้นอาจส่งมาว่าง — Steps ใช้คำนวณรอบขา)</li>
        <li>วิ่งเสร็จแล้วกด ▶ ทดสอบ → จะเห็นแจ้งเตือน “บันทึกวิ่งแล้ว · … กม.”</li>
        <li>ตั้งให้รันเอง: <b>Automation</b> → <b>+</b> → <b>Apple Watch Workout</b> → เลือก <b>Running</b> · <b>Ends</b> (จบ) → <b>Run Immediately</b> → เลือก “running-journal-run”</li>
        <li>เล่นเวทด้วย: สร้าง Automation อีกอัน เลือก <b>Functional Strength Training</b> และ <b>Traditional Strength Training</b> · <b>Ends</b> → คำสั่งลัดตัวเดิม — เวลา หัวใจ แคลอรี่จะเข้าหน้า <a class="link" href="#/strength">เวท</a> แล้วค่อยกรอกท่ากับน้ำหนัก</li>
      </ol>
      <a class="btn-strava" style="background:var(--volt);color:var(--volt-ink);display:inline-block;margin-top:12px" href="/shortcut/running-journal-run.shortcut" download>⬇︎ ติดตั้ง “running-journal-run”</a>
      <p class="small muted" style="margin-top:10px">ต้องบันทึกการวิ่งด้วย Apple Watch · ระยะและเวลาอาจต่างจาก Strava ~1–3% (นาฬิกาเริ่มเก็บข้อมูลก่อนกดเริ่ม 1–2 นาที) — export Health รายเดือนจะแทนที่ด้วยค่าจริงให้เอง · ส่งซ้ำได้ ไม่เกิดรายการซ้ำ · ถ้าขึ้น “ไม่เจอการวิ่ง” ให้รอสักครู่แล้วกด ▶ ใหม่ · วิ่งแล้วอย่าลืมบอก RPE ให้โค้ชวิเคราะห์</p>
    </section>
    <h2 class="section-title">หรือสร้างคำสั่งลัดแรกเองทีละขั้น</h2>
    <ol class="guide">
      <li><h3>เตรียมรหัสลับ</h3>
        <p>รหัสอยู่ในไฟล์ <code>.secrets/ingest-token.txt</code> ในโฟลเดอร์โปรเจกต์บน Mac เปิดแล้วคัดลอก จากนั้นวางบน iPhone ได้เลย (ถ้าใช้ Apple ID เดียวกัน Universal Clipboard จะส่งข้ามเครื่องให้) อย่าแชร์รหัสนี้ให้ใคร</p></li>

      <li><h3>สร้างคำสั่งลัดใหม่</h3>
        <p>เปิดแอป <b>คำสั่งลัด (Shortcuts)</b> → แตะ <b>+</b> → ตั้งชื่อ <b>ส่งข้อมูลวิ่ง</b></p></li>

      <li><h3>เพิ่ม “Find Health Samples” 5 ครั้ง</h3>
        <p class="muted small">ค้นใน action ด้วยคำว่า <b>Health</b> หรือ <b>สุขภาพ</b> (ภาษาไทยชื่อประมาณ “ค้นหาตัวอย่างสุขภาพ”) · เรียกแต่ละอันว่า A B C D E ตามลำดับ</p>
        <div class="finds">${finds.map(([k, en, th, opt]) => `<div class="find"><span class="fk">${k}</span><div><b>Type: ${en}</b><div class="small muted">${th}</div><div class="small">${opt}</div></div></div>`).join("")}</div></li>

      <li><h3>เพิ่ม “Get Contents of URL” (รับเนื้อหาของ URL)</h3>
        <div class="kv"><span>URL</span><code>${esc(INGEST_URL)}</code>${copyBtn(INGEST_URL)}</div>
        <div class="kv"><span>Method</span><code>POST</code></div>
        <div class="kv"><span>Headers</span><code>Authorization</code>${copyBtn("Authorization", "คัดลอกชื่อ")}</div>
        <div class="kv"><span>ค่า header</span><code>Bearer &lt;วางรหัสลับ&gt;</code><span class="small muted">มีเว้นวรรค 1 ช่องหลัง Bearer</span></div>
        <div class="kv"><span>Request Body</span><code>JSON</code></div>
        <p class="small" style="margin-top:10px">แตะ <b>Add new field → Text</b> ทีละช่องตามตาราง: พิมพ์ชื่อ key แล้วตรงค่า แตะ <b>Select Variable</b> เลือกผลลัพธ์ของ action (A–E) จากนั้น<b>แตะที่ตัวแปรอีกครั้ง</b>เพื่อเลือก property</p>
        <div class="fields">${SC_FIELDS.map(([key, src, prop, fmt]) => `<div class="field"><code>${key}</code>${copyBtn(key)}<span>→ <b>${src}</b> · ${prop}${fmt ? ` <span class="small muted">(Date Format: ISO 8601 + เปิด Include Time)</span>` : ""}</span></div>`).join("")}</div></li>

      <li><h3>เพิ่ม “Get Dictionary Value” แล้ว “Show Notification”</h3>
        <p>Get Value for key <code>message</code> in <b>Contents of URL</b> → แล้ว Show Notification แสดง <b>Dictionary Value</b> จะได้รู้ว่าส่งสำเร็จ</p></li>

      <li><h3>ทดสอบ</h3>
        <p>แตะ ▶ ครั้งแรก iPhone จะถามสิทธิ์อ่านข้อมูล Health → <b>อนุญาตทั้งหมด</b> ถ้าสำเร็จจะเห็นแจ้งเตือน “อัปเดตแล้ว · HR พัก …” และสถานะด้านบนจะขึ้นรายการใหม่ จากนั้นบอก Claude ให้ตรวจข้อมูลครั้งแรก</p></li>

      <li><h3>ให้รันเองทุกเช้า</h3>
        <p>แท็บ <b>Automation (ระบบอัตโนมัติ)</b> → <b>+</b> → <b>Alarm (นาฬิกาปลุก)</b> → <b>Is Stopped (ถูกหยุด)</b> → เลือกนาฬิกาปลุกตอนเช้า → <b>Run Immediately (เรียกใช้ทันที)</b> → เลือก “ส่งข้อมูลวิ่ง”</p>
        <p class="small muted">iOS อ่านข้อมูล Health ไม่ได้ตอนเครื่องล็อก จึงใช้จังหวะปิดนาฬิกาปลุก (ตอนนั้นมือถือปลดล็อกอยู่) ถ้าไม่ได้ตั้งปลุก ใช้ “When I open app” กับแอปที่เปิดทุกเช้า เช่น LINE แทนได้</p></li>
    </ol>
  </div>`;
  app.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const label = b.textContent;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "คัดลอกแล้ว ✓"; } catch { b.textContent = "คัดลอกไม่ได้"; }
    setTimeout(() => (b.textContent = label), 1500);
  }));
}

// ---------- sleep ----------
const SLEEP_TARGET = 420; // 7 h
let sleepRange = 90;
const hm = (m) => (m == null ? "–" : `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`);
const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
/** Clock minutes on a night axis that starts at 18:00, so 23:30 < 00:30 < 07:00. */
const nightMin = (t) => (t == null ? null : (toMin(t) - 18 * 60 + 1440) % 1440);
const fromNight = (m) => { const x = (Math.round(m) + 18 * 60) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const sd = (xs) => { const v = xs.filter((x) => x != null); if (v.length < 2) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
const hasStages = (n) => (n.deep_min || 0) + (n.rem_min || 0) + (n.core_min || 0) > 0;

function nightNotes(n, ctx) {
  const out = [];
  const gap = SLEEP_TARGET - n.sleep_min;
  if (gap <= 0) out.push(["good", `ถึงเป้า 7 ชม. (เกิน ${hm(-gap)}) เยี่ยมค่ะ`]);
  else if (n.sleep_min >= 360) out.push(["fair", `อีกแค่ ${Math.round(gap)} นาทีก็ถึง 7 ชม. แล้วค่ะ`]);
  else out.push(["bad", `นอนไม่ถึง 6 ชม. ร่างกายซ่อมได้ไม่เต็มที่นะคะ`]);
  if (hasStages(n)) {
    const deep = n.deep_min / n.sleep_min, rem = n.rem_min / n.sleep_min;
    if (deep < 0.1) out.push(["fair", `หลับลึกน้อย ${Math.round(deep * 100)}% (ปกติ 10–20%)`]);
    else if (deep >= 0.15) out.push(["good", `หลับลึกดีมาก ${Math.round(deep * 100)}%`]);
    if (rem < 0.18) out.push(["fair", `REM น้อย ${Math.round(rem * 100)}% (ปกติ 20–25%)`]);
    else if (rem >= 0.21) out.push(["good", `REM ดีมาก ${Math.round(rem * 100)}%`]);
  }
  if (n.awake_min > 30) out.push(["fair", `ตื่นกลางดึกรวม ${n.awake_min} นาที`]);
  const b = nightMin(n.bed_time);
  if (b != null && ctx.bedMedian != null && b - ctx.bedMedian > 45) out.push(["fair", `เข้านอนช้ากว่าปกติ ${Math.round(b - ctx.bedMedian)} นาที`]);
  else if (b != null && ctx.bedMedian != null && ctx.bedMedian - b > 45) out.push(["good", `เข้านอนเร็วกว่าปกติ ${Math.round(ctx.bedMedian - b)} นาที เก่งค่ะ`]);
  return out;
}

// ---------- sleep score (0–100) ----------
// Duration 50 · stages 20 · continuity 15 · bedtime 15 (same thresholds as nightNotes()).
// A part with no data is left out and the rest is scaled to 100. Sleeping HR / HRV are recovery
// signals shown elsewhere, so they are not part of the score.
const lerp = (x, x0, y0, x1, y1) => (x <= x0 ? y0 : x >= x1 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
const SCORE_BANDS = [[85, "ดีมาก", "good"], [70, "ดี", "ok"], [55, "พอใช้", "fair"], [0, "ต้องปรับ", "bad"]];
const BAND_COLOR = { good: "var(--volt)", ok: "var(--sky)", fair: "var(--amber)", bad: "var(--coral)" };
const scoreBand = (s) => SCORE_BANDS.find((b) => s >= b[0]);

/** Median bedtime (night-axis minutes) of the 30 nights before `date`; null with fewer than 7. */
function bedMedianBefore(all, date) {
  const from = addDays(date, -30);
  const xs = all.filter((n) => n.date < date && n.date >= from).map((n) => nightMin(n.bed_time)).filter((x) => x != null);
  return xs.length >= 7 ? median(xs) : null;
}

function sleepScore(n, ctx = {}) {
  const s = n.sleep_min, parts = [];
  // 1. duration — 7–9 h full; every 10 min short of 7 h costs 6 (6 h = 14), then down to 0 at 5 h
  const dur = s > 540 ? Math.max(35, 50 - (s - 540) * 0.1) : s >= SLEEP_TARGET ? 50 : s >= 360 ? lerp(s, 360, 14, 420, 50) : lerp(s, 300, 0, 360, 14);
  parts.push({ key: "dur", label: "ชั่วโมงนอน", points: dur, max: 50,
    note: s > 540 ? `${hm(s)} ชม. เกิน 9 ชม. หักเล็กน้อย` : s >= SLEEP_TARGET ? `${hm(s)} ชม. ถึงเป้า 7 ชม.` : `${hm(s)} ชม. ขาดเป้า 7 ชม. ${SLEEP_TARGET - s} นาที` });
  // 2. stages — deep 15%+ / REM 21%+ full; deep 10% / REM 18% (the "low" line) = 6 of 10
  if (hasStages(n)) {
    const dp = n.deep_min / s, rp = n.rem_min / s;
    const deep = dp < 0.1 ? lerp(dp, 0.05, 0, 0.1, 6) : lerp(dp, 0.1, 6, 0.15, 10);
    const rem = rp < 0.18 ? lerp(rp, 0.1, 0, 0.18, 6) : lerp(rp, 0.18, 6, 0.21, 10);
    parts.push({ key: "stage", label: "หลับลึก + REM", points: deep + rem, max: 20,
      note: `หลับลึก ${Math.round(dp * 100)}% (${Math.round(deep)}/10) · REM ${Math.round(rp * 100)}% (${Math.round(rem)}/10)` });
  } else parts.push({ key: "stage", label: "หลับลึก + REM", points: null, max: 20, note: "ไม่มีข้อมูลระยะการนอน — ไม่นับส่วนนี้" });
  // 3. continuity — awake ≤ 10 min full, 30 min = 10, 90 min+ = 0
  if (n.awake_min != null) {
    const a = n.awake_min;
    parts.push({ key: "cont", label: "หลับต่อเนื่อง", points: a <= 30 ? lerp(a, 10, 15, 30, 10) : lerp(a, 30, 10, 90, 0), max: 15,
      note: a <= 10 ? `ตื่นกลางดึกรวม ${a} นาที` : `ตื่นกลางดึกรวม ${a} นาที (เกิน 10 นาทีเริ่มหัก)` });
  } else parts.push({ key: "cont", label: "หลับต่อเนื่อง", points: null, max: 15, note: "ไม่มีข้อมูลเวลาตื่นกลางดึก — ไม่นับส่วนนี้" });
  // 4. bedtime vs the 30-night median — up to 15 min late full, 45 min = 9, 90 min+ = 0; earlier is never penalised
  const b = nightMin(n.bed_time), med = ctx.bedMedian;
  if (b != null && med != null) {
    const late = b - med;
    parts.push({ key: "bed", label: "เวลาเข้านอน", points: lerp(late, 15, 15, 90, 0), max: 15,
      note: late > 15 ? `${n.bed_time} ช้ากว่าปกติ (${fromNight(med)}) ${Math.round(late)} นาที`
        : late < -15 ? `${n.bed_time} เร็วกว่าปกติ (${fromNight(med)}) ${Math.round(-late)} นาที ไม่หัก` : `${n.bed_time} ตรงกับปกติ (${fromNight(med)})` });
  } else parts.push({ key: "bed", label: "เวลาเข้านอน", points: null, max: 15, note: "ข้อมูลเวลาเข้านอนย้อนหลังยังไม่พอ — ไม่นับส่วนนี้" });
  for (const p of parts) if (p.points != null) p.points = Math.round(p.points);
  const used = parts.filter((p) => p.points != null);
  const sum = used.reduce((a, p) => a + p.points, 0), max = used.reduce((a, p) => a + p.max, 0);
  return { score: Math.round((sum / max) * 100), sum, max, parts };
}

/** Score for every night, keyed by wake-up date. */
function sleepScores(all) {
  const m = new Map();
  for (const n of all) m.set(n.date, sleepScore(n, { bedMedian: bedMedianBefore(all, n.date) }));
  return m;
}

function scoreRing(score, size = 44, stroke = 5) {
  const b = scoreBand(score), r = (size - stroke) / 2, c = 2 * Math.PI * r, h = size / 2;
  return `<svg class="sring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="คะแนนการนอน ${score} (${b[1]})">
    <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${BAND_COLOR[b[2]]}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${((c * score) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${h} ${h})"/>
    <text x="${h}" y="${h}" text-anchor="middle" dominant-baseline="central" style="font-size:${Math.round(size * 0.36)}px">${score}</text></svg>`;
}
const bandChip = (score) => { const b = scoreBand(score); return `<span class="bchip b-${b[2]}">${b[1]}</span>`; };

function scoreChart(nights, scores) {
  return (W) => {
    const H = 200, padL = 30, padR = 8, padT = 10, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const y = (v) => padT + ih - (v / 100) * ih;
    const bw = iw / nights.length, g = bw > 6 ? Math.min(3, bw * 0.25) : 0.5;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (const v of [0, 55, 70, 85, 100]) s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    let lastM = "";
    nights.forEach((n, i) => {
      const sc = scores.get(n.date)?.score;
      if (sc == null) return;
      const x = padL + i * bw + g / 2, w = Math.max(1, bw - g);
      s += `<rect x="${x}" y="${y(sc)}" width="${w}" height="${y(0) - y(sc)}" fill="${BAND_COLOR[scoreBand(sc)[2]]}" opacity=".55"/>`;
      const m = n.date.slice(0, 7);
      if (m !== lastM && (nights.length <= 45 ? n.date.slice(8) === "01" || i === 0 : n.date.slice(8) <= "07")) { s += `<text x="${x}" y="${H - 6}">${dMonth(n.date)}</text>`; lastM = m; }
    });
    const roll = rolling(nights.map((n) => scores.get(n.date)?.score ?? null), 7);
    s += `<polyline points="${roll.map((v, i) => (v == null ? "" : `${(padL + i * bw + bw / 2).toFixed(1)},${y(v).toFixed(1)}`)).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" opacity=".85"/>`;
    return s + "</svg>";
  };
}

const SCORE_HOW = `<details class="sc-how"><summary>คะแนนคิดยังไง</summary>
  <p>คะแนนเต็ม 100 คิดจากข้อมูล Apple Watch ของคืนนั้น 4 ส่วน (เกณฑ์เดียวกับป้ายในวิเคราะห์รายคืน)</p>
  <ol>
    <li><b>ชั่วโมงนอน — 50 คะแนน</b> นอน 7–9 ชม. ได้เต็ม · ขาด 7 ชม. ทุก 10 นาที หัก 6 คะแนน (นอน 6 ชม. เหลือ 14) · ต่ำกว่า 6 ชม. ลดต่อจนเหลือ 0 ที่ 5 ชม. · เกิน 9 ชม. หักเล็กน้อย ส่วนนี้หนักสุดเพราะเวลานอนรวมมีผลกับการฟื้นตัวมากที่สุด</li>
    <li><b>หลับลึก + REM — 20 คะแนน</b> (คิดเป็น % ของเวลาหลับ) หลับลึก 15%+ ได้ 10 · 10% ได้ 6 · 5% ลงไป 0 / REM 21%+ ได้ 10 · 18% ได้ 6 · 10% ลงไป 0</li>
    <li><b>หลับต่อเนื่อง — 15 คะแนน</b> ตื่นกลางดึกรวมไม่เกิน 10 นาที ได้เต็ม · 30 นาที เหลือ 10 · 90 นาทีขึ้นไป 0</li>
    <li><b>เวลาเข้านอน — 15 คะแนน</b> เทียบกับเวลาเข้านอนกลาง (median) ของ 30 คืนก่อนหน้า: ช้ากว่าไม่เกิน 15 นาที ได้เต็ม · ช้า 45 นาที เหลือ 9 · ช้า 90 นาทีขึ้นไป 0 · เข้านอน<b>เร็วกว่า</b>ปกติไม่หัก เพราะเป้าคือเข้านอนให้เร็วขึ้น</li>
  </ol>
  <p>คืนที่ไม่มีข้อมูลบางส่วน (เช่น คืนเก่าที่ไม่มีระยะการนอน) จะตัดส่วนนั้นออก แล้วปรับส่วนที่เหลือให้เต็ม 100 · ระดับ: <b>85+ ดีมาก</b> · 70–84 ดี · 55–69 พอใช้ · ต่ำกว่า 55 ต้องปรับ</p>
  <p class="muted">ชีพจรระหว่างนอนและ HRV ไม่นับในคะแนน เพราะเป็นค่าการฟื้นตัวของร่างกาย (ดูในหน้าร่างกาย) และคืนเก่าๆ ไม่มีข้อมูลนี้ คะแนนจะได้เทียบกันได้ทุกคืน</p>
</details>`;

function stageBar(n) {
  if (!hasStages(n)) return `<div class="zbar thin"><i style="width:100%;background:var(--ink-3)"></i></div>`;
  const total = n.sleep_min + (n.awake_min || 0);
  const other = Math.max(0, n.sleep_min - n.deep_min - n.rem_min - n.core_min);
  const seg = (v, c) => (v > 0 ? `<i style="width:${(v / total) * 100}%;background:${c}"></i>` : "");
  return `<div class="zbar">${seg(n.deep_min, "var(--deep)")}${seg(n.core_min + other, "var(--core)")}${seg(n.rem_min, "var(--rem)")}${seg(n.awake_min, "var(--awake)")}</div>`;
}

function sleepBarsChart(nights) {
  return (W) => {
    const H = 230, padL = 30, padR = 8, padT = 12, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const maxH = Math.max(9, ...nights.map((n) => n.sleep_min / 60)) + 0.5;
    const y = (h) => padT + ih - (h / maxH) * ih;
    const bw = iw / nights.length, g = bw > 6 ? Math.min(3, bw * 0.25) : 0.5;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (let h = 0; h <= maxH; h += 2) s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(h)}" y2="${y(h)}"/><text x="${padL - 6}" y="${y(h) + 4}" text-anchor="end">${h}</text>`;
    let lastM = "";
    nights.forEach((n, i) => {
      const x = padL + i * bw + g / 2, w = Math.max(1, bw - g);
      let top = padT + ih;
      const stack = hasStages(n)
        ? [[n.deep_min, "var(--deep)"], [n.core_min + Math.max(0, n.sleep_min - n.deep_min - n.rem_min - n.core_min), "var(--core)"], [n.rem_min, "var(--rem)"]]
        : [[n.sleep_min, "var(--ink-3)"]];
      for (const [v, c] of stack) { if (!v) continue; const h = (v / 60 / maxH) * ih; top -= h; s += `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${c}"/>`; }
      const m = n.date.slice(0, 7);
      if (m !== lastM && (nights.length <= 45 ? n.date.slice(8) === "01" || i === 0 : n.date.slice(8) <= "07")) { s += `<text x="${x}" y="${H - 6}">${dMonth(n.date)}</text>`; lastM = m; }
    });
    s += `<line x1="${padL}" x2="${W - padR}" y1="${y(7)}" y2="${y(7)}" stroke="var(--volt)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - padR}" y="${y(7) - 5}" text-anchor="end" style="fill:var(--volt)">เป้า 7 ชม.</text>`;
    const roll = rolling(nights.map((n) => n.sleep_min / 60), 7);
    s += `<polyline points="${roll.map((v, i) => `${(padL + i * bw + bw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" opacity=".85"/>`;
    return s + "</svg>";
  };
}

function scheduleChart(nights) {
  return (W) => {
    const H = 230, padL = 44, padR = 8, padT = 10, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const lo = 3 * 60, hi = 15 * 60; // 21:00 → 09:00 on the night axis
    const y = (m) => padT + ((Math.min(hi, Math.max(lo, m)) - lo) / (hi - lo)) * ih;
    const bw = iw / nights.length, w = Math.max(1.2, bw * 0.6);
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (let m = lo; m <= hi; m += 120) s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(m)}" y2="${y(m)}"/><text x="${padL - 6}" y="${y(m) + 4}" text-anchor="end">${fromNight(m)}</text>`;
    s += `<line x1="${padL}" x2="${W - padR}" y1="${y(5 * 60)}" y2="${y(5 * 60)}" stroke="var(--volt)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - padR}" y="${y(5 * 60) - 5}" text-anchor="end" style="fill:var(--volt)">เข้านอน 23:00</text>`;
    let lastM = "";
    nights.forEach((n, i) => {
      const b = nightMin(n.bed_time), e = nightMin(n.wake_time);
      if (b == null || e == null) return;
      const x = padL + i * bw + (bw - w) / 2;
      s += `<rect x="${x}" y="${y(b)}" width="${w}" height="${Math.max(2, y(e) - y(b))}" rx="${Math.min(3, w / 2)}" fill="var(--sky)" opacity=".75"/>`;
      const m = n.date.slice(0, 7);
      if (m !== lastM && (nights.length <= 45 ? n.date.slice(8) === "01" || i === 0 : n.date.slice(8) <= "07")) { s += `<text x="${x}" y="${H - 6}">${dMonth(n.date)}</text>`; lastM = m; }
    });
    return s + "</svg>";
  };
}

// ---------- WHOOP-style single night ----------
const STAGES = [
  { key: "awake", label: "ตื่น", color: "var(--awake)", codes: [0] },
  { key: "core", label: "Core (หลับตื้น)", color: "var(--core)", codes: [2, 4] },
  { key: "deep", label: "หลับลึก", color: "var(--deep)", codes: [3] },
  { key: "rem", label: "REM", color: "var(--rem)", codes: [1] },
];
const ROW = { 0: 0, 1: 1, 2: 2, 4: 2, 3: 3 }; // hypnogram row per stage code (top → bottom)
const CODE_COLOR = { 0: "var(--awake)", 1: "var(--rem)", 2: "var(--core)", 3: "var(--deep)", 4: "var(--ink-3)" };
const clockAt = (startMs, min) => new Date(startMs + min * 60000 + 7 * 3600000).toISOString().slice(11, 16);
const pct = (xs, p) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); if (!v.length) return null; const i = (v.length - 1) * p; return v[Math.floor(i)] + (v[Math.ceil(i)] - v[Math.floor(i)]) * (i - Math.floor(i)); };

function stageMinutes(night, detail) {
  if (detail?.segments?.length) {
    const m = { awake: 0, core: 0, deep: 0, rem: 0 };
    for (const [a, b, c] of detail.segments) for (const st of STAGES) if (st.codes.includes(c)) m[st.key] += b - a;
    return m;
  }
  return { awake: night.awake_min || 0, core: Math.max(0, night.sleep_min - (night.deep_min || 0) - (night.rem_min || 0)), deep: night.deep_min || 0, rem: night.rem_min || 0 };
}

/** Sleep cycles: each REM period (REM blocks less than 20 min apart) closes a cycle. */
function sleepCycles(segments) {
  const rem = segments.filter((x) => x[2] === 1).sort((a, b) => a[0] - b[0]);
  const periods = [];
  for (const [a, b] of rem) {
    const last = periods[periods.length - 1];
    if (last && a - last[1] < 20) last[1] = Math.max(last[1], b);
    else periods.push([a, b]);
  }
  return periods.filter(([a, b]) => b - a >= 3).map(([, b]) => b);
}

function typicalRanges(all, date) {
  const prior = all.filter((n) => n.date < date && n.date >= addDays(date, -30) && hasStages(n));
  if (prior.length < 7) return null;
  const tibOf = (n) => n.sleep_min + (n.awake_min || 0);
  const pick = (f) => { const xs = prior.map(f); return [pct(xs, 0.25), pct(xs, 0.75), avgOf(xs)]; };
  return {
    n: prior.length,
    awake: pick((n) => n.awake_min || 0),
    core: pick((n) => n.sleep_min - n.deep_min - n.rem_min),
    deep: pick((n) => n.deep_min),
    rem: pick((n) => n.rem_min),
    sleep: pick((n) => n.sleep_min),
    restore: pick((n) => n.deep_min + n.rem_min),
    eff: pick((n) => (n.sleep_min / tibOf(n)) * 100),
    bed: pick((n) => nightMin(n.bed_time)),
    wake: pick((n) => nightMin(n.wake_time)),
  };
}

function nightInsights(night, mins, ty, cycles) {
  const out = [];
  const tib = mins.awake + mins.core + mins.deep + mins.rem;
  if (ty) {
    const remPct = Math.round((mins.rem / tib) * 100), deepPct = Math.round((mins.deep / tib) * 100);
    if (mins.rem < ty.rem[0]) out.push(`REM ${remPct}% ของเวลาบนเตียง ต่ำกว่าปกติของพี่นะคะ — REM ส่วนใหญ่อยู่ท้ายคืน เข้านอนช้าหรือตื่นเร็วจะตัด REM ไปก่อนเลย`);
    else if (mins.rem > ty.rem[1]) out.push(`REM ${remPct}% สูงกว่าปกติของพี่ค่ะ — ร่างกายน่าจะกำลังชดเชย REM ที่ขาดไปคืนก่อนๆ`);
    if (mins.deep < ty.deep[0]) out.push(`หลับลึก ${deepPct}% น้อยกว่าปกตินะคะ — มักเกิดหลังวันที่ซ้อมหนัก ดื่มแอลกอฮอล์ กินมื้อดึก หรือห้องนอนร้อน ลองเช็คดูค่ะ`);
    else if (mins.deep > ty.deep[1]) out.push(`หลับลึก ${deepPct}% มากกว่าปกติ เยี่ยมค่ะ — ช่วงนี้แหละที่กล้ามเนื้อกับเอ็นได้ซ่อมเต็มที่`);
  }
  if (night.sleep_min >= SLEEP_TARGET) out.push(`นอนถึงเป้า 7 ชม. ครบ ${cycles} รอบการนอน แพรปลื้มค่ะ`);
  else out.push(`นอน ${hm(night.sleep_min)} ชม. อีก ${SLEEP_TARGET - night.sleep_min} นาทีก็ถึงเป้าค่ะ — ได้ ${cycles} รอบการนอน (ส่วนใหญ่ต้องการ 4–5 รอบ) คืนนี้เข้านอนเร็วขึ้นอีกนิดนะคะ`);
  if (mins.awake > 30) out.push(`ตื่นกลางดึกรวม ${Math.round(mins.awake)} นาที มากกว่าปกติ ห้องนอนเย็นและมืดพอไหมคะ?`);
  return out.slice(0, 3);
}

function hypnogram(detail, cycles) {
  return (W) => {
    const segs = detail.segments, span = Math.max(...segs.map((x) => x[1]));
    const H = 190, padL = 70, padR = 10, padT = 22, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB, rowH = ih / 4;
    const x = (m) => padL + (m / span) * iw;
    const yc = (code) => padT + ROW[code] * rowH + rowH / 2;
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    ["ตื่น", "REM", "Core", "ลึก"].forEach((l, i) => {
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${padT + i * rowH + rowH / 2}" y2="${padT + i * rowH + rowH / 2}"/>`;
      s += `<text x="${padL - 8}" y="${padT + i * rowH + rowH / 2 + 4}" text-anchor="end">${l}</text>`;
    });
    // clock ticks every hour
    const first = Math.ceil((detail.start_ms + 7 * 3600000) / 3600000) * 3600000 - 7 * 3600000;
    for (let t = first; t <= detail.start_ms + span * 60000; t += 3600000) {
      const m = (t - detail.start_ms) / 60000;
      s += `<line x1="${x(m)}" x2="${x(m)}" y1="${padT}" y2="${padT + ih}" stroke="var(--line-soft)"/><text x="${x(m)}" y="${H - 6}" text-anchor="middle">${clockAt(detail.start_ms, m)}</text>`;
    }
    // cycle boundaries
    let prev = 0;
    cycles.forEach((c, i) => {
      s += `<line x1="${x(c)}" x2="${x(c)}" y1="${padT - 4}" y2="${padT + ih}" stroke="var(--rem)" stroke-dasharray="3 4" opacity=".7"/>`;
      s += `<text x="${(x(prev) + x(c)) / 2}" y="${padT - 8}" text-anchor="middle" style="fill:var(--rem)">รอบ ${i + 1}</text>`;
      prev = c;
    });
    // transitions then blocks
    const sorted = [...segs].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (ROW[a[2]] !== ROW[b[2]] && b[0] - a[1] < 2) s += `<line x1="${x(b[0])}" x2="${x(b[0])}" y1="${yc(a[2])}" y2="${yc(b[2])}" stroke="var(--ink-3)" stroke-width="1" opacity=".55"/>`;
    }
    for (const [a, b, c] of sorted) {
      s += `<rect x="${x(a)}" y="${yc(c) - rowH * 0.34}" width="${Math.max(1, x(b) - x(a))}" height="${rowH * 0.68}" rx="2" fill="${CODE_COLOR[c]}"/>`;
    }
    return s + "</svg>";
  };
}

function sleepHrChart(detail) {
  return (W) => {
    const span = Math.max(...detail.segments.map((x) => x[1]));
    const pts = detail.hr.filter(([m]) => m >= -5 && m <= span + 5);
    const H = 110, padL = 70, padR = 10, padT = 10, padB = 8;
    const iw = W - padL - padR, ih = H - padT - padB;
    const vals = pts.map((p) => p[1]), lo = Math.min(...vals) - 3, hi = Math.max(...vals) + 3;
    const x = (m) => padL + (Math.min(span, Math.max(0, m)) / span) * iw;
    const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
    const minP = pts.reduce((b, p) => (p[1] < b[1] ? p : b), pts[0]);
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    s += `<text x="${padL - 8}" y="${padT + 10}" text-anchor="end">${Math.round(hi)}</text><text x="${padL - 8}" y="${padT + ih}" text-anchor="end">${Math.round(lo)}</text>`;
    const line = pts.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    s += `<polygon points="${x(pts[0][0])},${padT + ih} ${line} ${x(pts[pts.length - 1][0])},${padT + ih}" fill="var(--coral)" opacity=".1"/>`;
    s += `<polyline points="${line}" fill="none" stroke="var(--coral)" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<circle cx="${x(minP[0])}" cy="${y(minP[1])}" r="4" fill="var(--card)" stroke="var(--coral)" stroke-width="2"/><text x="${x(minP[0])}" y="${y(minP[1]) + 16}" text-anchor="middle" style="fill:var(--coral)">${minP[1]}</text>`;
    return s + "</svg>";
  };
}

function nightScoreBlock(n, all, scores) {
  const sc = scores.get(n.date) || sleepScore(n, { bedMedian: bedMedianBefore(all, n.date) });
  const from = addDays(n.date, -30);
  const prior = avgOf(all.filter((x) => x.date < n.date && x.date >= from).map((x) => scores.get(x.date)?.score));
  const diff = prior == null ? null : sc.score - Math.round(prior);
  const parts = sc.parts.map((p) => {
    const off = p.points == null, b = off ? null : scoreBand((p.points / p.max) * 100);
    return `<div class="nvp ${off ? "off" : ""}"><div class="nvp-head"><b>${esc(p.label)}</b><span class="num">${off ? "–" : p.points}<small>/${p.max}</small></span></div>
      <div class="nvp-track"><i style="width:${off ? 0 : (p.points / p.max) * 100}%;background:${off ? "transparent" : BAND_COLOR[b[2]]}"></i></div>
      <div class="nvp-note">${esc(p.note)}</div></div>`;
  }).join("");
  return `<div class="nv-score">
    <div class="nvs-main">${scoreRing(sc.score, 116, 11)}<div>
      <div class="eyebrow">คะแนนการนอน</div>
      <div class="nvs-band">${bandChip(sc.score)}</div>
      ${diff != null ? `<div class="small muted">${diff === 0 ? "เท่ากับ" : diff > 0 ? `<span class="vs up">▲ ${diff}</span> สูงกว่า` : `<span class="vs down">▼ ${-diff}</span> ต่ำกว่า`}ค่าเฉลี่ย 30 คืนก่อนหน้า (${Math.round(prior)})</div>` : ""}
      ${sc.max < 100 ? `<div class="small muted">คิดจาก ${sc.sum}/${sc.max} แล้วปรับเป็นเต็ม 100</div>` : ""}
    </div></div>
    <div class="nvs-parts">${parts}</div>
  </div>`;
}

function nightView(nd, all, scores) {
  if (!nd?.night) return `<section class="card span-12 empty">ยังไม่มีข้อมูลคืนนี้</section>`;
  const n = nd.night, det = nd.detail;
  const mins = stageMinutes(n, det);
  const tib = mins.awake + mins.core + mins.deep + mins.rem || n.sleep_min;
  const ty = typicalRanges(all, n.date);
  const cycles = det?.segments?.length ? sleepCycles(det.segments) : [];
  const restore = (n.deep_min || 0) + (n.rem_min || 0);
  const eff = Math.round((n.sleep_min / tib) * 100);
  const vs = (v, avg, fmt = hm) => avg == null ? "" : `<span class="vs ${v >= avg ? "up" : "down"}">${v >= avg ? "▲" : "▼"} ${fmt(avg)}</span>`;
  const hr = det?.hr?.length ? det.hr.map((p) => p[1]) : null;
  const nightLabel = `คืน${dt({ weekday: "long" }).format(toD(addDays(n.date, -1)))} → ${dWeekday(n.date)} ${dShort(n.date)}`;
  const rowsHtml = STAGES.map((st) => {
    const v = mins[st.key], p = Math.round((v / tib) * 100);
    const r = ty?.[st.key];
    const box = r ? `<span class="typ" style="left:${Math.min(100, (r[0] / tib) * 100)}%;width:${Math.max(1.2, ((r[1] - r[0]) / tib) * 100)}%"></span>` : "";
    return `<div class="srow2"><div class="sr-head"><b>${st.label}</b><span class="sr-pct" style="color:${st.color}">${p}%</span><span class="sr-val num">${hm(v)}</span></div>
      <div class="sr-track"><i style="width:${(v / tib) * 100}%;background:${st.color}"></i>${box}</div>
      ${r ? `<div class="sr-typ">ปกติของคุณ ${hm(r[0])}–${hm(r[1])}</div>` : ""}</div>`;
  }).join("");
  const metric = (label, val, range, fmtR, note = "") => `<div class="mrow3"><span>${label}</span><b>${val}</b><small>${range ? `ปกติ ${fmtR(range[0])}–${fmtR(range[1])}` : ""}${note}</small></div>`;
  return `<section class="card span-12 nightv">
    <div class="nv-nav">
      <a class="btn-ghost ${nd.prev ? "" : "off"}" href="${nd.prev ? `#/sleep/${nd.prev}` : "#"}">◀</a>
      <div><div class="eyebrow">วงจรการนอน</div><h2>${esc(nightLabel)}</h2><div class="muted small">${n.bed_time || "–"} → ${n.wake_time || "–"} · เวลาบนเตียง ${hm(tib)}</div></div>
      <a class="btn-ghost ${nd.next ? "" : "off"}" href="${nd.next ? `#/sleep/${nd.next}` : "#"}">▶</a>
    </div>
    ${nightScoreBlock(n, all, scores)}
    <div class="nv-grid">
      <div>
        <div class="nv-big">
          <div><div class="num big2">${hm(n.sleep_min)} ${vs(n.sleep_min, ty?.sleep[2])}</div><div class="lbl">ชั่วโมงนอน</div></div>
          <div><div class="num big2">${hm(restore)} ${vs(restore, ty?.restore[2])}</div><div class="lbl">ฟื้นฟู (ลึก + REM)</div></div>
          <div><div class="num big2">${cycles.length}</div><div class="lbl">รอบการนอน</div></div>
        </div>
        <ul class="bullets next nv-ins">${nightInsights(n, mins, ty, cycles.length).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        ${hr ? `<div class="nv-sub"><span>หัวใจระหว่างนอน</span><span class="small muted">ต่ำสุด ${Math.min(...hr)} · เฉลี่ย ${Math.round(avgOf(hr))} bpm</span></div>${slot(sleepHrChart(det))}` : ""}
        ${det?.segments?.length ? `<div class="nv-sub"><span>ระยะการนอนตลอดคืน</span><span class="small muted">เส้นประ = จบหนึ่งรอบ (หลังช่วง REM)</span></div>${slot(hypnogram(det, cycles))}` : `<p class="muted small">คืนนี้ไม่มีข้อมูลรายช่วง</p>`}
      </div>
      <div>
        <div class="nv-sub"><span>เวลาในแต่ละระยะ</span><span class="small muted"><span class="typ-key"></span> ช่วงปกติ 30 คืน</span></div>
        ${rowsHtml}
        <div class="nv-sub" style="margin-top:16px"><span>เทียบกับ 30 คืนก่อนหน้า</span></div>
        <div class="mrows3">
          ${metric("เข้านอน", n.bed_time || "–", ty?.bed, fromNight)}
          ${metric("ตื่น", n.wake_time || "–", ty?.wake, fromNight)}
          ${metric("ชั่วโมงนอน", hm(n.sleep_min), ty?.sleep, hm)}
          ${metric("ฟื้นฟู (ลึก+REM)", hm(restore), ty?.restore, hm)}
          ${metric("ประสิทธิภาพการนอน", `${eff}%`, ty?.eff, (v) => `${Math.round(v)}%`)}
        </div>
      </div>
    </div>
  </section>`;
}

function periodStats(nights) {
  const mins = nights.map((n) => n.sleep_min);
  const staged = nights.filter(hasStages);
  return {
    n: nights.length,
    avg: avgOf(mins),
    pct7: nights.length ? Math.round((nights.filter((n) => n.sleep_min >= SLEEP_TARGET).length / nights.length) * 100) : null,
    bed: avgOf(nights.map((n) => nightMin(n.bed_time))),
    bedSd: sd(nights.map((n) => nightMin(n.bed_time))),
    wake: avgOf(nights.map((n) => nightMin(n.wake_time))),
    deepPct: staged.length ? avgOf(staged.map((n) => n.deep_min / n.sleep_min)) * 100 : null,
    remPct: staged.length ? avgOf(staged.map((n) => n.rem_min / n.sleep_min)) * 100 : null,
    awake: avgOf(nights.map((n) => n.awake_min)),
  };
}

function renderSleep(d, nd) {
  const all = d.nights;
  if (!all.length) { app.innerHTML = `<div class="view"><div class="card empty">ยังไม่มีข้อมูลการนอน</div></div>`; return; }
  const last = all[all.length - 1];
  const byDate = (from, to) => all.filter((n) => n.date > addDays(d.today, -from) && n.date <= addDays(d.today, -to));
  const s7 = periodStats(byDate(7, 0)), s30 = periodStats(byDate(30, 0)), p30 = periodStats(byDate(60, 30)), s90 = periodStats(byDate(90, 0));
  const bedMedian = median(byDate(30, 0).map((n) => nightMin(n.bed_time)));
  const diff = s30.avg != null && p30.avg != null ? s30.avg - p30.avg : null;
  const trend = diff == null ? ["", "ข้อมูลยังไม่พอเทียบ"] : diff >= 10 ? ["good", `ดีขึ้น: เฉลี่ยนานขึ้น ${Math.round(diff)} นาที/คืน จาก 30 วันก่อนหน้า`]
    : diff <= -10 ? ["bad", `แย่ลง: เฉลี่ยสั้นลง ${Math.round(-diff)} นาที/คืน จาก 30 วันก่อนหน้า`] : ["fair", `ทรงตัว: ต่างจาก 30 วันก่อนหน้า ${diff >= 0 ? "+" : ""}${Math.round(diff)} นาที/คืน`];
  const months = {};
  for (const n of all) (months[n.date.slice(0, 7)] ||= []).push(n);
  const monthKeys = Object.keys(months).sort().slice(-12);
  const maxMonth = Math.max(...monthKeys.map((k) => avgOf(months[k].map((n) => n.sleep_min))));
  const wd = [0, 0, 0, 0, 0, 0, 0].map(() => []);
  for (const n of byDate(120, 0)) wd[(toD(addDays(n.date, -1)).getUTCDay() + 6) % 7].push(n.sleep_min);
  const wdAvg = wd.map(avgOf);
  const wdMax = Math.max(...wdAvg.filter((x) => x != null));
  const DOW_FULL = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
  const range = all.slice(-sleepRange);
  const cmp = (a, b, fmt, lowerBetter) => {
    if (a == null || b == null) return "";
    const dd = a - b, good = lowerBetter ? dd < 0 : dd > 0;
    return `<span style="color:${Math.abs(dd) < 1 ? "var(--ink-3)" : good ? "var(--volt)" : "var(--coral)"}">${dd > 0 ? "▲" : dd < 0 ? "▼" : "•"} ${fmt(Math.abs(dd))}</span>`;
  };
  const tagHtml = (t) => `<span class="snote s-${t[0]}">${esc(t[1])}</span>`;
  const note = d.note;
  const scores = sleepScores(all);
  const avgScore = (nights) => { const v = avgOf(nights.map((n) => scores.get(n.date)?.score)); return v == null ? null : Math.round(v); };
  const sc7 = avgScore(byDate(7, 0)), sc30 = avgScore(byDate(30, 0)), scP30 = avgScore(byDate(60, 30)), sc90 = avgScore(byDate(90, 0));
  const lastSc = scores.get(last.date)?.score;
  const lost = { dur: [], stage: [], cont: [], bed: [] }, labels = {};
  for (const n of byDate(30, 0)) for (const p of scores.get(n.date)?.parts || []) if (p.points != null) { lost[p.key].push(p.max - p.points); labels[p.key] = [p.label, p.max]; }
  const lostRows = Object.entries(lost).filter(([, v]) => v.length).map(([k, v]) => [k, avgOf(v)]).sort((a, b) => b[1] - a[1]);
  const lostMax = Math.max(1, ...lostRows.map((r) => r[1]));
  const scoreTile = (label, v, extra = "") => `<div class="sc-tile"><div class="lbl">${label}</div>${v == null ? `<div class="num sc-num">–</div>` : `<div class="sc-val"><span class="num sc-num">${v}</span>${bandChip(v)}</div>`}${extra}</div>`;

  app.innerHTML = `<div class="view">
    ${subnav("health", "#/sleep")}
    <div class="page-head"><div><h1>การนอน</h1><p>${all.length} คืน · ข้อมูลล่าสุด ${dLong(last.date)} (คืนก่อนหน้า)</p></div></div>
    <div class="grid">
      ${nightView(nd, all, scores)}
      <section class="card span-12 sc-card">
        <div class="card-head"><h2>คะแนนการนอน (เต็ม 100)</h2>
          <div class="seg">${[30, 90, 365].map((r) => `<button type="button" class="${r === sleepRange ? "on" : ""}" data-range="${r}">${r === 365 ? "1 ปี" : `${r} คืน`}</button>`).join("")}</div></div>
        <div class="sc-top">
          <div class="sc-tiles">
            ${scoreTile("คืนล่าสุด", lastSc)}
            ${scoreTile("เฉลี่ย 7 คืน", sc7)}
            ${scoreTile("เฉลี่ย 30 คืน", sc30, sc30 != null && scP30 != null ? `<div class="small muted">${cmp(sc30, scP30, (v) => `${Math.round(v)}`)} จาก 30 คืนก่อนหน้า (${scP30})</div>` : "")}
          </div>
          <div class="sc-lost"><div class="lbl">เสียคะแนนจากตรงไหน (เฉลี่ย 30 คืน)</div>
            ${lostRows.map(([k, v]) => `<div class="mrow"><span>${esc(labels[k][0])}</span><div class="mtrack"><i style="width:${(v / lostMax) * 100}%;background:var(--coral)"></i></div><b>−${v.toFixed(1)}</b><small>จากเต็ม ${labels[k][1]}</small></div>`).join("")}
          </div>
        </div>
        <div class="legend" style="margin:14px 0 8px"><span><i style="background:var(--volt)"></i>85+ ดีมาก</span><span><i style="background:var(--sky)"></i>70–84 ดี</span><span><i style="background:var(--amber)"></i>55–69 พอใช้</span><span><i style="background:var(--coral)"></i>&lt;55 ต้องปรับ</span><span><i style="background:var(--ink);height:3px"></i>เฉลี่ย 7 คืน</span></div>
        ${slot(scoreChart(range, scores))}
        ${SCORE_HOW}
      </section>
      <section class="card span-12">
        <div class="card-head"><h2>แนวโน้ม</h2></div>
        <div class="trend t-${trend[0]}">${esc(trend[1])}</div>
        <div class="stable">
          <div class="srow shead"><span></span><span>7 คืน</span><span>30 คืน</span><span>30 คืนก่อนหน้า</span><span>90 คืน</span></div>
          <div class="srow"><span>คะแนนการนอน</span><b>${sc7 ?? "–"}</b><b>${sc30 ?? "–"} ${cmp(sc30, scP30, (v) => `${Math.round(v)}`)}</b><b>${scP30 ?? "–"}</b><b>${sc90 ?? "–"}</b></div>
          <div class="srow"><span>นอนเฉลี่ย</span><b>${hm(s7.avg)}</b><b>${hm(s30.avg)} ${cmp(s30.avg, p30.avg, (v) => `${Math.round(v)}น.`)}</b><b>${hm(p30.avg)}</b><b>${hm(s90.avg)}</b></div>
          <div class="srow"><span>คืนที่ถึง 7 ชม.</span><b>${s7.pct7 ?? "–"}%</b><b>${s30.pct7 ?? "–"}% ${cmp(s30.pct7, p30.pct7, (v) => `${Math.round(v)}%`)}</b><b>${p30.pct7 ?? "–"}%</b><b>${s90.pct7 ?? "–"}%</b></div>
          <div class="srow"><span>เข้านอนเฉลี่ย</span><b>${s7.bed != null ? fromNight(s7.bed) : "–"}</b><b>${s30.bed != null ? fromNight(s30.bed) : "–"} ${cmp(s30.bed, p30.bed, (v) => `${Math.round(v)}น.`, true)}</b><b>${p30.bed != null ? fromNight(p30.bed) : "–"}</b><b>${s90.bed != null ? fromNight(s90.bed) : "–"}</b></div>
          <div class="srow"><span>เวลาเข้านอนแกว่ง ±</span><b>${s7.bedSd != null ? Math.round(s7.bedSd) + "น." : "–"}</b><b>${s30.bedSd != null ? Math.round(s30.bedSd) + "น." : "–"} ${cmp(s30.bedSd, p30.bedSd, (v) => `${Math.round(v)}น.`, true)}</b><b>${p30.bedSd != null ? Math.round(p30.bedSd) + "น." : "–"}</b><b>${s90.bedSd != null ? Math.round(s90.bedSd) + "น." : "–"}</b></div>
          <div class="srow"><span>หลับลึก / REM</span><b>${s7.deepPct != null ? `${Math.round(s7.deepPct)}/${Math.round(s7.remPct)}%` : "–"}</b><b>${s30.deepPct != null ? `${Math.round(s30.deepPct)}/${Math.round(s30.remPct)}%` : "–"}</b><b>${p30.deepPct != null ? `${Math.round(p30.deepPct)}/${Math.round(p30.remPct)}%` : "–"}</b><b>${s90.deepPct != null ? `${Math.round(s90.deepPct)}/${Math.round(s90.remPct)}%` : "–"}</b></div>
        </div>
      </section>

      <section class="card span-12">
        <div class="card-head"><h2>ชั่วโมงนอนรายคืน</h2>
          <div class="seg">${[30, 90, 365].map((r) => `<button type="button" class="${r === sleepRange ? "on" : ""}" data-range="${r}">${r === 365 ? "1 ปี" : `${r} คืน`}</button>`).join("")}</div></div>
        <div class="legend" style="margin-bottom:8px"><span><i style="background:var(--deep)"></i>หลับลึก</span><span><i style="background:var(--core)"></i>Core</span><span><i style="background:var(--rem)"></i>REM</span><span><i style="background:var(--ink-3)"></i>ไม่มีข้อมูลระยะ</span><span><i style="background:var(--ink);height:3px"></i>เฉลี่ย 7 คืน</span></div>
        ${slot(sleepBarsChart(range))}
      </section>
      <section class="card span-12">
        <div class="card-head"><h2>เวลาเข้านอน → ตื่น</h2><span class="small muted">แท่งยิ่งเรียงตรงกัน = นอนเป็นเวลา</span></div>
        ${slot(scheduleChart(range))}
      </section>

      <section class="card span-6">
        <div class="card-head"><h2>เฉลี่ยรายเดือน</h2></div>
        <div class="mrows">${monthKeys.map((k) => { const a = avgOf(months[k].map((n) => n.sleep_min)); const p7 = Math.round((months[k].filter((n) => n.sleep_min >= SLEEP_TARGET).length / months[k].length) * 100);
          return `<div class="mrow"><span>${dt({ month: "short", year: "2-digit" }).format(toD(k + "-01"))}</span><div class="mtrack"><i style="width:${(a / maxMonth) * 100}%;background:${a >= SLEEP_TARGET ? "var(--volt)" : a >= 390 ? "var(--sky)" : "var(--amber)"}"></i></div><b>${hm(a)}</b><small>${p7}% ถึง 7 ชม. · ${months[k].length} คืน</small></div>`; }).join("")}</div>
      </section>
      <section class="card span-6">
        <div class="card-head"><h2>ตามคืนของสัปดาห์</h2><span class="small muted">120 วันล่าสุด</span></div>
        <div class="mrows">${DOW_FULL.map((name, i) => wdAvg[i] == null ? "" : `<div class="mrow"><span>คืน${name}</span><div class="mtrack"><i style="width:${(wdAvg[i] / wdMax) * 100}%;background:${wdAvg[i] >= SLEEP_TARGET ? "var(--volt)" : wdAvg[i] >= 390 ? "var(--sky)" : "var(--amber)"}"></i></div><b>${hm(wdAvg[i])}</b><small>${wd[i].length} คืน</small></div>`).join("")}</div>
      </section>

      ${note ? `<section class="card coach span-12"><div class="card-head"><h2>${ICON.coach} บทวิเคราะห์การนอนจากโค้ช</h2><span class="small muted">${dMed(note.created_at.slice(0, 10))}</span></div>
        <div class="verdict">${esc(note.verdict || note.title)}</div>
        <div class="note-cols">
          <div><h4>จุดดี</h4><ul class="bullets">${(note.highlights || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div><h4>ต้องระวัง</h4><ul class="bullets warn">${(note.watchouts || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div><h4>ลองทำ</h4><ul class="bullets next">${(note.next_steps || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        </div>${note.body_md ? `<div class="prose">${md(note.body_md)}</div>` : ""}</section>` : ""}

      <section class="card span-12">
        <div class="card-head"><h2>วิเคราะห์รายคืน (14 คืนล่าสุด)</h2><span class="small muted">แตะคืนไหนเพื่อดูวงจรการนอน</span></div>
        <div class="nights">${all.slice(-14).reverse().map((n) => `<a class="night ${nd?.night?.date === n.date ? "sel" : ""}" href="#/sleep/${n.date}">
          <div class="ns">${scores.has(n.date) ? scoreRing(scores.get(n.date).score) : ""}</div>
          <div class="nd"><b>${dWeekday(n.date)} ${dShort(n.date)}</b><span>${n.bed_time ? `${n.bed_time}→${n.wake_time}` : ""}</span></div>
          <div class="nh num">${hm(n.sleep_min)}</div>
          <div class="nb">${stageBar(n)}<div class="snotes">${nightNotes(n, { bedMedian }).map(tagHtml).join("")}</div></div>
        </a>`).join("")}</div>
      </section>
    </div>
  </div>`;
  app.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { sleepRange = Number(b.dataset.range); charts.length = 0; renderSleep(d, nd); drawCharts(); }));
}

function avgOf(xs) {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Race name without the "· เป้าแรก" tag we add ourselves. */
const raceShort = (r) => String(r.name || `${r.distance_km} km`).replace(/\s*·\s*เป้าแรก\s*$/, "");

/** Short race name for tight spots: "City10 presented by Brand" → "City10". */
const raceTiny = (r) => raceShort(r).replace(/\s+presented by\b.*$/i, "");
/** The athlete's main target for that race without its bracketed note: "ต่ำกว่า 1:15". */
const raceTarget = (r) => (r.main_goal && r.goals?.[r.main_goal] ? r.goals[r.main_goal].replace(/\s*\(.*\)\s*$/, "") : "");

/** First goal on the way to the Half: the next upcoming race (d.next_race). */
function firstRaceBox(r) {
  if (!r) return "";
  const g = r.goals || {};
  return `<div class="first-race">
    <div class="fr-head">
      <span class="fr-tag">${ICON.flag || ""}เป้าแรก</span>
      <span class="fr-days"><span class="num">${r.days_to}</span> วัน</span>
    </div>
    <div class="fr-name">${esc(raceShort(r))}${raceTarget(r) ? ` · <span class="fr-target">${esc(raceTarget(r))}</span>` : ""}</div>
    <div class="fr-meta">${dLong(r.race_date)}${r.location ? ` · ${esc(r.location)}` : ""}</div>
    ${g.A || g.B || g.C ? `<div class="goal-chips">${["A", "B", "C"].filter((k) => g[k]).map((k) => `<span class="goal-chip${k === r.main_goal ? " main" : ""}">${k === r.main_goal ? "★ " : ""}${k} · <b>${esc(g[k])}</b></span>`).join("")}</div>` : ""}
  </div>`;
}

function goalHero(d, span = "span-12") {
  const p = d.profile, longest = d.records.longest_run;
  return `<section class="card hero ${span}">
    <div class="hero-top">
      <div>
        <div class="eyebrow">Road to Half Marathon</div>
        <div class="countdown"><span class="num">${d.days_to_race ?? "–"}</span><span>วัน</span></div>
        <h1>${esc(p.goal_race_name || "Half Marathon 21.1 km")}</h1>
        <div class="race-meta">${p.goal_race_date ? dLong(p.goal_race_date) : ""}${d.current_phase ? ` · ตอนนี้อยู่ช่วง <b style="color:var(--volt)">${esc(d.current_phase.name)}</b>` : ""}</div>
        <div class="goal-chips">
          ${p.goal_a ? `<span class="goal-chip">A · <b>${esc(p.goal_a)}</b></span>` : ""}
          ${p.goal_b ? `<span class="goal-chip">B · <b>${esc(p.goal_b)}</b></span>` : ""}
          ${p.goal_c ? `<span class="goal-chip">C · <b>${esc(p.goal_c)}</b></span>` : ""}
        </div>
        ${firstRaceBox(d.next_race)}
      </div>
      <div class="longest-ring">
        ${ring(longest?.distance_km ?? 0, 21.1)}
        <div class="ring-label"><div class="num">${kmFixed(longest?.distance_km ?? 0, 2)}<small style="font-size:15px;color:var(--ink-3)"> km</small></div><p>วิ่งไกลสุดตอนนี้</p></div>
      </div>
    </div>
    ${journey(d.phases, d.today)}
  </section>`;
}

/** วันนี้: only what the athlete needs to act on today — the long-term picture lives under แผน, history under วิ่ง / เวท. */
function renderHome(d) {
  const p = d.profile;
  const longest = d.records.longest_run;
  const note = d.latest_note;

  const goal = `<a class="goal-strip span-12" href="#/goal">
    <span class="gd"><span class="num">${d.days_to_race ?? "–"}</span><small>วัน</small></span>
    <span class="gt"><b>${esc(p.goal_race_name || "Half Marathon 21.1 km")}</b>
      <small>${d.current_phase ? `ช่วง${esc(d.current_phase.name)} · ` : ""}วิ่งไกลสุด ${kmFixed(longest?.distance_km ?? 0, 2)} / 21.1 km</small>
      </span>
    ${ICON.right}
    ${d.next_race ? `<span class="fr-row"><span class="fr-line"><span class="fr-l">เป้าแรก:</span><b>${esc(raceTiny(d.next_race))}${raceTarget(d.next_race) ? ` · ${esc(raceTarget(d.next_race))}` : ""}</b><span class="fr-d">· อีก ${d.next_race.days_to} วัน</span></span></span>` : ""}</a>`;

  const coach = note ? `<section class="card coach span-5">
    <div class="card-head"><h2>${ICON.coach} โน้ตล่าสุดจาก${esc(coachLabel(p.coach_name))}</h2><a class="link" href="#/notes">โน้ตทั้งหมด →</a></div>
    <div class="verdict">${esc(note.verdict || note.title)}</div>
    <div class="meta">${esc(note.title)}</div>
    ${note.next_steps?.length ? `<ul class="bullets next">${note.next_steps.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${note.run_id ? `<a class="link small" href="#/runs/${note.run_id}">ดูการวิ่งครั้งนี้ →</a>` : note.workout_id ? `<a class="link small" href="#/strength/${note.workout_id}">ดูบันทึกเวทครั้งนี้ →</a>` : ""}
  </section>` : "";

  const upcoming = `<section class="card ${note ? "span-7" : "span-12"}">
    <div class="card-head"><h2>${ICON.cal} ซ้อมครั้งถัดไป</h2><a class="link" href="#/plan">ดูแผนทั้งหมด →</a></div>
    ${d.upcoming.length ? d.upcoming.map((w) => `<button type="button" class="wbtn" data-upcoming="${w.id}">${workoutRow(w, d.today, { compact: true })}</button>`).join("") : `<div class="empty">ยังไม่มีแผนล่วงหน้า</div>`}
  </section>`;

  app.innerHTML = `<div class="view grid">${dailyCard(d)}${goal}${todayCard(d)}${weekCard(d)}${upcoming}${coach}</div>`;
}

/** แผน › เป้าหมาย & เส้นทาง: the race goal, the phases that lead to it and the checkpoints on the way. */
function renderGoal(d) {
  app.innerHTML = `<div class="view">
    ${subnav("plan", "#/goal")}
    <div class="grid">
      ${goalHero(d)}
      <div class="span-12"><h2 class="section-title" style="margin-top:8px">เส้นทาง ${d.phases.length} ช่วง</h2><p class="section-sub">แต่ละช่วงมีเป้าของตัวเอง ช่วงที่ไฮไลต์คือช่วงปัจจุบัน</p>${phaseCards(d.phases, d.today)}</div>
      <section class="card span-12"><div class="card-head"><h2>${ICON.flag} Milestones</h2><span class="small muted">จุดเช็กระหว่างทาง</span></div>${milestoneList(d.milestones)}</section>
    </div>
  </div>`;
}

/** วิ่ง › สถิติ: everything that looks back at running — volume, records, calendar, intensity split, history. */
function renderRunStats(d, h) {
  const r = d.records;
  const volume = `<section class="card span-8">
    <div class="card-head"><h2>${ICON.chart} ระยะรายสัปดาห์ (km)</h2>
      <div class="legend"><span><i class="l-volt"></i>วิ่งจริง</span><span><i class="l-plan"></i>เป้าตามแผน</span></div></div>
    ${slot(weeklyChart(d.weekly, d.week_start))}
  </section>`;

  const records = `<section class="card span-4">
    <div class="card-head"><h2>${ICON.trophy} สถิติส่วนตัว</h2></div>
    <div class="records">
      <div class="record"><div class="label">ไกลสุด</div><div class="num">${kmFixed(r.longest_run?.distance_km, 2)}<small>km</small></div><div class="when">${r.longest_run ? dShort(r.longest_run.run_date) : ""}</div></div>
      <div class="record"><div class="label">กิโลเร็วสุด</div><div class="num">${pace(r.fastest_km?.pace_s)}<small>/km</small></div><div class="when">${r.fastest_km ? dShort(r.fastest_km.run_date) : ""}</div></div>
      <div class="record"><div class="label">ออกกำลังนานสุด</div><div class="num">${duration(r.longest_time?.moving_time_s)}</div><div class="when">${r.longest_time ? dShort(r.longest_time.run_date) : ""}</div></div>
      <div class="record"><div class="label">เพซเฉลี่ยดีสุด (≥3 km)</div><div class="num">${pace(r.best_avg_pace?.avg_pace_s)}<small>/km</small></div><div class="when">${r.best_avg_pace ? dShort(r.best_avg_pace.run_date) : ""}</div></div>
      <div class="record"><div class="label">ระยะรวม</div><div class="num">${kmFixed(d.totals.km)}<small>km</small></div><div class="when">${d.totals.runs} ครั้ง</div></div>
      <div class="record"><div class="label">เวลารวม</div><div class="num">${duration(d.totals.time_s)}</div><div class="when">ชั่วโมงบนเท้า</div></div>
    </div>
  </section>`;

  const heat = `<section class="card span-7">
    <div class="card-head"><h2>${ICON.grid} ปฏิทินการวิ่ง 26 สัปดาห์</h2>
      <div class="legend"><span><i style="background:var(--heat-0)"></i>0</span><span><i style="background:color-mix(in srgb,var(--volt) 35%,var(--heat-0))"></i>&lt;4</span><span><i style="background:color-mix(in srgb,var(--volt) 62%,var(--heat-0))"></i>4–7</span><span><i class="l-volt"></i>7+ km</span></div></div>
    ${heatmap(d)}
    ${last4(d)}
  </section>`;

  const secs = d.zone_4w, total = secs.reduce((a, b) => a + b, 0);
  const easy = total ? Math.round(((secs[0] + secs[1]) / total) * 100) : 0;
  const intensity = `<section class="card span-5">
    <div class="card-head"><h2>${ICON.heart} ความหนัก 4 สัปดาห์ล่าสุด</h2><a class="link" href="#/zones">โซนคืออะไร →</a></div>
    ${total ? `<div class="eyebrow">เป้า 80/20 · เบา 80% หนัก 20%</div>${zoneBar(secs)}
      <div class="small" style="margin-top:6px"><b style="color:var(--z2)">เบา Z1–Z2 ${easy}%</b> · <b style="color:var(--z4)">หนัก Z3+ ${100 - easy}%</b>
      ${easy >= 80 ? " — สมดุลดีมากค่ะ" : " — ยังหนักไปนิด วิ่งช้าลงอีกหน่อยนะคะ"}</div>` : `<div class="empty">ยังไม่มีข้อมูลหัวใจของ 4 สัปดาห์ล่าสุด</div>`}
    <div class="zlist" style="margin-top:14px">${d.zones.map((z, i) => `<div class="zitem"><span class="zsw" style="background:${ZCOL[i]}"></span><b>Z${z.z}</b><span>${esc(z.name)}</span><span class="num">${duration(secs[i] || 0)}</span></div>`).join("")}</div>
  </section>`;

  const done = (h.races || []).filter((x) => x.time_s);
  const best = done.reduce((b, x) => (!b || x.time_s < b.time_s ? x : b), null);
  const raceByYear = Object.fromEntries(done.map((x) => [Number(x.race_date.slice(0, 4)), x]));
  const monthKm = {};
  for (const run of h.runs) monthKm[run.run_date.slice(0, 7)] = (monthKm[run.run_date.slice(0, 7)] || 0) + run.distance_km;
  const months = Object.keys(monthKm).sort().slice(-12);
  const years = `<section class="card span-7"><div class="card-head"><h2>ประวัติการวิ่งรายปี (km)</h2><div class="legend"><span><i class="l-volt"></i>ปีที่วิ่ง Half</span></div></div>${slot(yearBars(h.years))}
    <div class="ytable">${[...h.years].reverse().filter((y) => y.km >= 5).map((y) => `<div class="yrow ${y.longest_km >= 21 ? "hm" : ""}"><b>${y.year}</b><span>${y.runs} ครั้ง</span><span>${Math.round(y.km)} km</span><span>${raceByYear[y.year] ? `🏅 ${esc(raceByYear[y.year].name.replace(/ \d{4}$/, ""))} · ${duration(raceByYear[y.year].time_s)}` : `ไกลสุด ${y.longest_km.toFixed(1)} km`}</span><span>${y.best_pace_s ? `เพซดีสุด ${pace(y.best_pace_s)}` : ""}</span></div>`).join("")}</div>
  </section>`;
  const races = `<section class="card span-5"><div class="card-head"><h2>${ICON.trophy} Half Marathon ที่เคยวิ่ง</h2></div>
    ${done.length ? done.map((x) => `<div class="hm-item"><div class="num">${duration(x.time_s)}</div><div>
      <b>${esc(x.name)}</b>${x === best ? ` <span class="chip s-done">PB</span>` : ""}
      <div class="small muted">${dLong(x.race_date)} · เพซ ${pace(x.time_s / x.distance_km)}/km${x.measured_km ? ` · GPS วัดได้ ${x.measured_km.toFixed(2)} km` : ""}</div>
      ${x.notes ? `<div class="small" style="color:var(--ink-2);margin-top:2px">${esc(x.notes)}</div>` : ""}</div></div>`).join("") : `<div class="empty">ยังไม่มี</div>`}
    <p class="small muted" style="margin-top:12px">ร่างกายเคยทำได้มาแล้ว เป้าปีหน้าคือกลับไปจบแบบแข็งแรงและไม่เจ็บ</p>
    <div class="card-head" style="margin-top:18px"><h3>ระยะต่อเดือน (12 เดือน)</h3></div>
    <div class="mbars">${months.map((m) => `<div class="mbar"><i style="height:${Math.max(4, (monthKm[m] / Math.max(...months.map((k) => monthKm[k]))) * 100)}%"></i><span>${dMonth(m + "-01")}</span><b>${Math.round(monthKm[m])}</b></div>`).join("")}</div>
  </section>`;

  app.innerHTML = `<div class="view">
    ${subnav("runs", "#/runs/stats")}
    <div class="page-head"><div><h1>สถิติการวิ่ง</h1><p>${d.totals.runs} ครั้ง · ${kmFixed(d.totals.km)} km · ${duration(d.totals.time_s)} ตั้งแต่เริ่มบันทึก</p></div></div>
    <div class="grid">${volume}${records}${heat}${intensity}
      <div class="span-12"><h2 class="section-title" style="margin-top:8px">ย้อนหลังจาก Apple Health</h2><p class="section-sub">ประวัติก่อนเริ่มแอปนี้ ไว้เทียบว่าตอนนี้อยู่ตรงไหน</p></div>
      ${years}${races}</div>
  </div>`;
}

function heatmap(d) {
  const start = d.heatmap.start, today = d.today;
  const weeks = 26;
  let cells = "", months = "", lastMonth = "";
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(start, w * 7);
    const m = dMonth(ws);
    months += `<span>${m !== lastMonth ? m : ""}</span>`;
    lastMonth = m;
    for (let i = 0; i < 7; i++) {
      const day = addDays(ws, i);
      const v = d.heatmap.daily[day] || 0;
      const lvl = v === 0 ? "" : v < 4 ? "l1" : v < 7 ? "l2" : "l3";
      const fut = day > today ? "future" : "";
      cells += `<i class="${lvl} ${fut} ${day === today ? "today" : ""}" title="${dShort(day)}${v ? ` · ${v} km` : ""}"></i>`;
    }
  }
  return `<div class="heat-wrap" id="heatwrap"><div class="heat-months">${months}</div><div class="heat">${cells}</div></div>`;
}

function last4(d) {
  const past = d.weekly.filter((w) => w.week_start <= d.week_start).slice(-4);
  const kmSum = past.reduce((s, w) => s + w.km, 0), runs = past.reduce((s, w) => s + w.runs, 0), t = past.reduce((s, w) => s + w.time_s, 0);
  const days = Object.keys(d.heatmap.daily).length;
  return `<div class="stat-row" style="margin-top:18px">
    <div class="stat"><div class="label">4 สัปดาห์ล่าสุด</div><div class="value">${kmFixed(kmSum)}<small>km</small></div><div class="foot">${runs} ครั้ง · ${hoursMin(t)}</div></div>
    <div class="stat"><div class="label">เฉลี่ยต่อสัปดาห์</div><div class="value">${kmFixed(kmSum / 4)}<small>km</small></div><div class="foot">เป้า Phase 1: ${d.current_phase ? `${d.current_phase.weekly_km_from}–${d.current_phase.weekly_km_to}` : "–"} km</div></div>
    <div class="stat"><div class="label">วันที่ได้วิ่ง</div><div class="value">${days}<small>วัน</small></div><div class="foot">ใน 26 สัปดาห์</div></div>
  </div>`;
}

function milestoneList(list) {
  const nextIdx = list.findIndex((m) => !m.achieved_date);
  return `<ul class="milestones">${list
    .map((m, i) => {
      const cls = [m.achieved_date ? "done" : "", i === nextIdx ? "next" : "", i === list.length - 1 ? "goal" : ""].join(" ");
      return `<li class="${cls}"><span class="mk">${m.achieved_date ? ICON.check : ""}</span>
        <div><div class="mt">${esc(m.title)}</div>${m.description ? `<div class="md">${esc(m.description)}</div>` : ""}</div>
        <div class="mdate">${m.achieved_date ? `✓ ${dShort(m.achieved_date)}` : m.target_date ? `เป้า ${dt({ month: "short", year: "2-digit" }).format(toD(m.target_date))}` : ""}</div></li>`;
    })
    .join("")}</ul>`;
}

function ago(iso) {
  if (!iso) return "ยังไม่เคย";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  if (m < 1440) return `${Math.round(m / 60)} ชม.ที่แล้ว`;
  return `${Math.round(m / 1440)} วันที่แล้ว`;
}

function stravaBar(st) {
  if (!st?.configured) return "";
  if (!st.connected) {
    return `<div class="strava-bar"><span>ยังไม่ได้เชื่อม Strava — เชื่อมครั้งเดียว แล้วการวิ่งใหม่จะเข้ามาเอง</span>
      <a class="btn-strava" href="/strava/connect">เชื่อมต่อ Strava</a></div>`;
  }
  return `<div class="strava-bar"><span><b class="strava-dot"></b>ซิงก์จาก Strava อัตโนมัติ${st.athlete_name ? ` · ${esc(st.athlete_name)}` : ""} · ล่าสุด ${ago(st.last_sync_at)}</span>
    <button class="btn-ghost" id="syncNow" type="button">ซิงก์ตอนนี้</button></div>`;
}

async function syncNow(btn) {
  btn.disabled = true;
  btn.textContent = "กำลังซิงก์…";
  try {
    const res = await fetch("/api/strava/sync", { method: "POST" });
    const r = await res.json();
    btn.textContent = r.status === "cooldown" ? "เพิ่งซิงก์ไป รอสักครู่" : `ได้ ${r.imported ?? 0} รายการใหม่`;
    if (r.imported) setTimeout(router, 800);
  } catch {
    btn.textContent = "ซิงก์ไม่สำเร็จ";
  }
}

function renderRuns(runs, zones, st) {
  const body = runs.length
    ? runs.map((r) => `<a class="card run-card" href="#/runs/${r.id}">
        <div>
          <div class="when">${dLong(r.run_date)}${r.start_time ? ` · ${esc(r.start_time)}` : ""}</div>
          <h3>${esc(r.title || "Run")} ${r.run_type ? chip(r.run_type) : ""} ${r.indoor ? `<span class="chip k-indoor">ลู่วิ่ง</span>` : ""} ${r.verdict ? "" : `<span class="chip s-pending">รอโค้ชวิเคราะห์</span>`}</h3>
          <div class="metrics">
            <div class="metric"><div class="num">${kmFixed(r.distance_km, 2)}<small>km</small></div><div class="l">ระยะ</div></div>
            <div class="metric"><div class="num">${pace(r.avg_pace_s)}<small>/km</small></div><div class="l">เพซเฉลี่ย</div></div>
            <div class="metric"><div class="num">${duration(r.moving_time_s)}</div><div class="l">เวลา</div></div>
            ${r.avg_hr ? `<div class="metric hr"><div class="num">${r.avg_hr}<small>bpm</small></div><div class="l">HR เฉลี่ย</div></div>` : ""}
          </div>
          ${r.zone_time ? zoneBar(r.zone_time.secs, true) : ""}
          ${r.verdict ? `<div class="verdict">${esc(r.verdict)}</div>` : ""}
        </div>
        ${sparkSplits(r.splits, zones)}
      </a>`).join("")
    : `<div class="card empty">ยังไม่มีบันทึกการวิ่ง</div>`;
  const totalKm = runs.reduce((s, r) => s + r.distance_km, 0);
  app.innerHTML = `<div class="view">
    ${subnav("runs", "#/runs")}
    <div class="page-head"><div><h1>บันทึกการวิ่ง</h1><p>${runs.length} ครั้ง · ${kmFixed(totalKm)} km</p></div>
    ${zoneLegend(zones)}</div>
    ${stravaBar(st)}
    <div class="run-list">${body}</div>
    ${st?.connected ? `<p class="powered">Powered by Strava</p>` : ""}</div>`;
  document.getElementById("syncNow")?.addEventListener("click", (e) => syncNow(e.currentTarget));
}

function renderRun(d) {
  const r = d.run, a = d.analysis, cap = Number(d.profile.easy_hr_cap || 145);
  // Step-based cadence (Watch step samples, running stretches only) when the stream has it; else a rough average.
  const cadExact = !!d.points?.cad;
  const cadence = r.cadence_spm || (r.steps && r.moving_time_s ? Math.round(r.steps / (r.moving_time_s / 60)) : null);
  const hasSplitCad = d.splits.some((s) => s.cadence_spm);
  const stat = (label, value, unit = "", cls = "", foot = "") =>
    `<div class="stat ${cls}"><div class="label">${label}</div><div class="value">${value}${unit ? `<small>${unit}</small>` : ""}</div>${foot ? `<div class="foot">${foot}</div>` : ""}</div>`;
  const maxSpeed = Math.max(...d.splits.map((s) => 1 / s.pace_s), 0);
  const minSpeed = Math.min(...d.splits.map((s) => 1 / s.pace_s)) * 0.75;
  const splits = d.splits.length
    ? `<div class="splits">
        <div class="split head ${hasSplitCad ? "with-cad" : ""}"><span>km</span><span>เพซ</span><span></span><span class="h">HR</span>${hasSplitCad ? `<span class="c">รอบขา</span>` : ""}</div>
        ${d.splits.map((s) => {
          const w = 18 + ((1 / s.pace_s - minSpeed) / (maxSpeed - minSpeed || 1)) * 82;
          return `<div class="split ${hasSplitCad ? "with-cad" : ""}"><span class="k">${s.distance_km < 0.95 ? kmFixed(s.distance_km, 2) : s.split_no}</span><span class="p">${pace(s.pace_s)}</span>
            <span class="bar-wrap"><i style="width:${w}%;background:${zColor(s.avg_hr, d.zones)}"></i></span><span class="h">${s.avg_hr ?? "–"}${s.avg_hr ? `<small> Z${zoneIdx(s.avg_hr, d.zones) + 1}</small>` : ""}</span>${hasSplitCad ? `<span class="c">${s.cadence_spm ?? "–"}</span>` : ""}</div>`;
        }).join("")}
      </div>
      <div style="margin-top:14px">${zoneLegend(d.zones)}</div>`
    : `<div class="empty">ไม่มีข้อมูล splits</div>`;

  const analysis = a ? `<section class="card coach span-12">
      <div class="card-head"><h2>${ICON.coach} บทวิเคราะห์จากโค้ช</h2>${a.rating ? `<span class="rating" title="เข้ากับแผน ${a.rating}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= a.rating ? "on" : ""}"></i>`).join("")}</span>` : ""}</div>
      <div class="verdict">${esc(a.verdict || a.title)}</div>
      ${zoneSummary(d.zone_time, d.zones)}
      <div class="note-cols">
        <div><h4>จุดดี</h4><ul class="bullets">${(a.highlights || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div><h4>ต้องระวัง</h4><ul class="bullets warn">${(a.watchouts || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div><h4>ครั้งต่อไป</h4><ul class="bullets next">${(a.next_steps || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
      ${a.body_md ? `<div class="prose">${md(a.body_md)}</div>` : ""}
    </section>` : "";

  app.innerHTML = `<div class="view">
    <a class="back" href="#/runs">${ICON.left} บันทึกการวิ่ง</a>
    <div class="page-head">
      <div><div class="eyebrow">${dLong(r.run_date)}${r.start_time ? ` · ${esc(r.start_time)}` : ""}</div>
        <h1>${esc(r.title || "Run")} ${r.run_type ? chip(r.run_type) : ""} ${r.indoor ? `<span class="chip k-indoor">ลู่วิ่ง</span>` : ""}</h1>
        <p class="small">${r.device ? esc(r.device) : ""}${r.strava_id ? ` · <a class="strava-link" href="https://www.strava.com/activities/${r.strava_id}" target="_blank" rel="noopener">View on Strava</a>` : r.source ? ` · ${esc({ shortcut: "ส่งจาก iPhone อัตโนมัติ", apple_health: "Apple Health", strava: "ภาพจาก Strava" }[r.source] || r.source)}` : ""}</p></div>
      <div class="pager">
        <a class="${d.prev ? "" : "off"}" href="${d.prev ? `#/runs/${d.prev.id}` : "#"}">${ICON.left} ก่อนหน้า</a>
        <a class="${d.next ? "" : "off"}" href="${d.next ? `#/runs/${d.next.id}` : "#"}">ถัดไป ${ICON.right}</a>
      </div>
    </div>
    <div class="grid">
      <section class="span-12"><div class="stat-row run-stats">
        ${stat("ระยะทาง", kmFixed(r.distance_km, 2), "km", "accent")}
        ${stat("เพซเฉลี่ย", pace(r.avg_pace_s), "/km")}
        ${stat("เวลาเคลื่อนที่", duration(r.moving_time_s), "", "", r.elapsed_time_s && r.elapsed_time_s !== r.moving_time_s ? `รวม ${duration(r.elapsed_time_s)}` : "")}
        ${r.avg_hr ? stat("HR เฉลี่ย", r.avg_hr, "bpm", "hr") : ""}
        ${r.max_hr ? stat("HR สูงสุด", r.max_hr, "bpm", "hr") : ""}
        ${cadence ? stat(cadExact ? "รอบขา" : "รอบขา (ประมาณ)", cadence, "spm", "cad", cadExact ? `เฉพาะช่วงวิ่ง${r.stride_m ? ` · ก้าวละ ${r.stride_m.toFixed(2)} m` : ""}` : "") : ""}
        ${r.calories ? stat("แคลอรี", r.calories, "kcal") : ""}
        ${r.steps ? stat("ก้าว", r.steps.toLocaleString("th-TH")) : ""}
        ${r.temp_c != null && !r.indoor ? stat("อากาศ", Math.round(r.temp_c), "°C", "", r.humidity ? `ความชื้น ${r.humidity}%` : "") : ""}
      </div>
      ${r.power_w || r.gct_ms ? `<div class="dyn"><div class="eyebrow">ฟอร์มการวิ่ง (Apple Watch)</div><div class="stat-row run-stats" style="margin-top:8px">
        ${r.power_w ? stat("กำลัง", Math.round(r.power_w), "W") : ""}
        ${r.stride_m ? stat("ความยาวก้าว", r.stride_m.toFixed(2), "m") : ""}
        ${r.gct_ms ? stat("เวลาเท้าแตะพื้น", Math.round(r.gct_ms), "ms") : ""}
        ${r.vert_osc_cm ? stat("การเด้งตัว", r.vert_osc_cm.toFixed(1), "cm") : ""}
      </div></div>` : ""}
      ${r.indoor ? `<p class="small muted" style="margin-top:10px">วิ่งบนลู่ — ระยะและเพซมาจากการประมาณของนาฬิกา อาจคลาดจากหน้าจอลู่วิ่ง ±5–10%</p>` : ""}
      </section>
      <section class="card span-12"><div class="card-head"><h2>${ICON.heart} เวลาในแต่ละโซนหัวใจ</h2><a class="link" href="#/zones">โซนคืออะไร →</a></div>${zoneTable(d.zone_time, d.zones)}</section>
      <section class="card span-6"><div class="card-head"><h2>Splits รายกิโล</h2></div>${splits}</section>
      <section class="card span-6"><div class="card-head"><h2>เพซ vs หัวใจ</h2>
        <div class="legend"><span><i class="l-easy"></i>เพซ</span><span><i class="l-hard"></i>HR</span></div></div>
        ${d.splits.length > 1 ? slot(paceHrChart(d.splits, cap)) : `<div class="empty">ข้อมูลไม่พอ</div>`}
        ${r.notes ? `<div class="prose">${md(r.notes)}</div>` : ""}
      </section>
      ${d.points?.d?.length > 2 ? `<section class="card span-12"><div class="card-head"><h2>ตลอดเส้นทาง</h2>
          <div class="legend"><span><i class="l-easy"></i>เพซ (/km)</span><span><i class="l-hard"></i>HR (bpm)</span></div></div>
          ${d.points.v ? slot(streamChart(d.points, "pace", cap)) : ""}
          ${d.points.hr ? `<div style="height:10px"></div>${slot(streamChart(d.points, "hr", cap))}` : ""}
          ${d.points.cad ? `<div class="legend" style="margin-top:14px"><span><i class="l-cad"></i>รอบขา (spm)</span><span><i class="l-band"></i>ช่วงแนะนำตอนวิ่ง ${CAD_BAND[0]}–${CAD_BAND[1]}</span></div>${slot(streamChart(d.points, "cad", cap))}
            <p class="small muted" style="margin-top:6px">ช่วงที่ต่ำกว่า ${CAD_RUN} คือเดินหรือหยุด — ดูเฉพาะช่วงวิ่ง</p>` : ""}
        </section>` : ""}
      ${analysis || `<section class="card span-12 pending-note">${ICON.coach}<div><b>ยังไม่มีบทวิเคราะห์</b><p>บอก Claude ว่า “วิเคราะห์รอบล่าสุด” แล้วโน้ตกับแผนที่ปรับจะขึ้นที่นี่</p></div></section>`}
      ${d.planned ? `<section class="card span-12"><div class="card-head"><h2>${ICON.cal} เทียบกับแผน</h2></div>${workoutRow(d.planned, r.run_date)}</section>` : ""}
    </div>
  </div>`;
}

function phaseCards(phases, today) {
  return `<div class="phases">${phases.map((ph, i) => {
    const cur = today >= ph.start_date && today <= ph.end_date, past = today > ph.end_date;
    return `<div class="phase ${cur ? "current" : ""} ${past ? "past" : ""}">
      ${cur ? `<span class="badge-now">ตอนนี้</span>` : ""}
      <div class="pn">PHASE ${i + 1}</div><h3>${esc(ph.name)}</h3>
      <div class="pd">${dShort(ph.start_date)} – ${dMed(ph.end_date)}</div>
      ${ph.subtitle ? `<div class="pf" style="margin-top:6px;color:var(--ink)">${esc(ph.subtitle)}</div>` : ""}
      <div class="pf">${esc(ph.focus || "")}</div>
      <div class="pk">
        ${ph.runs_per_week ? `<span class="tag">${esc(ph.runs_per_week)} ครั้ง/สัปดาห์</span>` : ""}
        ${ph.weekly_km_from ? `<span class="tag">${ph.weekly_km_from}–${ph.weekly_km_to} km/สัปดาห์</span>` : ""}
        ${ph.long_run_km_from ? `<span class="tag">Long ${ph.long_run_km_from}–${ph.long_run_km_to} km</span>` : ""}
      </div>
    </div>`;
  }).join("")}</div>`;
}

function renderPlan(d) {
  const p = d.profile, today = d.today;
  const planStart = d.phases[0]?.start_date ?? d.week_start;
  const ci = d.phases.findIndex((ph) => today >= ph.start_date && today <= ph.end_date), cp = d.phases[ci];
  const phaseNow = cp ? `<div class="phase-now">
    <div><div class="pn">ตอนนี้ · PHASE ${ci + 1} / ${d.phases.length}</div><h3>${esc(cp.name)}</h3><div class="pd">${dShort(cp.start_date)} – ${dMed(cp.end_date)}${cp.subtitle ? ` · ${esc(cp.subtitle)}` : ""}</div></div>
    <div class="pk">
      ${cp.runs_per_week ? `<span class="tag">${esc(cp.runs_per_week)} ครั้ง/สัปดาห์</span>` : ""}
      ${cp.weekly_km_from ? `<span class="tag">${cp.weekly_km_from}–${cp.weekly_km_to} km/สัปดาห์</span>` : ""}
      ${cp.long_run_km_from ? `<span class="tag">Long ${cp.long_run_km_from}–${cp.long_run_km_to} km</span>` : ""}
    </div>
    <a class="link" href="#/goal">ดูเส้นทางทั้งหมด →</a></div>` : "";

  // group workouts + actual runs by week
  const weeks = new Map();
  const ensure = (ws) => { if (!weeks.has(ws)) weeks.set(ws, { ws, items: [], runs: [] }); return weeks.get(ws); };
  for (const w of d.workouts) ensure(weekStart(w.workout_date)).items.push(w);
  for (const r of d.runs) if (r.run_date >= planStart) ensure(weekStart(r.run_date)).runs.push(r);
  const linked = new Set(d.workouts.map((w) => w.run_id).filter(Boolean));
  const runById = new Map(d.runs.map((r) => [r.id, r]));
  const weekNo = (ws) => Math.floor((toD(ws) - toD(weekStart(planStart))) / (7 * 86400000)) + 1;

  const block = (wk) => {
    const plannedKm = wk.items.filter((x) => RUN_KINDS.has(x.kind)).reduce((s, x) => s + (x.target_km || 0), 0);
    const actualKm = wk.runs.reduce((s, x) => s + x.distance_km, 0);
    const extra = wk.runs.filter((r) => !linked.has(r.id));
    const rows = [
      ...wk.items.map((w) => ({ date: w.workout_date, html: workoutRow(w, today, {
        actual: w.run_id && runById.get(w.run_id) ? (() => { const r = runById.get(w.run_id); return `<div class="actual">${ICON.check.replace("<svg", '<svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:3"')} <a href="#/runs/${r.id}">วิ่งจริง ${kmFixed(r.distance_km, 2)} km · ${pace(r.avg_pace_s)}/km${r.avg_hr ? ` · HR ${r.avg_hr}` : ""}</a></div>`; })() : "",
      }) })),
      ...extra.map((r) => ({ date: r.run_date, html: `<div class="workout done"><div class="wdate ${r.run_date === today ? "today" : ""}"><div class="d">${toD(r.run_date).getUTCDate()}</div><div class="m">${dWeekday(r.run_date)}</div></div>
        <div class="wbody"><div class="wtitle">${esc(r.title || "Run")} <span class="chip s-done">บันทึกแล้ว</span></div>
        <div class="actual"><a href="#/runs/${r.id}">${kmFixed(r.distance_km, 2)} km · ${pace(r.avg_pace_s)}/km${r.avg_hr ? ` · HR ${r.avg_hr}` : ""}</a></div></div></div>` })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const cur = wk.ws === d.week_start;
    return `<section class="card week-block ${cur ? "current" : ""}">
      <div class="wb-head"><h3>สัปดาห์ที่ ${weekNo(wk.ws)} · ${dShort(wk.ws)} – ${dShort(addDays(wk.ws, 6))} ${cur ? `<span class="chip s-done" style="margin-left:6px">สัปดาห์นี้</span>` : ""}</h3>
        <div class="week-meter">${wk.ws <= d.week_start ? `วิ่งแล้ว <b>${kmFixed(actualKm)}</b> / ` : "เป้า "}<b>${kmFixed(plannedKm)}</b> km</div></div>
      ${rows.map((r) => r.html).join("")}
    </section>`;
  };
  const all = [...weeks.values()].sort((a, b) => a.ws.localeCompare(b.ws));
  const upcoming = all.filter((w) => w.ws >= d.week_start);
  const past = all.filter((w) => w.ws < d.week_start).reverse();

  app.innerHTML = `<div class="view">
    ${subnav("plan", "#/plan")}
    <div class="page-head"><div><h1>แผนซ้อม</h1>
      <p>${esc(p.goal_race_name || "")}${p.goal_race_date ? ` · ${dLong(p.goal_race_date)}` : ""}</p></div></div>
    ${phaseNow}
    <div class="grid" style="margin-top:8px">
      <div class="span-7">
        <h2 class="section-title">สัปดาห์นี้และถัดไป</h2>
        <p class="section-sub">แผนละเอียดล่วงหน้าราว 4 สัปดาห์ จะปรับทุกครั้งที่ส่งผลวิ่งเข้ามา</p>
        ${upcoming.map(block).join("") || `<div class="card empty">ยังไม่มีแผน</div>`}
        ${past.length ? `<h2 class="section-title">สัปดาห์ที่ผ่านมา</h2>${past.map(block).join("")}` : ""}
      </div>
      <div class="span-5">
        <h2 class="section-title">บันทึกการปรับแผน</h2><p class="section-sub">ทุกครั้งที่แผนเปลี่ยน จะบอกเหตุผลไว้ที่นี่</p>
        <section class="card">${d.changes.length ? `<ul class="changes">${d.changes.map((c) => `<li><div class="cd">${dMed(c.changed_on)}</div><div class="ct">${esc(c.title)}</div>${c.reason ? `<div class="cr">${esc(c.reason)}</div>` : ""}</li>`).join("")}</ul>` : `<div class="empty">ยังไม่มีการปรับแผน</div>`}</section>
      </div>
    </div>
  </div>`;
}

let notesFilter = "all";
const NOTE_GROUPS = [["all", "ทั้งหมด", null], ["day", "เช็ครายวัน", ["day"]], ["run", "การวิ่ง", ["run"]], ["workout", "เวท", ["workout"]], ["sleep", "การนอน", ["sleep"]], ["week", "สรุปสัปดาห์ & แผน", ["week", "plan"]]];
function renderNotes({ notes: list, zones, coach_name }) {
  const scopeLabel = { run: "วิเคราะห์การวิ่ง", week: "สรุปสัปดาห์", plan: "แผนซ้อม", sleep: "การนอน", day: "เช็คร่างกายรายวัน", workout: "วิเคราะห์เวท" };
  const groups = NOTE_GROUPS.filter(([, , scopes]) => !scopes || list.some((a) => scopes.includes(a.scope)));
  const card = (a) => `<section class="card coach">
      <div class="card-head"><h3>${esc(scopeLabel[a.scope] || a.scope)} · ${a.run_date ? dMed(a.run_date) : a.workout_date ? dMed(a.workout_date) : a.for_date ? dMed(a.for_date) : a.week_start ? `สัปดาห์ ${dShort(a.week_start)}` : dMed(a.created_at.slice(0, 10))}</h3>
        ${a.run_id ? `<a class="link" href="#/runs/${a.run_id}">ดูการวิ่ง →</a>` : a.workout_id ? `<a class="link" href="#/strength/${a.workout_id}">ดูบันทึกเวท →</a>` : a.scope === "sleep" ? `<a class="link" href="#/sleep">ดูการนอน →</a>` : a.scope === "day" ? `<a class="link" href="#/health">ดูการฟื้นตัว →</a>` : ""}</div>
      <h2 style="font-size:20px;margin-bottom:6px">${esc(a.title)}</h2>
      ${a.verdict ? `<div class="verdict" style="font-size:16px;color:var(--ink-2);font-weight:500">${esc(a.verdict)}</div>` : ""}
      ${a.zone_time ? zoneSummary(a.zone_time, zones) : ""}
      <div class="note-cols">
        ${a.highlights?.length ? `<div><h4>จุดดี</h4><ul class="bullets">${a.highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${a.watchouts?.length ? `<div><h4>ต้องระวัง</h4><ul class="bullets warn">${a.watchouts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${a.next_steps?.length ? `<div><h4>ต่อไป</h4><ul class="bullets next">${a.next_steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      </div>
      ${a.body_md ? `<div class="prose">${md(a.body_md)}</div>` : ""}
    </section>`;
  const draw = () => {
    if (!groups.some(([k]) => k === notesFilter)) notesFilter = "all";
    const scopes = groups.find(([k]) => k === notesFilter)[2];
    const shown = scopes ? list.filter((a) => scopes.includes(a.scope)) : list;
    app.innerHTML = `<div class="view">
    <div class="page-head"><div><h1>โค้ชโน้ต</h1><p>บทวิเคราะห์จาก${esc(coachLabel(coach_name))} ทุกครั้งที่ส่งข้อมูลเข้ามา</p></div></div>
    <nav class="subnav" aria-label="กรองโน้ต">${groups.map(([k, label, sc]) => `<a href="#/notes" data-nf="${k}" class="${k === notesFilter ? "on" : ""}">${label} <span style="opacity:.6">${sc ? list.filter((a) => sc.includes(a.scope)).length : list.length}</span></a>`).join("")}</nav>
    <div class="run-list">${shown.length ? shown.map(card).join("") : `<div class="card empty">ยังไม่มีโน้ต</div>`}</div>
  </div>`;
    app.querySelectorAll("[data-nf]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); notesFilter = b.dataset.nf; draw(); window.scrollTo({ top: 0 }); }));
  };
  draw();
}

// ---------- strength workouts (log + progress) ----------
const TOKEN_KEY = "rj_token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };
const EX_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
const exName = (id) => (EX_BY_ID[id] ? EX_BY_ID[id].name : String(id).replace(/^custom:/, ""));
const exTh = (id) => EX_BY_ID[id]?.th || "";
const isTimed = (id) => EX_BY_ID[id]?.unit === "secs";
const bkkNow = () => new Date(Date.now() + 7 * 3600e3).toISOString();
const kg = (n) => (n == null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

async function send(method, path, body) {
  const res = await fetch(path, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(""); throw new Error("รหัสบันทึกไม่ถูกต้อง ใส่ใหม่อีกครั้งนะคะ"); }
  if (!res.ok || data.ok === false) throw new Error(data.message || `บันทึกไม่สำเร็จ (${res.status})`);
  return data;
}

/** "12 กก. × 12 · 12 · 10" / "30 · 30 · 25 วิ" / "15 · 15 ครั้ง" */
function setSummary(sets) {
  if (!sets.length) return "";
  if (sets.some((s) => s.secs)) return `${sets.map((s) => s.secs || 0).join(" · ")} วิ`;
  const ws = [...new Set(sets.map((s) => s.weight_kg || 0))];
  if (ws.length === 1) return ws[0] ? `${kg(ws[0])} กก. × ${sets.map((s) => s.reps).join(" · ")}` : `${sets.map((s) => s.reps).join(" · ")} ครั้ง`;
  return sets.map((s) => (s.weight_kg ? `${kg(s.weight_kg)}×${s.reps}` : `${s.reps}`)).join(" · ");
}

/** Per exercise, one point per workout (its best set), oldest first, with PR flags. */
function exerciseHistory(workouts) {
  const by = new Map();
  const sorted = [...workouts].sort((a, b) => (a.workout_date + (a.start_time || "") + a.id).localeCompare(b.workout_date + (b.start_time || "") + b.id));
  for (const w of sorted) {
    const groups = new Map();
    for (const s of w.sets) (groups.get(s.exercise) ?? groups.set(s.exercise, []).get(s.exercise)).push(s);
    for (const [ex, sets] of groups) {
      const timed = sets.some((s) => s.secs);
      const weighted = !timed && sets.some((s) => s.weight_kg > 0);
      const kind = timed ? "secs" : weighted ? "weight" : "reps";
      const metric = timed ? Math.max(...sets.map((s) => s.secs || 0))
        : weighted ? Math.max(...sets.map((s) => (s.weight_kg || 0) * (1 + (s.reps || 0) / 30)))
        : Math.max(...sets.map((s) => s.reps || 0));
      const volume = timed ? sets.reduce((t, s) => t + (s.secs || 0), 0)
        : weighted ? sets.reduce((t, s) => t + (s.weight_kg || 0) * (s.reps || 0), 0)
        : sets.reduce((t, s) => t + (s.reps || 0), 0);
      const topW = weighted ? Math.max(...sets.map((s) => s.weight_kg || 0)) : null;
      const list = by.get(ex) ?? by.set(ex, []).get(ex);
      const prev = list.filter((p) => p.kind === kind);
      const pr = prev.length > 0 && metric > Math.max(...prev.map((p) => p.metric)) + 1e-9;
      list.push({ date: w.workout_date, id: w.id, kind, metric, volume, topW, sets, pr });
    }
  }
  return by;
}
const metricText = (p) => (p.kind === "secs" ? `${p.metric} วิ` : p.kind === "weight" ? `${kg(Math.round(p.metric * 10) / 10)} กก.` : `${p.metric} ครั้ง`);
const metricLabel = (k) => (k === "secs" ? "ค้างนานสุด" : k === "weight" ? "แรงสูงสุดโดยประมาณ (1RM)" : "ครั้งมากสุดใน 1 เซ็ต");

function sparkline(points) {
  if (points.length < 2) return "";
  const W = 300, H = 64, p = 6;
  const vs = points.map((x) => x.metric), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const xy = points.map((x, i) => [p + (i / (points.length - 1)) * (W - 2 * p), H - p - ((x.metric - lo) / span) * (H - 2 * p)]);
  return `<svg class="wk-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${xy.map((q) => q.join(",")).join(" ")}" />
    ${xy.map((q, i) => `<circle cx="${q[0]}" cy="${q[1]}" r="${points[i].pr ? 4.5 : 3}" class="${points[i].pr ? "pr" : ""}"/>`).join("")}
  </svg>`;
}

/** เวท › บันทึก (history + start buttons) and เวท › พัฒนาการ (per-exercise progress). */
function renderStrength({ workouts }, tab = "log") {
  const hist = exerciseHistory(workouts);
  const since = new Date(Date.now() + 7 * 3600e3 - 27 * 86400e3).toISOString().slice(0, 10);
  const recent = workouts.filter((w) => w.workout_date >= since);
  const prCount = [...hist.values()].flat().filter((p) => p.pr && p.date >= since).length;
  const sets28 = recent.reduce((t, w) => t + w.sets.length, 0);
  const exCards = [...hist.entries()].sort((a, b) => b[1][b[1].length - 1].date.localeCompare(a[1][a[1].length - 1].date)).map(([ex, pts]) => {
    const last = pts[pts.length - 1];
    const same = pts.filter((p) => p.kind === last.kind);
    const best = same.reduce((b, p) => (p.metric > b.metric ? p : b), same[0]);
    const firstP = same[0];
    const change = same.length > 1 && firstP.metric > 0 ? Math.round(((last.metric - firstP.metric) / firstP.metric) * 100) : null;
    return `<section class="card wk-ex">
      <div class="wk-ex-head"><div><h3>${esc(exName(ex))}</h3><div class="small muted">${esc(exTh(ex))}</div></div>
        ${last.pr ? `<span class="wk-pr">สถิติใหม่!</span>` : ""}</div>
      <div class="wk-ex-nums">
        <div><div class="label">ล่าสุด · ${dShort(last.date)}</div><div class="v">${esc(setSummary(last.sets))}</div></div>
        <div><div class="label">${metricLabel(best.kind)}</div><div class="v">${metricText(best)}</div></div>
        ${change != null ? `<div><div class="label">ตั้งแต่ครั้งแรก</div><div class="v ${change > 0 ? "up" : change < 0 ? "down" : ""}">${change > 0 ? "+" : ""}${change}%</div></div>` : ""}
      </div>
      ${sparkline(same.slice(-12))}
    </section>`;
  }).join("");
  const list = workouts.map((w) => {
    const nEx = new Set(w.sets.map((s) => s.exercise)).size;
    const vol = w.sets.reduce((t, s) => t + (s.weight_kg || 0) * (s.reps || 0), 0);
    const prs = [...hist.values()].flat().filter((p) => p.id === w.id && p.pr).length;
    return `<a class="card wk-row" href="#/strength/${w.id}">
      <div class="wk-date"><b>${dShort(w.workout_date)}</b><span>${dWeekday(w.workout_date)}</span></div>
      <div class="wk-main"><div class="wtitle">${esc(w.title || "เวท")} ${w.watch_secs ? `<span class="chip">⌚ Watch</span>` : ""} ${prs ? `<span class="wk-pr">PR ${prs}</span>` : ""}</div>
        <div class="small muted">${nEx ? `${nEx} ท่า · ${w.sets.length} เซ็ต` : "ยังไม่ได้กรอกท่า"}${vol ? ` · รวม ${Math.round(vol).toLocaleString()} กก.` : ""}${w.duration_min ? ` · ${w.duration_min} นาที` : ""}${w.avg_hr ? ` · HR ${w.avg_hr}` : ""}${w.rpe ? ` · RPE ${w.rpe}` : ""}</div></div>
      ${ICON.right}
    </a>`;
  }).join("");
  const stats = `<div class="stat-row run-stats">
      <div class="stat"><div class="label">4 สัปดาห์ล่าสุด</div><div class="value">${recent.length}<small>ครั้ง</small></div><div class="foot">เฉลี่ย ${(recent.length / 4).toFixed(1)} ครั้ง/สัปดาห์</div></div>
      <div class="stat"><div class="label">เซ็ตทั้งหมด (4 สัปดาห์)</div><div class="value">${sets28}<small>เซ็ต</small></div></div>
      <div class="stat"><div class="label">สถิติใหม่ (4 สัปดาห์)</div><div class="value">${prCount}<small>ครั้ง</small></div></div>
    </div>`;
  const none = `<div class="card empty">ยังไม่มีบันทึกเวทเลยค่ะ กด “เริ่มเล่นเวท” หรือกดจากการ์ดวันเวทในแผนซ้อม ระบบจะดึงท่าจากแผนมาให้เอง</div>`;
  const startBtns = `<div class="head-btns"><a class="btn-primary" href="#/strength/go/new">${ICON.dumbbell} เริ่มเล่นเวท</a><a class="btn-ghost" href="#/strength/new">กรอกย้อนหลัง</a></div>`;
  app.innerHTML = tab === "progress"
    ? `<div class="view">
    ${subnav("strength", "#/strength/progress")}
    <div class="page-head"><div><h1>พัฒนาการรายท่า</h1><p>แต่ละท่าแข็งแรงขึ้นแค่ไหน เทียบกับครั้งแรกและสถิติดีสุด</p></div></div>
    ${stats}
    ${workouts.length ? `<div class="wk-ex-grid" style="margin-top:14px">${exCards || `<div class="card empty">กรอกท่าและเซ็ตแล้ว กราฟจะขึ้นตรงนี้ค่ะ</div>`}</div>` : none}
  </div>`
    : `<div class="view">
    ${subnav("strength", "#/strength")}
    <div class="page-head"><div><h1>บันทึกเวท & ออกกำลังกาย</h1><p>เวท ยืดเหยียด เดิน — ทุกครั้งที่บันทึกนับเป็นวันออกกำลังกาย</p></div>
      ${startBtns}</div>
    ${workouts.length ? `<div class="run-list">${list}</div>` : none}
  </div>`;
}

// ---------- heart-rate session linked to a strength log ----------
const HR_SRC = { watch: "Apple Watch", daily: "ข้อมูลหัวใจรายวัน", export: "Apple Health export" };
const SPORT_TH = { FunctionalStrengthTraining: "Functional Strength", TraditionalStrengthTraining: "Strength", Walking: "เดิน", Cycling: "ปั่น", Rowing: "พาย", Yoga: "โยคะ", HighIntensityIntervalTraining: "HIIT", Elliptical: "Elliptical" };
const bkkClock = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(11, 16);
const bkkDay = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);

/** Seconds per zone from the [[offsetMin, bpm]] series (gaps over 2 min are not counted). */
function hrZoneSecs(hr, zones) {
  const secs = [0, 0, 0, 0, 0];
  for (let i = 0; i < hr.length - 1; i++) {
    const dt = (hr[i + 1][0] - hr[i][0]) * 60;
    if (dt > 0 && dt <= 120) secs[zoneIdx(hr[i][1], zones)] += dt;
  }
  return secs;
}

function hrSessionChart(hr, zones) {
  if (!hr?.length || hr.length < 2) return "";
  const W = 600, H = 150, pl = 30, pr = 6, pt = 8, pb = 20;
  const t1 = hr[hr.length - 1][0] || 1, vs = hr.map((p) => p[1]);
  const lo = Math.min(90, Math.floor(Math.min(...vs) / 10) * 10), hi = Math.max(zones[3].lo + 5, Math.ceil(Math.max(...vs) / 10) * 10);
  const x = (t) => pl + (t / t1) * (W - pl - pr), y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let bands = "";
  zones.forEach((z, i) => {
    const a = Math.max(lo, z.lo), b = Math.min(hi, z.hi == null ? hi : z.hi + 1);
    if (b > a) bands += `<rect x="${pl}" y="${y(b)}" width="${W - pl - pr}" height="${y(a) - y(b)}" fill="var(--z${i + 1})" opacity=".09"/>`;
  });
  const ticks = [lo, Math.round((lo + hi) / 2 / 10) * 10, hi].map((v) => `<text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");
  const mins = Array.from({ length: Math.floor(t1 / 10) + 1 }, (_, i) => i * 10).map((m) => `<text x="${x(m)}" y="${H - 4}" text-anchor="middle">${m}'</text>`).join("");
  return `<svg class="hr-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="กราฟหัวใจระหว่างเล่น">${bands}
    <polyline points="${hr.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}" />${ticks}${mins}</svg>`;
}

function hrSessionRow(s, w) {
  const mine = s.key === `s:${w.hr_session_id}`;
  const busy = s.workout && s.workout.id !== w.id;
  return `<div class="hrs-row ${mine ? "mine" : ""} ${s.run_id ? "isrun" : ""}">
    <div class="hrs-time"><b>${bkkClock(s.start_ms)}–${bkkClock(s.start_ms + s.secs * 1000)}</b><span>${dShort(bkkDay(s.start_ms))} · ${Math.round(s.secs / 60)} นาที</span></div>
    <div class="hrs-main">${s.avg_hr ? `HR ${s.avg_hr}${s.max_hr ? ` / ${s.max_hr}` : ""}` : "ไม่มี HR"}${s.kcal ? ` · ${s.kcal} kcal` : ""}
      <small>${esc(HR_SRC[s.source] || s.source)}${s.sport ? ` · ${esc(SPORT_TH[s.sport] || s.sport)}` : ""}${s.has_hr ? " · มีกราฟ" : ""}${s.run_id ? " · เป็นการวิ่ง" : ""}${busy ? ` · ผูกกับ “${esc(s.workout.title || "เวท")}” ${dShort(s.workout.date)}` : ""}</small></div>
    ${mine ? `<span class="chip s-done">ผูกอยู่</span>` : `<button class="btn-ghost" data-link="${esc(s.key)}">${busy ? "ย้ายมา" : "ผูก"}</button>`}
  </div>`;
}

/** Card on the workout page: the linked session (chart + zones) and a picker for any day's sessions. */
function wireHrCard(w, zones) {
  const card = app.querySelector("[data-hrcard]");
  if (!card) return;
  let day = w.workout_date, open = false, list = null, msg = "";
  const startMs = w.start_time ? Date.parse(`${w.workout_date}T${w.start_time}:00+07:00`) : null;
  const link = async (key) => {
    if (!getToken()) { msg = "ใส่รหัสบันทึกที่หน้าตั้งค่าก่อนนะคะ"; return paint(); }
    msg = "กำลังผูก…"; paint();
    try { await send("POST", `/api/workouts/${w.id}/hr`, { key }); router(); }
    catch (err) { msg = err.message; paint(); }
  };
  const load = async () => {
    list = null; paint();
    try { list = (await api(`/api/hr-sessions?date=${day}&days=1`)).sessions; } catch (err) { list = []; msg = err.message; }
    paint();
  };
  const suggestion = () => {
    if (w.hr_session_id || !list || !startMs) return null;
    return list.filter((s) => !s.run_id && !s.workout && Math.abs(s.start_ms - startMs) < 120 * 60000)
      .sort((a, b) => Math.abs(a.start_ms - startMs) - Math.abs(b.start_ms - startMs))[0] || null;
  };
  const paint = () => {
    const linked = w.avg_hr || w.watch_secs;
    const zs = w.hr?.length > 1 ? hrZoneSecs(w.hr, zones) : null, zt = zs ? zs.reduce((a, b) => a + b, 0) : 0;
    const sug = suggestion();
    card.innerHTML = `<div class="card-head"><h2>${ICON.heart} หัวใจระหว่างเล่น</h2>
        ${linked ? `<button class="btn-ghost" data-pick>${open ? "ปิด" : "เปลี่ยน session"}</button>` : ""}</div>
      ${linked ? `<div class="hrs-stats">
          ${w.watch_start_ms ? `<div><span>เริ่ม</span><b>${bkkClock(w.watch_start_ms)}</b></div>` : ""}
          ${w.watch_secs ? `<div><span>นาน</span><b>${Math.round(w.watch_secs / 60)} นาที</b></div>` : ""}
          ${w.avg_hr ? `<div><span>HR เฉลี่ย</span><b>${w.avg_hr}</b></div>` : ""}${w.max_hr ? `<div><span>สูงสุด</span><b>${w.max_hr}</b></div>` : ""}
          ${w.calories ? `<div><span>แคลอรี</span><b>${w.calories}</b></div>` : ""}</div>
        ${hrSessionChart(w.hr, zones)}
        ${zt ? `<div class="zbar thin">${zs.map((v, i) => (v ? `<i style="width:${(v / zt) * 100}%;background:var(--z${i + 1})" title="Z${i + 1} ${Math.round(v / 60)} นาที"></i>` : "")).join("")}</div>
          <div class="hrs-zones">${zs.map((v, i) => (v >= 30 ? `<span><i style="background:var(--z${i + 1})"></i>Z${i + 1} ${Math.round(v / 60)}′</span>` : "")).join("")}</div>` : ""}`
      : `<p class="muted small">ยังไม่ได้ผูกข้อมูลหัวใจ เลือก session ที่ Apple Watch บันทึกไว้ตอนเล่น (เวลา HR แคลอรี จะมาอยู่ในบันทึกนี้)</p>
        ${sug ? `<div class="hrs-sug"><span>น่าจะเป็นอันนี้:</span>${hrSessionRow(sug, w)}</div>` : ""}
        ${open ? "" : `<button class="btn-ghost" data-pick>เลือก session จาก Apple Health</button>`}`}
      ${open ? `<div class="hrs-pick">
          <div class="hrs-nav"><button class="btn-ghost" data-day="-3">‹</button><span>${dShort(bkkDay(Date.parse(`${day}T00:00:00+07:00`) - 86400e3))} – ${dShort(bkkDay(Date.parse(`${day}T00:00:00+07:00`) + 86400e3))}</span><button class="btn-ghost" data-day="3">›</button></div>
          ${list == null ? `<div class="loading small"><span></span><span></span><span></span></div>`
            : list.filter((s) => !s.run_id).length ? list.filter((s) => !s.run_id).map((s) => hrSessionRow(s, w)).join("")
            : `<p class="muted small">ไม่มี session ในช่วงนี้ (นับเฉพาะที่กดเริ่ม workout บน Apple Watch · ข้อมูลรายวันเข้าทุกเช้า)</p>`}
          ${w.hr_session_id || linked ? `<button class="link small hrs-unlink" data-unlink>ยกเลิกการผูกข้อมูลหัวใจ</button>` : ""}
        </div>` : ""}
      ${msg ? `<p class="small" style="color:var(--amber)">${esc(msg)}</p>` : ""}`;
    card.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => { open = !open; msg = ""; if (open && !list) load(); else paint(); }));
    card.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => {
      day = bkkDay(Date.parse(`${day}T00:00:00+07:00`) + Number(b.dataset.day) * 86400e3); load();
    }));
    card.querySelectorAll("[data-link]").forEach((b) => b.addEventListener("click", () => link(b.dataset.link)));
    card.querySelector("[data-unlink]")?.addEventListener("click", () => { if (confirm("ยกเลิกการผูกข้อมูลหัวใจของบันทึกนี้?")) link(null); });
  };
  paint();
  if (!w.avg_hr && !w.watch_secs) load(); // look for a likely match straight away
}

function renderWorkoutView(d, all) {
  const w = d.workout;
  const hist = exerciseHistory(all.workouts);
  const groups = [];
  for (const s of d.sets) {
    let g = groups.find((x) => x.ex === s.exercise);
    if (!g) groups.push((g = { ex: s.exercise, sets: [] }));
    g.sets.push(s);
  }
  const n = d.note;
  app.innerHTML = `<div class="view">
    <a class="back" href="#/strength">${ICON.left} บันทึกเวท</a>
    <div class="page-head"><div><div class="eyebrow">${dLong(w.workout_date)}${w.start_time ? ` · ${w.start_time}` : ""}</div><h1>${esc(w.title || "เวท")}</h1>
      ${d.planned ? `<p>ตามแผน: ${esc(d.planned.title)}</p>` : ""}</div>
      <div class="head-btns"><a class="btn-primary" href="#/strength/go/w${w.id}">+ เพิ่มเซ็ต</a><a class="btn-ghost" href="#/strength/${w.id}/edit">แก้ไข</a><button class="btn-ghost" data-del>ลบ</button></div></div>
    <div class="stat-row run-stats">
      ${w.duration_min ? `<div class="stat"><div class="label">เวลา</div><div class="value">${w.duration_min}<small>นาที</small></div></div>` : ""}
      ${w.rpe ? `<div class="stat"><div class="label">RPE</div><div class="value">${w.rpe}<small>/10</small></div></div>` : ""}
    </div>
    ${n ? `<section class="card coach"><div class="card-head"><h2>${ICON.coach} ${esc(coachLabel(lastDash?.profile?.coach_name || "แพร"))}</h2></div>
      <div class="verdict">${esc(n.verdict || n.title)}</div>
      ${n.next_steps?.length ? `<ul class="bullets next">${n.next_steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${n.body_md ? `<div class="prose">${md(n.body_md)}</div>` : ""}</section>` : ""}
    <div class="run-list">${groups.length ? groups.map((g) => {
      const p = hist.get(g.ex)?.find((x) => x.id === w.id);
      return `<section class="card wk-ex"><div class="wk-ex-head"><div><h3>${esc(exName(g.ex))}</h3><div class="small muted">${esc(exTh(g.ex))}</div></div>
        ${p?.pr ? `<span class="wk-pr">สถิติใหม่!</span>` : ""}</div>
        <table class="wk-sets"><tr><th>เซ็ต</th><th>${g.sets.some((s) => s.secs) ? "วินาที" : "น้ำหนัก × ครั้ง"}</th></tr>
        ${g.sets.map((s, i) => `<tr><td>${i + 1}</td><td>${s.secs ? `${s.secs} วิ` : `${s.weight_kg ? `${kg(s.weight_kg)} กก. × ` : ""}${s.reps} ครั้ง`}</td></tr>`).join("")}</table></section>`;
    }).join("") : `<div class="card empty">ยังไม่ได้กรอกท่าและเซ็ตของรอบนี้ <a class="link" href="#/strength/${w.id}/edit">กรอกเลย →</a></div>`}</div>
    ${w.notes ? `<section class="card"><h3>โน้ต</h3><p class="muted">${esc(w.notes)}</p></section>` : ""}
    <section class="card wk-hr" data-hrcard></section>
  </div>`;
  wireHrCard(w, d.zones);
  app.querySelector("[data-del]").addEventListener("click", async (e) => {
    if (!confirm("ลบบันทึกเวทนี้? ลบแล้วกู้คืนไม่ได้")) return;
    try { await send("DELETE", `/api/workouts/${w.id}`); location.hash = "#/strength"; }
    catch (err) { alert(err.message); }
  });
}

/** Log / edit form. opts: {existing: {workout, sets}, plan: planned row, all: {workouts}} */
function renderWorkoutForm({ existing, plan, all, preset }) {
  const hist = exerciseHistory(all.workouts);
  const lastOf = (ex) => (hist.get(ex) || []).filter((p) => p.id !== existing?.workout?.id).pop();
  const w0 = existing?.workout;
  const st = {
    id: w0?.id ?? null,
    date: w0?.workout_date ?? plan?.workout_date ?? bkkNow().slice(0, 10),
    time: w0?.start_time ?? bkkNow().slice(11, 16),
    kind: w0?.kind ?? preset?.kind ?? "strength",
    title: w0?.title ?? plan?.title ?? preset?.title ?? "เวท",
    duration: w0?.duration_min ?? plan?.target_min ?? preset?.duration ?? "",
    rpe: w0?.rpe ?? "",
    notes: w0?.notes ?? "",
    planned_id: w0?.planned_id ?? plan?.id ?? null,
    blocks: [],
  };
  if (existing?.sets?.length) {
    for (const s of existing.sets) {
      let b = st.blocks.find((x) => x.ex === s.exercise);
      if (!b) st.blocks.push((b = { ex: s.exercise, target: "", rows: [] }));
      b.rows.push({ w: s.weight_kg ?? "", r: s.reps ?? "", s: s.secs ?? "" });
    }
  } else if (plan?.steps?.length) {
    for (const t of plannedSets(plan.steps)) {
      const last = lastOf(t.ex.id);
      st.blocks.push({ ex: t.ex.id, target: `${t.sets} × ${t.reps ?? `${t.secs} วิ`}`,
        rows: Array.from({ length: t.sets }, () => ({ w: last?.topW ?? "", r: t.reps ?? "", s: t.secs ?? "" })) });
    }
  }
  const lastWorkout = [...all.workouts].filter((x) => x.sets.length && x.id !== st.id)[0];

  const draw = () => {
    const tok = getToken();
    app.innerHTML = `<div class="view">
      <a class="back" href="${st.id ? `#/strength/${st.id}` : "#/strength"}">${ICON.left} ${st.id ? "บันทึกนี้" : "บันทึกเวท"}</a>
      <div class="page-head"><div><h1>${st.id ? "แก้ไขบันทึกเวท" : "บันทึกเวท"}</h1><p>กรอกน้ำหนักกับจำนวนครั้งของแต่ละเซ็ต ช่องน้ำหนักว่าง = น้ำหนักตัว</p></div></div>
      ${tok ? "" : `<section class="card wk-token"><h3>ใส่รหัสบันทึก (ครั้งแรกครั้งเดียว)</h3>
        <p class="small muted">รหัสเดียวกับที่ใส่ใน Shortcut (ไฟล์ .secrets/ingest-token.txt) เครื่องนี้จะจำไว้ คนอื่นที่เปิดเว็บจะดูได้อย่างเดียว</p>
        <div class="wk-inline"><input type="password" data-token placeholder="วางรหัสที่นี่" autocomplete="off"><button class="btn-ghost" data-savetoken>จำรหัส</button></div>
        <p class="small" data-tokmsg></p></section>`}
      <section class="card wk-meta">
        <label>วันที่<input type="date" data-f="date" value="${esc(st.date)}"></label>
        <label>เวลา<input type="time" data-f="time" value="${esc(st.time)}"></label>
        <label>ประเภท<select data-f="kind">${[["strength", "เวท"], ["mobility", "ยืดเหยียด / โยคะ"], ["other", "เดิน / อื่นๆ"]].map(([v, l]) => `<option value="${v}" ${st.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="wide">ชื่อ<input type="text" data-f="title" value="${esc(st.title)}"></label>
        <label>นาที<input type="number" inputmode="numeric" data-f="duration" value="${esc(st.duration)}"></label>
        <label>RPE<select data-f="rpe"><option value="">–</option>${Array.from({ length: 10 }, (_, i) => `<option ${Number(st.rpe) === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
      </section>
      <section class="card wk-favs"><div class="card-head"><h3>★ ท่าโปรด · แตะเพื่อเพิ่ม</h3><a class="link small" href="#/exercises">แก้ท่าโปรด →</a></div>
        ${(all.favourites || []).length ? `<div class="fav-tiles">${all.favourites.map((id) => favTile(id, { added: st.blocks.some((b) => b.ex === id) })).join("")}</div>`
          : `<p class="small muted">ยังไม่มีท่าโปรด ไปที่ <a class="link" href="#/exercises">คลังท่า</a> แล้วกดดาวที่ท่าที่เล่นบ่อย</p>`}</section>
      ${!st.blocks.length && lastWorkout ? `<button class="btn-ghost wk-copy" data-copylast>ใช้ท่าเดียวกับครั้งก่อน (${dShort(lastWorkout.workout_date)})</button>` : ""}
      <div class="wk-blocks">${st.blocks.map((b, bi) => {
        const timed = isTimed(b.ex) || b.rows.some((r) => r.s !== "" && r.s != null && !r.r);
        const last = lastOf(b.ex);
        return `<section class="card wk-block">
          <div class="wk-ex-head"><div><h3>${esc(exName(b.ex))}</h3><div class="small muted">${esc(exTh(b.ex))}${b.target ? ` · เป้า ${esc(b.target)}` : ""}</div>
            ${last ? `<div class="small wk-last">ครั้งก่อน (${dShort(last.date)}): ${esc(setSummary(last.sets))}</div>` : ""}</div>
            <button class="wk-x" data-delex="${bi}" aria-label="ลบท่านี้">✕</button></div>
          <div class="wk-grid ${timed ? "timed" : ""}">
            <span class="h">เซ็ต</span>${timed ? `<span class="h">วินาที</span>` : `<span class="h">น้ำหนัก (กก.)</span><span class="h">ครั้ง</span>`}<span></span>
            ${b.rows.map((r, ri) => `<span class="n">${ri + 1}</span>
              ${timed ? `<input type="number" inputmode="numeric" data-b="${bi}" data-r="${ri}" data-k="s" value="${esc(r.s)}">`
                : `<input type="number" inputmode="decimal" step="0.5" data-b="${bi}" data-r="${ri}" data-k="w" value="${esc(r.w)}" placeholder="ตัว">
                   <input type="number" inputmode="numeric" data-b="${bi}" data-r="${ri}" data-k="r" value="${esc(r.r)}">`}
              <button class="wk-x" data-delset="${bi}:${ri}" aria-label="ลบเซ็ต">–</button>`).join("")}
          </div>
          <button class="btn-ghost small" data-addset="${bi}">+ เพิ่มเซ็ต</button>
        </section>`;
      }).join("")}</div>
      <section class="card wk-add"><label>เพิ่มท่า<select data-addex><option value="">เลือกท่า…</option>
        ${EXERCISES.filter((e) => !e.warmup).map((e) => `<option value="${e.id}">${esc(e.name)} · ${esc(e.th)}</option>`).join("")}
        <option value="__custom">ท่าอื่น (พิมพ์เอง)…</option></select></label></section>
      <section class="card"><label class="wk-notes">โน้ต (รู้สึกยังไง เจ็บตรงไหนไหม)<textarea data-f="notes" rows="3">${esc(st.notes)}</textarea></label></section>
      <div class="wk-save"><button class="btn-primary" data-save>บันทึก</button><span class="small" data-msg></span></div>
    </div>`;
    wire();
  };

  const wire = () => {
    app.querySelectorAll("[data-f]").forEach((el) => ["input", "change"].forEach((ev) => el.addEventListener(ev, () => { st[el.dataset.f] = el.value; })));
    app.querySelectorAll("[data-b]").forEach((el) => el.addEventListener("input", () => {
      const b = st.blocks[el.dataset.b], ri = Number(el.dataset.r), k = el.dataset.k, old = b.rows[ri][k];
      b.rows[ri][k] = el.value;
      // A weight typed in a set carries to later sets that were empty or the same as before.
      if (k === "w") b.rows.forEach((row, j) => { if (j > ri && (row.w === "" || row.w == null || String(row.w) === String(old))) {
        row.w = el.value; const inp = app.querySelector(`[data-b="${el.dataset.b}"][data-r="${j}"][data-k="w"]`); if (inp) inp.value = el.value; } });
    }));
    app.querySelectorAll("[data-addset]").forEach((el) => el.addEventListener("click", () => {
      const b = st.blocks[el.dataset.addset], prev = b.rows[b.rows.length - 1] || { w: "", r: "", s: "" };
      b.rows.push({ ...prev }); draw();
    }));
    app.querySelectorAll("[data-delset]").forEach((el) => el.addEventListener("click", () => {
      const [bi, ri] = el.dataset.delset.split(":").map(Number); st.blocks[bi].rows.splice(ri, 1);
      if (!st.blocks[bi].rows.length) st.blocks.splice(bi, 1); draw();
    }));
    app.querySelectorAll("[data-delex]").forEach((el) => el.addEventListener("click", () => { st.blocks.splice(Number(el.dataset.delex), 1); draw(); }));
    const addBlock = (id) => {
      const last = lastOf(id);
      st.blocks.push({ ex: id, target: "", rows: last ? last.sets.map((s) => ({ w: s.weight_kg ?? "", r: s.reps ?? "", s: s.secs ?? "" }))
        : Array.from({ length: 3 }, () => ({ w: "", r: isTimed(id) ? "" : 10, s: isTimed(id) ? 30 : "" })) });
      draw();
      app.querySelectorAll(".wk-block")[st.blocks.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    app.querySelectorAll(".wk-favs [data-fav]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.fav;
      if (st.blocks.some((x) => x.ex === id)) { app.querySelectorAll(".wk-block")[st.blocks.findIndex((x) => x.ex === id)]?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      addBlock(id);
    }));
    app.querySelector("[data-addex]").addEventListener("change", (e) => {
      let id = e.target.value;
      if (!id) return;
      if (id === "__custom") { const name = (prompt("ชื่อท่า") || "").trim(); if (!name) return draw(); id = `custom:${name}`; }
      const last = lastOf(id);
      st.blocks.push({ ex: id, target: "", rows: last ? last.sets.map((s) => ({ w: s.weight_kg ?? "", r: s.reps ?? "", s: s.secs ?? "" }))
        : Array.from({ length: 3 }, () => ({ w: "", r: isTimed(id) ? "" : 10, s: isTimed(id) ? 30 : "" })) });
      draw();
    });
    app.querySelector("[data-copylast]")?.addEventListener("click", () => {
      const groups = new Map();
      for (const s of lastWorkout.sets) (groups.get(s.exercise) ?? groups.set(s.exercise, []).get(s.exercise)).push({ w: s.weight_kg ?? "", r: s.reps ?? "", s: s.secs ?? "" });
      st.blocks = [...groups].map(([ex, rows]) => ({ ex, target: "", rows }));
      draw();
    });
    app.querySelector("[data-savetoken]")?.addEventListener("click", async () => {
      const v = app.querySelector("[data-token]").value.trim(), msg = app.querySelector("[data-tokmsg]");
      if (!v) return;
      setToken(v);
      try { await send("POST", "/api/auth/check", {}); msg.textContent = "จำรหัสแล้วค่ะ ✓"; setTimeout(draw, 600); }
      catch (err) { msg.textContent = err.message; }
    });
    app.querySelector("[data-save]").addEventListener("click", async (e) => {
      const msg = app.querySelector("[data-msg]");
      if (!getToken()) { msg.textContent = "ใส่รหัสบันทึกด้านบนก่อนนะคะ"; window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      const sets = st.blocks.flatMap((b) => b.rows.map((r) => ({
        exercise: b.ex, weight_kg: r.w === "" ? null : Number(r.w), reps: r.r === "" ? null : Number(r.r), secs: r.s === "" ? null : Number(r.s),
      }))).filter((s) => s.reps || s.secs);
      e.target.disabled = true; msg.textContent = "กำลังบันทึก…";
      try {
        const res = await send("POST", "/api/workouts", { id: st.id, workout_date: st.date, start_time: st.time, title: st.title, kind: st.kind,
          duration_min: st.duration === "" ? null : Number(st.duration), rpe: st.rpe === "" ? null : Number(st.rpe), notes: st.notes, planned_id: st.planned_id, sets });
        location.hash = `#/strength/${res.id}`;
      } catch (err) { msg.textContent = err.message; e.target.disabled = false; if (!getToken()) draw(); }
    });
  };
  draw();
}

// ---------- guided workout: pick an exercise → how-to → log each set (plank timer), saved as you go ----------
const DRAFT_KEY = "rj_session";
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } };
const storeDraft = (d) => { try { d ? localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) : localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ } };
const draftSets = (d) => (d?.blocks || []).reduce((t, b) => t + b.done.length, 0);
const draftMatches = (d, key) => d && (d.key === key || (d.id && key === `w${d.id}`) || (d.planned_id && key === `p${d.planned_id}`));
let leaveView = null; // cleanup (timers, wake lock) when the route changes

let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio */ }
}
function beep(n = 1, hz = 880) {
  try { navigator.vibrate?.(n > 1 ? [180, 90, 180] : 140); } catch { /* not supported */ }
  if (!audioCtx) return;
  for (let i = 0; i < n; i++) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.3;
    o.frequency.value = hz; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.start(t); o.stop(t + 0.26);
  }
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported / denied */ }
}
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};
const pos = (v) => (Number(v) > 0 ? Number(v) : null); // 0 / "" / null → null (old chat logs stored secs = 0 on rep sets)
/** "secs" or "reps": the athlete's switch (b.mode) → library unit (plank, wall sit = time) → for custom exercises, how they were logged. */
const blockMode = (b) => b.mode || (EX_BY_ID[b.ex] ? (isTimed(b.ex) ? "secs" : "reps")
  : b.done.length ? (b.done.some((s) => pos(s.s) && !pos(s.r)) ? "secs" : "reps") : pos(b.secs) && !pos(b.reps) ? "secs" : "reps");
const timedBlock = (b) => blockMode(b) === "secs";
const doneText = (b, s) => (pos(s.s) && !pos(s.r) ? `${s.s} วิ${b.perSide ? " ต่อข้าง" : ""}` : `${s.w !== "" && s.w != null ? `${kg(Number(s.w))} กก. × ` : ""}${s.r} ครั้ง${b.perSide ? " ต่อข้าง" : ""}`);
const targetText = (b) => `${b.sets} เซ็ต × ${timedBlock(b) ? `${pos(b.secs) ?? 30} วิ` : `${pos(b.reps) ?? 10} ครั้ง`}${b.perSide ? " ต่อข้าง" : ""}`;

/** A new session from a plan / an existing log / nothing. Targets come from the plan steps (plannedSets). */
function newSession({ key, plan, existing }) {
  const now = bkkNow(), w0 = existing?.workout;
  const S = {
    v: 1, key, id: w0?.id ?? null, planned_id: w0?.planned_id ?? plan?.id ?? null,
    date: w0?.workout_date ?? now.slice(0, 10), time: w0?.start_time ?? now.slice(11, 16),
    started: Date.now() - (w0?.duration_min || 0) * 60000, title: w0?.title ?? plan?.title ?? "เวท",
    warm: (plan?.steps || []).filter((s) => !plannedSets([s]).length),
    blocks: [], rpe: w0?.rpe ?? "", notes: w0?.notes ?? "", view: { name: "list" },
  };
  for (const t of plannedSets(plan?.steps || [])) S.blocks.push({ ex: t.ex.id, sets: t.sets, reps: t.reps, secs: t.secs, perSide: t.perSide, done: [] });
  for (const s of existing?.sets || []) {
    let b = S.blocks.find((x) => x.ex === s.exercise);
    if (!b) S.blocks.push((b = { ex: s.exercise, sets: 0, reps: pos(s.reps), secs: pos(s.secs), perSide: Boolean(EX_BY_ID[s.exercise]?.sides), done: [], extra: true }));
    b.done.push({ w: s.weight_kg ?? "", r: pos(s.reps) ?? "", s: pos(s.secs) ?? "" });
    if (b.extra) b.sets = b.done.length;
  }
  return S;
}

function renderSession(S, all) {
  const hist = exerciseHistory(all.workouts);
  const lastOf = (ex) => (hist.get(ex) || []).filter((p) => p.id !== S.id).pop();
  let phase = "input";      // exercise view: input | timer | after
  let cur = null;            // current set inputs {w, r, s}
  let T = null;              // plank timer {phase: prep|hold|switch, side, secs, startAt, endAt, held: []}
  let R = null;              // rest timer {endAt}
  let syncState = S.id ? "ok" : "none", syncMsg = "";
  let saving = Promise.resolve();

  const save = () => storeDraft(S);
  const payload = () => ({
    id: S.id, workout_date: S.date, start_time: S.time, title: S.title, kind: "strength",
    duration_min: Math.max(1, Math.round((Date.now() - S.started) / 60000)), rpe: S.rpe === "" ? null : Number(S.rpe), notes: S.notes,
    planned_id: S.planned_id,
    sets: S.blocks.flatMap((b) => b.done.map((s) => ({ exercise: b.ex, weight_kg: s.w === "" || s.w == null ? null : Number(s.w), reps: s.r === "" || s.r == null ? null : Number(s.r), secs: s.s === "" || s.s == null ? null : Number(s.s) }))),
  });
  /** Every confirmed set goes to the phone first, then to the server (in order). A failure keeps it on the phone. */
  const sync = (extra = {}) => {
    save();
    if (!S.id && !draftSets(S)) return saving;
    if (!getToken()) { syncState = "local"; paintSync(); return saving; }
    syncState = "saving"; paintSync();
    S.dirty = true; save();
    saving = saving.then(async () => {
      try {
        const res = await send("POST", "/api/workouts", { ...payload(), ...extra });
        S.id = res.id; S.dirty = false; syncState = "ok"; save();
      } catch (err) { syncState = "err"; syncMsg = err.message; }
      paintSync();
    });
    return saving;
  };
  const syncLabel = () => ({ ok: "☁︎ บันทึกขึ้นเว็บแล้ว", saving: "กำลังบันทึก…", local: "เก็บในเครื่องแล้ว · ใส่รหัสเพื่อส่งขึ้นเว็บ", err: "⚠︎ ส่งไม่สำเร็จ เก็บในเครื่องไว้แล้ว", none: "" })[syncState];
  const paintSync = () => { const el = app.querySelector("[data-sync]"); if (el) { el.textContent = syncLabel(); el.className = `gs-sync ${syncState}`; el.title = syncMsg; } };

  const defaults = (b) => {
    const prev = b.done[b.done.length - 1], last = lastOf(b.ex), lastSet = last?.sets?.[Math.min(b.done.length, (last?.sets?.length || 1) - 1)];
    return {
      w: prev ? prev.w : last?.topW ?? "",
      r: pos(prev?.r) || pos(b.reps) || pos(lastSet?.reps) || 10,
      s: pos(b.secs) || pos(prev?.s) || pos(lastSet?.secs) || 30,
    };
  };
  const openEx = (bi) => { S.view = { name: "ex", bi }; phase = "input"; cur = defaults(S.blocks[bi]); T = null; save(); draw(); window.scrollTo({ top: 0 }); };
  const toList = () => { S.view = { name: "list" }; T = null; save(); draw(); window.scrollTo({ top: 0 }); };
  const logSet = (entry) => {
    const b = S.blocks[S.view.bi];
    b.done.push(entry);
    if (b.extra) b.sets = Math.max(b.sets, b.done.length);
    phase = "after"; T = null;
    R = { endAt: Date.now() + (timedBlock(b) ? 45 : 60) * 1000, beeped: false };
    sync(); draw();
  };
  const addBlock = (id, mode = null) => {
    let bi = S.blocks.findIndex((b) => b.ex === id);
    if (bi < 0) {
      const last = lastOf(id), ls = last?.sets || [];
      S.blocks.push({ ex: id, sets: ls.length || 3, reps: pos(ls[0]?.reps) ?? (isTimed(id) ? null : 10), secs: pos(ls[0]?.secs) ?? (isTimed(id) ? 30 : null),
        perSide: Boolean(EX_BY_ID[id]?.sides), done: [], extra: true, ...(mode ? { mode } : {}) });
      bi = S.blocks.length - 1;
    }
    openEx(bi);
  };

  // ---- timer ----
  const startTimer = () => {
    unlockAudio();
    const b = S.blocks[S.view.bi];
    const secs = Math.max(5, Number(cur.s) || 30);
    T = { phase: "prep", side: 1, secs, held: [], startAt: Date.now(), endAt: Date.now() + 3000, perSide: b.perSide };
    phase = "timer"; draw();
  };
  const advance = (early = false) => {
    const now = Date.now();
    if (T.phase === "prep" || T.phase === "switch") {
      if (!early) beep(1, 660);
      if (T.phase === "switch") T.side = 2;
      T.phase = "hold"; T.startAt = now; T.endAt = now + T.secs * 1000;
    } else if (T.phase === "hold") {
      T.held.push(early ? Math.round((now - T.startAt) / 1000) : T.secs);
      beep(2);
      if (T.perSide && T.side === 1) { T.phase = "switch"; T.startAt = now; T.endAt = now + 5000; }
      else return logSet({ w: "", r: "", s: Math.min(...T.held) });
    }
    draw();
  };

  const tick = () => {
    const el = app.querySelector("[data-elapsed]");
    if (el) el.textContent = clock(Date.now() - S.started);
    const rest = app.querySelector("[data-rest]");
    if (rest) {
      if (R) {
        const left = R.endAt - Date.now();
        if (left <= 0 && !R.beeped) { R.beeped = true; beep(1, 520); }
        rest.hidden = false;
        rest.textContent = left > 0 ? `พัก ${clock(left)}` : `พักครบแล้ว · ${clock(-left)}`;
        rest.classList.toggle("over", left <= 0);
      } else rest.hidden = true;
    }
    if (T) {
      const left = T.endAt - Date.now();
      if (left <= 0) return advance();
      const total = T.phase === "hold" ? T.secs * 1000 : T.phase === "prep" ? 3000 : 5000;
      const big = app.querySelector("[data-tbig]"), ring = app.querySelector("[data-tring]");
      if (big) big.textContent = Math.ceil(left / 1000);
      if (ring) ring.style.strokeDashoffset = String(339.3 * (1 - left / total));
    }
  };

  // ---- views ----
  const bar = () => `<div class="gs-bar">
    ${S.view.name === "list" ? `<a class="gs-back" href="#/strength">${ICON.left} ออก</a>` : `<button class="gs-back" data-nav="list">${ICON.left} ท่าทั้งหมด</button>`}
    <div class="gs-clock"><b data-elapsed>${clock(Date.now() - S.started)}</b><small>เวลาเล่น</small></div>
    <button class="gs-rest" data-rest hidden aria-label="ข้ามเวลาพัก"></button>
  </div>
  <div class="gs-sync ${syncState}" data-sync>${syncLabel()}</div>`;

  const tokenCard = () => (getToken() ? "" : `<section class="card wk-token"><h3>ใส่รหัสบันทึก (ครั้งแรกครั้งเดียว)</h3>
    <p class="small muted">ไม่มีรหัสก็เล่นได้ ระบบเก็บทุกเซ็ตไว้ในเครื่องก่อน ใส่รหัสแล้วจะส่งขึ้นเว็บให้เอง</p>
    <div class="wk-inline"><input type="password" data-token placeholder="วางรหัสที่นี่" autocomplete="off"><button class="btn-ghost" data-savetoken>จำรหัส</button></div>
    <p class="small" data-tokmsg></p></section>`);

  const listView = () => {
    const nextBi = S.blocks.findIndex((b) => b.done.length < b.sets);
    const nDone = S.blocks.filter((b) => b.done.length && b.done.length >= b.sets).length;
    return `<div class="page-head"><div><div class="eyebrow">กำลังเล่น · ${dLong(S.date)}</div><h1>${esc(S.title)}</h1>
      <p>${S.blocks.length ? `เลือกท่าที่จะเล่น เล่นท่าไหนก่อนก็ได้ · ครบแล้ว ${nDone}/${S.blocks.length} ท่า` : "เพิ่มท่าที่จะเล่นด้านล่างได้เลยค่ะ"}</p></div></div>
    ${tokenCard()}
    ${S.warm.length ? `<details class="card gs-warm"><summary>วอร์มอัพ / คูลดาวน์ตามแผน</summary><ul class="bullets">${S.warm.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
    <div class="gs-list">${S.blocks.map((b, bi) => {
      const ex = EX_BY_ID[b.ex], complete = b.done.length >= b.sets && b.done.length > 0, last = lastOf(b.ex);
      const dots = Array.from({ length: Math.max(b.sets, b.done.length) }, (_, i) => `<i class="${i < b.done.length ? "on" : ""}"></i>`).join("");
      return `<button class="gs-ex ${complete ? "complete" : ""} ${bi === nextBi ? "next" : ""}" data-open="${bi}">
        <span class="gs-pic">${ex ? pictoMini(ex) : `<span class="ini">${esc(exName(b.ex).slice(0, 2).toUpperCase())}</span>`}</span>
        <span class="gs-ex-main"><b>${esc(exName(b.ex))}</b><small>${esc(exTh(b.ex))}</small>
          <span class="gs-target">${b.extra && !b.done.length ? "เพิ่มเอง" : `เป้า ${targetText(b)}`}${last ? ` · ครั้งก่อน ${esc(setSummary(last.sets))}` : ""}</span>
          ${b.done.length ? `<span class="gs-doneline">${b.done.map((s) => esc(doneText(b, s))).join(" · ")}</span>` : ""}</span>
        <span class="gs-state">${complete ? `<span class="gs-check">${ICON.check}</span>` : bi === nextBi ? `<span class="gs-go">เริ่ม ›</span>` : ""}<span class="gs-dots">${dots}</span></span>
      </button>`;
    }).join("")}</div>
    <section class="card gs-add"><h3>+ เพิ่มท่า</h3>
      ${(all.favourites || []).length ? `<div class="fav-tiles">${all.favourites.map((id) => favTile(id, { added: S.blocks.some((b) => b.ex === id) })).join("")}</div>` : ""}
      <label class="wk-add"><select data-addex><option value="">เลือกจากคลังท่า…</option>
        ${EXERCISES.filter((e) => !e.warmup).map((e) => `<option value="${e.id}">${esc(e.name)} · ${esc(e.th)}</option>`).join("")}
        <option value="__custom">ท่าอื่น (พิมพ์เอง)…</option></select></label></section>
    <div class="gs-foot"><button class="btn-primary" data-finish ${draftSets(S) ? "" : "disabled"}>จบการเล่น · สรุปผล</button>
      ${S.id ? "" : `<button class="btn-ghost" data-discard>ยกเลิก</button>`}</div>`;
  };

  const ring = (label, big, sub, cls = "") => `<div class="gs-timer ${cls}">
    <svg viewBox="0 0 120 120"><circle class="bgc" cx="60" cy="60" r="54"/><circle class="fgc" data-tring cx="60" cy="60" r="54" style="stroke-dasharray:339.3;stroke-dashoffset:0"/></svg>
    <div class="gs-tin"><small>${label}</small><b data-tbig>${big}</b><span>${sub}</span></div></div>`;

  const exView = () => {
    const b = S.blocks[S.view.bi], ex = EX_BY_ID[b.ex], timed = timedBlock(b), n = b.done.length + 1, last = lastOf(b.ex);
    const reached = b.done.length >= b.sets;
    let now;
    if (phase === "after") {
      const s = b.done[b.done.length - 1];
      now = `<div class="gs-after"><div class="gs-big-ok">${ICON.check}</div>
        <h3>เซ็ต ${b.done.length} เสร็จแล้ว · ${esc(doneText(b, s))}</h3>
        <p class="muted small">${reached ? `ครบเป้า ${b.sets} เซ็ตแล้วค่ะ เก่งมาก 💪` : `เหลืออีก ${b.sets - b.done.length} เซ็ต · พักให้หายใจปกติก่อนนะคะ`}</p>
        <div class="gs-choice">
          <button class="${reached ? "btn-ghost" : "btn-primary"} gs-wide" data-more>+ อีกเซ็ต</button>
          <button class="${reached ? "btn-primary" : "btn-ghost"} gs-wide" data-nav="list">พอแล้ว เปลี่ยนท่า ›</button>
        </div></div>`;
    } else if (phase === "timer") {
      const lbl = T.phase === "prep" ? "เตรียมตัว" : T.phase === "switch" ? "สลับข้าง" : T.perSide ? (T.side === 1 ? "ข้างที่ 1" : "ข้างที่ 2") : "ค้างไว้";
      const sub = T.phase === "hold" ? `เป้า ${T.secs} วิ` : T.phase === "switch" ? "เปลี่ยนไปอีกข้าง" : "เข้าท่าเลย";
      const left = Math.ceil((T.endAt - Date.now()) / 1000);
      now = `<h3 class="gs-setno">เซ็ตที่ ${n}${b.sets ? ` / ${b.sets}` : ""}</h3>
        ${ring(lbl, left, sub, T.phase)}
        <div class="gs-choice">
          ${T.phase === "hold" ? `<button class="btn-primary gs-wide" data-stop>หยุด · บันทึกเท่าที่ทำได้</button>` : `<button class="btn-primary gs-wide" data-skip>เริ่มเลย</button>`}
          <button class="btn-ghost gs-wide" data-cancel>ยกเลิกเซ็ตนี้</button></div>`;
    } else if (timed) {
      now = `<h3 class="gs-setno">เซ็ตที่ ${n}${b.sets ? ` / ${b.sets}` : ""}</h3>
        <div class="gs-mode" role="group" aria-label="วิธีนับ"><button class="${timed ? "" : "on"}" data-mode="reps">นับครั้ง</button><button class="${timed ? "on" : ""}" data-mode="secs">นับเวลา</button></div>
        <div class="gs-secs"><button class="gs-step" data-sec="-5">−5</button><div><b data-secv>${cur.s}</b><small>วินาที${b.perSide ? " ต่อข้าง" : ""}</small></div><button class="gs-step" data-sec="5">+5</button></div>
        <button class="btn-primary gs-wide gs-startt" data-start>▶ เริ่มจับเวลา</button>
        <p class="small muted gs-hint">นับถอยหลัง 3 วิให้เข้าท่า แล้วจับเวลา${b.perSide ? " ครบข้างแรกมีเวลาสลับข้าง 5 วิ" : ""} หมดเวลามีเสียงเตือนและบันทึกเซ็ตให้เอง</p>
        <details class="gs-manual"><summary>จับเวลาเองแล้ว กรอกวินาที</summary>
          <div class="wk-inline"><input type="number" inputmode="numeric" data-manual value="${esc(cur.s)}"><button class="btn-ghost" data-manualok>บันทึก</button></div></details>`;
    } else {
      now = `<h3 class="gs-setno">เซ็ตที่ ${n}${b.sets ? ` / ${b.sets}` : ""}</h3>
        <div class="gs-mode" role="group" aria-label="วิธีนับ"><button class="${timed ? "" : "on"}" data-mode="reps">นับครั้ง</button><button class="${timed ? "on" : ""}" data-mode="secs">นับเวลา</button></div>
        <div class="gs-inputs">
          <div class="gs-field"><label>น้ำหนัก (กก.)</label><div class="gs-stepper"><button class="gs-step" data-step="w:-1">−</button>
            <input type="number" inputmode="decimal" step="0.5" data-cur="w" value="${esc(cur.w)}" placeholder="ตัว"><button class="gs-step" data-step="w:1">+</button></div>
            <small class="muted">เว้นว่าง = น้ำหนักตัว</small></div>
          <div class="gs-field"><label>ครั้ง${b.perSide ? " (ต่อข้าง)" : ""}</label><div class="gs-stepper"><button class="gs-step" data-step="r:-1">−</button>
            <input type="number" inputmode="numeric" data-cur="r" value="${esc(cur.r)}"><button class="gs-step" data-step="r:1">+</button></div></div>
        </div>
        <button class="btn-primary gs-wide gs-confirm" data-confirm>${ICON.check} บันทึกเซ็ต ${n}</button>`;
    }
    return `<div class="gs-exhead"><div><h1>${esc(exName(b.ex))}</h1><p class="muted">${esc(exTh(b.ex))}${ex?.muscles ? ` · ${esc(ex.muscles)}` : ""}</p></div>
        <span class="gs-tgt">เป้า ${targetText(b)}</span></div>
      ${last ? `<div class="small wk-last">ครั้งก่อน (${dShort(last.date)}): ${esc(setSummary(last.sets))}</div>` : ""}
      <section class="card gs-now">${now}</section>
      ${b.done.length ? `<section class="card gs-done"><h3>เซ็ตที่ทำแล้ว</h3>${b.done.map((s, i) => `<div class="gs-drow"><span class="n">${i + 1}</span><span>${esc(doneText(b, s))}</span>
        <button class="wk-x" data-delset="${i}" aria-label="ลบเซ็ตนี้">✕</button></div>`).join("")}</section>` : ""}
      ${ex ? `<section class="card gs-how"><div class="gs-pict">${pictogram(ex)}</div>
        <details ${b.done.length ? "" : "open"}><summary>วิธีทำ · จุดสังเกต · ผิดบ่อย</summary>
          <ol class="steps">${ex.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          ${ex.cues.length ? `<h4 class="sec">จุดสังเกต</h4><ul class="bullets">${ex.cues.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${ex.mistakes.length ? `<h4 class="sec">ผิดบ่อย</h4><ul class="bullets warn">${ex.mistakes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          <a class="ex-video" href="${ytLink(ex)}" target="_blank" rel="noopener">▶ ดูวิดีโอตัวอย่างใน YouTube</a>
        </details></section>` : ""}`;
  };

  const finishView = () => {
    const sets = draftSets(S), mins = Math.max(1, Math.round((Date.now() - S.started) / 60000));
    const vol = S.blocks.reduce((t, b) => t + b.done.reduce((u, s) => u + (Number(s.w) || 0) * (Number(s.r) || 0), 0), 0);
    if (S.dur == null) S.dur = mins;
    return `<div class="page-head"><div><div class="eyebrow">${dLong(S.date)}</div><h1>สรุปรอบนี้</h1><p>${esc(S.title)}</p></div></div>
      ${tokenCard()}
      <div class="stat-row run-stats">
        <div class="stat"><div class="label">ท่า</div><div class="value">${S.blocks.filter((b) => b.done.length).length}</div></div>
        <div class="stat"><div class="label">เซ็ต</div><div class="value">${sets}</div></div>
        ${vol ? `<div class="stat"><div class="label">น้ำหนักรวม</div><div class="value">${Math.round(vol).toLocaleString()}<small>กก.</small></div></div>` : ""}
        <div class="stat"><div class="label">เวลา (นาที)</div><input class="gs-dur" type="number" inputmode="numeric" data-dur value="${S.dur}"></div>
      </div>
      <section class="card"><div class="gs-sum">${S.blocks.filter((b) => b.done.length).map((b) => `<div><b>${esc(exName(b.ex))}</b><span>${b.done.map((s) => esc(doneText(b, s))).join(" · ")}</span></div>`).join("")}</div></section>
      <section class="card"><h3>เหนื่อยแค่ไหน (RPE)</h3><p class="small muted">1–3 สบาย · 4–6 พอเหนื่อย คุยได้ · 7–8 หนัก · 9–10 สุดแรง</p>
        <div class="gs-rpe">${Array.from({ length: 10 }, (_, i) => `<button class="${Number(S.rpe) === i + 1 ? "on" : ""}" data-rpe="${i + 1}">${i + 1}</button>`).join("")}</div></section>
      <section class="card"><label class="wk-notes">โน้ต (รู้สึกยังไง เจ็บตรงไหนไหม)<textarea data-notes rows="3">${esc(S.notes)}</textarea></label></section>
      <div class="gs-foot"><button class="btn-primary" data-done>บันทึกและจบ</button><button class="btn-ghost" data-nav="list">กลับไปเล่นต่อ</button><span class="small" data-msg></span></div>`;
  };

  let shown = "";            // animate only when the screen changes, not on every set / timer step
  const draw = () => {
    if (S.view.name === "ex" && !S.blocks[S.view.bi]) S.view = { name: "list" };
    const v = S.view.name === "ex" ? exView() : S.view.name === "finish" ? finishView() : listView();
    const at = `${S.view.name}:${S.view.bi ?? ""}`;
    app.innerHTML = `<div class="view gs ${at === shown ? "still" : ""}">${bar()}${v}</div>`;
    shown = at;
    wire(); tick();
  };

  const wire = () => {
    const on = (sel, fn, ev = "click") => app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
    on("[data-nav]", (el) => (el.dataset.nav === "list" ? toList() : null));
    on("[data-open]", (el) => openEx(Number(el.dataset.open)));
    on("[data-rest]", () => { R = null; tick(); });
    on(".gs-add [data-fav]", (el) => addBlock(el.dataset.fav));
    on("[data-addex]", (el) => {
      let id = el.value;
      if (!id) return;
      let mode = null;
      if (id === "__custom") {
        const name = (prompt("ชื่อท่า") || "").trim(); if (!name) return draw(); id = `custom:${name}`;
        if (!S.blocks.some((b) => b.ex === id) && !lastOf(id)) mode = confirm(`${name}: นับเป็นเวลา (วินาที) ไหม?\n\nOK = นับเวลา (แบบ plank)\nยกเลิก = นับครั้ง (แบบ push-up)`) ? "secs" : "reps";
      }
      addBlock(id, mode);
    }, "change");
    on("[data-finish]", () => { S.view = { name: "finish" }; save(); draw(); window.scrollTo({ top: 0 }); });
    on("[data-discard]", () => { if (!draftSets(S) || confirm("ทิ้งเซสชันนี้? เซ็ตที่กรอกไว้จะหายไป")) { storeDraft(null); location.hash = "#/strength"; } });
    // exercise view
    on("[data-cur]", (el) => { cur[el.dataset.cur] = el.value; }, "input");
    on("[data-step]", (el) => {
      const [k, d] = el.dataset.step.split(":"), inp = app.querySelector(`[data-cur="${k}"]`);
      const v = Number(cur[k]) || 0;
      if (k === "w" && (cur.w === "" || cur.w == null) && Number(d) < 0) return;
      const nv = Math.max(0, v + Number(d));
      cur[k] = k === "w" && nv === 0 ? "" : nv;
      if (inp) inp.value = cur[k];
    });
    on("[data-confirm]", () => {
      if (!Number(cur.r)) { app.querySelector('[data-cur="r"]')?.focus(); return; }
      unlockAudio();
      logSet({ w: cur.w === "" ? "" : Number(cur.w), r: Number(cur.r), s: "" });
    });
    on("[data-sec]", (el) => { cur.s = Math.max(5, (Number(cur.s) || 30) + Number(el.dataset.sec)); app.querySelector("[data-secv]").textContent = cur.s; });
    on("[data-start]", startTimer);
    on("[data-mode]", (el) => {
      const b = S.blocks[S.view.bi];
      b.mode = el.dataset.mode; save(); cur = defaults(b); draw();
    });
    on("[data-skip]", () => advance(true));
    on("[data-stop]", () => advance(true));
    on("[data-cancel]", () => { T = null; phase = "input"; draw(); });
    on("[data-manualok]", () => { const v = Number(app.querySelector("[data-manual]").value); if (v > 0) logSet({ w: "", r: "", s: v }); });
    on("[data-more]", () => { phase = "input"; cur = defaults(S.blocks[S.view.bi]); draw(); });
    on("[data-delset]", (el) => {
      if (!confirm("ลบเซ็ตนี้?")) return;
      const b = S.blocks[S.view.bi]; b.done.splice(Number(el.dataset.delset), 1);
      if (b.extra) b.sets = Math.max(b.done.length, 1);
      phase = "input"; cur = defaults(b); sync(); draw();
    });
    // finish
    on("[data-rpe]", (el) => { S.rpe = Number(el.dataset.rpe); save(); app.querySelectorAll("[data-rpe]").forEach((x) => x.classList.toggle("on", x === el)); });
    on("[data-notes]", (el) => { S.notes = el.value; save(); }, "input");
    on("[data-dur]", (el) => { S.dur = el.value; save(); }, "input");
    on("[data-done]", async (el) => {
      const msg = app.querySelector("[data-msg]");
      if (!getToken()) { msg.textContent = "ใส่รหัสบันทึกด้านบนก่อนนะคะ (ทุกเซ็ตยังอยู่ในเครื่อง)"; window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      el.disabled = true; msg.textContent = "กำลังบันทึก…";
      await sync({ duration_min: Number(S.dur) || null });
      if (syncState !== "ok") { el.disabled = false; msg.textContent = syncMsg || "บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ"; return; }
      storeDraft(null);
      location.hash = `#/strength/${S.id}`;
    });
    // token
    on("[data-savetoken]", async () => {
      const v = app.querySelector("[data-token]").value.trim(), m = app.querySelector("[data-tokmsg]");
      if (!v) return;
      setToken(v);
      try { await send("POST", "/api/auth/check", {}); m.textContent = "จำรหัสแล้วค่ะ ✓"; sync(); setTimeout(draw, 500); }
      catch (err) { m.textContent = err.message; }
    });
  };

  const onVis = () => { if (document.visibilityState === "visible") { keepAwake(true); tick(); } };
  const iv = setInterval(tick, 250);
  document.addEventListener("visibilitychange", onVis);
  keepAwake(true);
  leaveView = () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); keepAwake(false); };
  if (S.view.name === "ex" && S.blocks[S.view.bi]) cur = defaults(S.blocks[S.view.bi]);
  save();
  draw();
  if ((S.dirty || !S.id) && draftSets(S)) sync();
}

// ---------- settings: save code + favourite exercises ----------
function favTile(id, opts = {}) {
  const ex = EX_BY_ID[id];
  const name = exName(id);
  const icon = ex ? pictoMini(ex) : `<span class="ini">${esc(name.slice(0, 2).toUpperCase())}</span>`;
  return `<button class="fav-tile ${opts.added ? "added" : ""}" ${opts.attr || ""} data-fav="${esc(id)}" title="${esc(name)}">${icon}<b>${esc(name)}</b></button>`;
}

async function saveFavs(ids) {
  const r = await send("POST", "/api/settings/favourites", { ids });
  return r.favourites;
}

/** เวท › คลังท่า: how-to for every exercise + ★ favourites (one-tap tiles in the log form). */
function renderExercises(all) {
  let favs = [...(all.favourites || [])];
  const customs = [...new Set(all.workouts.flatMap((w) => w.sets.map((s) => s.exercise)).filter((x) => x.startsWith("custom:")))];
  const draw = (msg = "") => {
    const row = (id, card) => `<div class="set-ex"><button class="star ${favs.includes(id) ? "on" : ""}" data-star="${esc(id)}" aria-label="${favs.includes(id) ? "เอาออกจากท่าโปรด" : "เพิ่มเป็นท่าโปรด"}">${favs.includes(id) ? "★" : "☆"}</button>${card}</div>`;
    const y = window.scrollY;
    app.innerHTML = `<div class="view">
      ${subnav("strength", "#/exercises")}
      <div class="page-head"><div><h1>คลังท่าออกกำลังกาย</h1><p>แตะชื่อท่าเพื่อดูวิธีเล่น จุดสังเกต และท่าที่ผิดบ่อย · กดดาวเพื่อเพิ่มเป็นท่าโปรด</p></div></div>
      <section class="card">
        <div class="card-head"><h2>★ ท่าโปรด</h2><span class="small muted">${favs.length} ท่า</span></div>
        <p class="small muted">ท่าโปรดจะขึ้นเป็นไอคอนในหน้าบันทึกเวท แตะครั้งเดียวก็เพิ่มท่าได้เลย</p>
        ${favs.length ? `<div class="fav-tiles">${favs.map((id) => favTile(id, { attr: "disabled" })).join("")}</div>` : ""}
        ${msg ? `<p class="small" style="margin-top:10px;color:var(--amber)">${msg}</p>` : ""}
      </section>
      <h2 class="section-title">ท่าเวท</h2>
      <div class="ex-list">${EXERCISES.filter((e) => !e.warmup).map((e) => row(e.id, exCard(e))).join("")}</div>
      ${customs.length ? `<h2 class="section-title">ท่าที่เพิ่มเอง</h2><div class="ex-list">${customs.map((id) => row(id, `<div class="ex"><summary><div class="ex-name"><b>${esc(exName(id))}</b><span>เพิ่มเองตอนบันทึกเวท</span></div></summary></div>`)).join("")}</div>` : ""}
      <h2 class="section-title">ท่าวอร์มอัพ</h2>
      <div class="ex-list">${EXERCISES.filter((e) => e.warmup).map((e) => exCard(e)).join("")}</div>
    </div>`;
    window.scrollTo({ top: y });
    app.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", async () => {
      if (!getToken()) { draw(`ใส่รหัสบันทึกในหน้า <a class="link" href="#/settings">ตั้งค่า</a> ก่อนนะคะ แล้วค่อยกดดาว`); window.scrollTo({ top: 0 }); return; }
      const id = b.dataset.star;
      const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
      try { favs = await saveFavs(next); all.favourites = favs; draw(); }
      catch (err) { draw(esc(err.message)); window.scrollTo({ top: 0 }); }
    }));
  };
  draw();
}

/** ตั้งค่า: things set once per device — the save code and the automatic data delivery. */
function renderSettings(all) {
  const favs = all.favourites || [];
  const draw = () => {
    const tok = getToken();
    app.innerHTML = `<div class="view">
      <div class="page-head"><div><h1>ตั้งค่า</h1><p>รหัสบันทึกของเครื่องนี้ และการส่งข้อมูลอัตโนมัติจาก iPhone</p></div></div>
      <div class="settings-list">
      <section class="card wk-token">
        <div class="card-head"><h2>รหัสบันทึก</h2><span class="small ${tok ? "" : "muted"}">${tok ? "✓ จำไว้ในเครื่องนี้แล้ว" : "ยังไม่ได้ใส่"}</span></div>
        <p class="small muted">ใช้ตอนบันทึกเวทและกดท่าโปรด เป็นรหัสเดียวกับใน Shortcut (ไฟล์ .secrets/ingest-token.txt) ใส่ครั้งเดียวต่อเครื่อง</p>
        <div class="wk-inline"><input type="password" data-token placeholder="${tok ? "ใส่รหัสใหม่เพื่อเปลี่ยน" : "วางรหัสที่นี่"}" autocomplete="off"><button class="btn-ghost" data-savetoken>จำรหัส</button>
          ${tok ? `<button class="btn-ghost" data-forget>ลบจากเครื่องนี้</button>` : ""}</div>
        <p class="small" data-tokmsg></p>
      </section>
      <section class="card"><div class="card-head"><h2>การส่งข้อมูลอัตโนมัติ</h2><a class="link" href="#/sync">วิธีตั้งค่าและสถานะ →</a></div>
        <p class="small muted">คำสั่งลัดบน iPhone ส่ง HR พัก HRV การนอน และการวิ่ง/เวทเข้าระบบเอง</p></section>
      <section class="card"><div class="card-head"><h2>★ ท่าโปรด</h2><a class="link" href="#/exercises">จัดการในคลังท่า →</a></div>
        <p class="small muted">${favs.length ? `ตอนนี้มี ${favs.length} ท่า: ${favs.map((id) => esc(exName(id))).join(" · ")}` : "ยังไม่มีท่าโปรด กดดาวที่ท่าในคลังท่าได้เลย"}</p></section>
      </div>
    </div>`;
    app.querySelector("[data-savetoken]").addEventListener("click", async () => {
      const v = app.querySelector("[data-token]").value.trim(), m = app.querySelector("[data-tokmsg]");
      if (!v) return;
      const old = getToken();
      setToken(v);
      try { await send("POST", "/api/auth/check", {}); m.textContent = "จำรหัสแล้วค่ะ ✓"; setTimeout(() => draw(), 600); }
      catch (err) { setToken(old); m.textContent = "รหัสไม่ถูกต้อง ลองใหม่อีกครั้งนะคะ"; }
    });
    app.querySelector("[data-forget]")?.addEventListener("click", () => { setToken(""); draw(); });
  };
  draw();
}

// ---------- router ----------
let cachedCap = 145;
let lastDash = null;
async function router() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const at = (...ps) => ps.some((p) => hash.startsWith(p));
  const tab = at("/settings", "/sync") ? "settings" : at("/notes") ? "notes" : at("/runs", "/zones") ? "runs" : at("/plan", "/goal") ? "plan"
    : at("/strength", "/exercises") ? "strength" : at("/health", "/sleep") ? "health" : "home";
  document.querySelectorAll(".topbar [data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  charts.length = 0;
  if (leaveView) { leaveView(); leaveView = null; }
  try {
    const m = hash.match(/^\/runs\/(\d+)/);
    if (m) renderRun(await api(`/api/runs/${m[1]}`));
    else if (hash.startsWith("/runs/stats")) {
      const [d, h] = await Promise.all([api("/api/dashboard"), api("/api/health")]);
      renderRunStats(d, h);
      const hw = document.getElementById("heatwrap");
      if (hw) hw.scrollLeft = hw.scrollWidth;
    }
    else if (hash.startsWith("/zones")) renderZones(await api("/api/dashboard"));
    else if (hash.startsWith("/goal")) renderGoal(await api("/api/dashboard"));
    else if (hash.startsWith("/exercises")) renderExercises(await api("/api/workouts"));
    else if (tab === "runs") { const r = await api("/api/runs"); renderRuns(r.runs, r.zones, r.strava); }
    else if (tab === "plan") renderPlan(await api("/api/plan"));
    else if (tab === "notes") renderNotes(await api("/api/notes"));
    else if (hash.startsWith("/sync")) renderSync(await api("/api/ingest/status"));
    else if (hash.startsWith("/settings")) renderSettings(await api("/api/workouts"));
    else if (hash.startsWith("/strength")) {
      const parts = hash.split("/"); // ["", "strength", id|new, edit|p<planId>]
      const all = await api("/api/workouts");
      if (parts[2] === "go") {
        // Guided session: go/p<planId> | go/w<workoutId> | go/new. An unfinished one on this phone is resumed.
        const key = parts[3] || "new";
        let draft = loadDraft();
        if (draft && !draftMatches(draft, key) && draftSets(draft)) {
          if (confirm(`มีเวทที่ยังไม่กดจบ: ${draft.title} (${draftSets(draft)} เซ็ต)\n\nOK = เล่นอันนั้นต่อ\nยกเลิก = เริ่มอันใหม่ (เซ็ตเดิม${draft.id ? "บันทึกขึ้นเว็บแล้ว" : "จะหายไป"})`)) {
            location.hash = `#/strength/go/${draft.key}`; return;
          }
          draft = null;
        }
        if (!draftMatches(draft, key)) {
          let plan = null, existing = null;
          if (key.startsWith("p")) {
            plan = (await api("/api/plan")).workouts.find((x) => String(x.id) === key.slice(1)) || null;
            if (plan?.workout_id) existing = await api(`/api/workouts/${plan.workout_id}`).catch(() => null);
          } else if (key.startsWith("w")) {
            existing = await api(`/api/workouts/${key.slice(1)}`);
            plan = existing.planned;
          }
          draft = newSession({ key, plan, existing });
        }
        renderSession(draft, all);
      } else if (parts[2] === "new") {
        let plan = null;
        if (parts[3]?.startsWith("p")) plan = (await api("/api/plan")).workouts.find((x) => String(x.id) === parts[3].slice(1)) || null;
        const preset = parts[3] === "k-other" ? { kind: "other", title: "เดินเบา / ยืดเหยียด", duration: 20 } : null;
        renderWorkoutForm({ plan, all, preset });
      } else if (/^\d+$/.test(parts[2] || "")) {
        const d = await api(`/api/workouts/${parts[2]}`);
        if (parts[3] === "edit") renderWorkoutForm({ existing: d, plan: d.planned, all });
        else renderWorkoutView(d, all);
      } else renderStrength(all, parts[2] === "progress" ? "progress" : "log");
    }
    else if (hash.startsWith("/sleep")) {
      const d = await api("/api/sleep");
      const date = hash.split("/")[2] || d.nights[d.nights.length - 1]?.date;
      const nd = date ? await api(`/api/sleep/night/${date}`).catch(() => null) : null;
      renderSleep(d, nd);
    }
    else if (tab === "health") {
      const hd = await api("/api/health");
      renderHealth(hd);
      const wire = () => app.querySelectorAll("[data-hrange]").forEach((b) => b.addEventListener("click", () => {
        healthRange = b.dataset.hrange;
        const y = window.scrollY;
        charts.length = 0; renderHealth(hd); drawCharts(); wire(); window.scrollTo({ top: y });
      }));
      wire();
    }
    else {
      const d = await api("/api/dashboard");
      cachedCap = Number(d.profile.easy_hr_cap || 145);
      lastDash = d;
      renderHome(d);
      app.querySelectorAll(".week-dots .day").forEach((b) => b.addEventListener("click", () => {
        const day = b.dataset.day;
        openDay(day, d.this_week.planned.filter((p) => p.workout_date === day), d.this_week.runs.filter((r) => r.run_date === day));
      }));
      app.querySelectorAll("[data-upcoming]").forEach((b) => b.addEventListener("click", () => {
        const w = d.upcoming.find((x) => String(x.id) === b.dataset.upcoming);
        const sameDay = [...d.this_week.planned, ...d.upcoming].filter((x, i, a) => x.workout_date === w.workout_date && a.findIndex((y) => y.id === x.id) === i);
        openDay(w.workout_date, sameDay, d.this_week.runs.filter((r) => r.run_date === w.workout_date));
      }));
    }
    drawCharts();
    window.scrollTo({ top: 0 });
    const ph = document.querySelector(".phases"), cur = document.querySelector(".phase.current");
    if (ph && cur && ph.scrollWidth > ph.clientWidth) ph.scrollLeft = cur.offsetLeft - ph.offsetLeft;
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="err">โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชอีกครั้ง<br><span class="small muted">${esc(err.message)}</span></div>`;
  }
}
window.addEventListener("hashchange", router);
router();
