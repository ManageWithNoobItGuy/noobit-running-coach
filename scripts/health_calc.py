"""Shared maths for turning Apple Health workout samples into splits and streams."""
import bisect


def cumulative(dist, total_km):
    """dist: [(start_s, end_s, km)] → sorted (t, cum_km) points scaled to the workout total."""
    pts, cum = [(0.0, 0.0)], 0.0
    for _s, e, km in sorted(dist, key=lambda x: x[1]):
        cum += km
        pts.append((e, cum))
    if cum > 0 and total_km:
        f = total_km / cum
        pts = [(t, c * f) for t, c in pts]
    return pts


def dist_at(pts, t):
    ts = [p[0] for p in pts]
    i = bisect.bisect_right(ts, t)
    if i == 0: return 0.0
    if i >= len(pts): return pts[-1][1]
    (t0, d0), (t1, d1) = pts[i - 1], pts[i]
    return d0 + (d1 - d0) * (t - t0) / (t1 - t0) if t1 > t0 else d1


def time_at(pts, d):
    """First time cumulative distance reaches d (linear interpolation)."""
    for (t0, d0), (t1, d1) in zip(pts, pts[1:]):
        if d1 >= d > d0 or (d1 >= d and d0 == d):
            return t0 + (t1 - t0) * (d - d0) / (d1 - d0) if d1 > d0 else t1
    return pts[-1][0]


def hr_at(hr, t, max_gap=30):
    ts = [h[0] for h in hr]
    i = bisect.bisect_right(ts, t) - 1
    if i < 0: return hr[0][1] if hr and hr[0][0] - t < max_gap else None
    return hr[i][1] if t - hr[i][0] <= max_gap else None


def avg_hr(hr, t0, t1, step=2):
    vals = [v for v in (hr_at(hr, t) for t in frange(t0, t1, step)) if v]
    return round(sum(vals) / len(vals)) if vals else None


def frange(a, b, s):
    t = a
    while t < b:
        yield t
        t += s


def splits(pts, hr, total_km, cad=None):
    out, prev_t, k = [], 0.0, 1
    while k <= total_km + 1e-9:
        t = time_at(pts, k)
        out.append({"n": k, "km": 1.0, "pace": round(t - prev_t), "hr": avg_hr(hr, prev_t, t), "cad": cadence_between(cad, prev_t, t)})
        prev_t, k = t, k + 1
    rest = round(total_km - (k - 1), 2)
    if rest >= 0.05:
        t_end = pts[-1][0]
        out.append({"n": k, "km": rest, "pace": round((t_end - prev_t) / rest), "hr": avg_hr(hr, prev_t, t_end),
                    "cad": cadence_between(cad, prev_t, t_end)})
    return out


# ---- cadence from Apple Watch step samples ----
# During a workout the Watch writes a StepCount sample every ~2.5 s. Single samples are too coarse (7 steps in 2 or 3 s
# reads 140 or 210 spm), so steps are spread over 15-s bins. A bin at 140+ spm is running, below that walking or standing.
# Validated on the 1 and 3 Nov 2026 runs: 167-171 spm running, 10/15/30-s bins agree within 2 spm.
CAD_BIN = 15
RUN_CAD = 140


def cadence_bins(steps, duration_s, w=CAD_BIN):
    """steps: [(start_s, end_s, n)] relative to the run start → spm per w-second bin, or None if the samples are sparse."""
    dense = [x for x in steps if x[1] - x[0] <= 60 and x[1] > 0 and x[0] < duration_s]
    if len(dense) < 50: return None
    n = max(1, int(duration_s // w) + (1 if duration_s % w >= 5 else 0))
    bins = [0.0] * n
    for s, e, v in dense:
        if e <= s:
            k = int(s // w)
            if 0 <= k < n: bins[k] += v
            continue
        t = s
        while t < e:
            k = int(t // w); nxt = min(e, (k + 1) * w)
            if 0 <= k < n: bins[k] += v * (nxt - t) / (e - s)
            t = nxt
    return [b * 60 / min(w, duration_s - i * w) for i, b in enumerate(bins)]


def cadence_summary(cad, pts, duration_s, w=CAD_BIN):
    """Running cadence (mean of running bins), all steps, metres per step while running."""
    if not cad: return None
    run = [i for i, c in enumerate(cad) if c >= RUN_CAD]
    total = round(sum(c * min(w, duration_s - i * w) / 60 for i, c in enumerate(cad)))
    if len(run) < 4: return {"cad": None, "steps": total, "stride": None}
    run_steps = sum(cad[i] * w / 60 for i in run)
    run_km = sum(dist_at(pts, (i + 1) * w) - dist_at(pts, i * w) for i in run) if pts else 0
    return {"cad": round(sum(cad[i] for i in run) / len(run)), "steps": total,
            "stride": round(run_km * 1000 / run_steps, 2) if run_km and run_steps else None}


def cadence_between(cad, t0, t1, w=CAD_BIN):
    """Running cadence of the bins centred in [t0, t1); None with under a minute of running."""
    if not cad: return None
    run = [c for i, c in enumerate(cad) if t0 <= (i + 0.5) * w < t1 and c >= RUN_CAD]
    return round(sum(run) / len(run)) if len(run) >= 4 else None


def stream(pts, hr, duration_s, n=300, cad=None):
    step = max(5.0, duration_s / n)
    d, t, h, v, c = [], [], [], [], []
    for x in frange(0, duration_s, step):
        a, b = max(0, x - 15), min(duration_s, x + 15)
        speed = (dist_at(pts, b) - dist_at(pts, a)) * 1000 / (b - a) if b > a else 0
        t.append(round(x)); d.append(round(dist_at(pts, x), 3)); h.append(hr_at(hr, x)); v.append(round(speed, 2))
        if cad:  # mean of the bins centred within ±15 s
            near = [cv for i, cv in enumerate(cad) if a <= (i + 0.5) * CAD_BIN <= b] or [cad[min(len(cad) - 1, int(x // CAD_BIN))]]
            c.append(round(sum(near) / len(near)))
    # forward-fill missing HR so charts stay continuous
    last = next((x for x in h if x), None)
    for i, x in enumerate(h):
        if x: last = x
        else: h[i] = last
    out = {"t": t, "d": d, "hr": [round(x) if x else None for x in h], "v": v}
    if cad: out["cad"] = c
    return out


def walk_share(v):
    return sum(1 for x in v if x < 1000 / 660) / len(v) if v else 0
