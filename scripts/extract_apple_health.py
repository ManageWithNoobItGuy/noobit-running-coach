# Extract a compact dataset from an Apple Health export.xml (streamed, two passes).
import sys, json, bisect, collections, xml.etree.ElementTree as ET
from datetime import datetime, timedelta

path, out = sys.argv[1], sys.argv[2]
DETAIL_FROM = "2026-01-01"   # per-sample detail for runs from here
DAILY_FROM = sys.argv[sys.argv.index("--daily-from") + 1] if "--daily-from" in sys.argv else "2025-11-01"  # daily metrics window
FMT = "%Y-%m-%d %H:%M:%S %z"
def ts(s): return datetime.strptime(s, FMT)
Q = "HKQuantityTypeIdentifier"

# ---------- pass 1: workouts ----------
workouts = []
for ev, el in ET.iterparse(path, events=("end",)):
    if el.tag == "Workout":
        w = {"type": el.get("workoutActivityType").replace("HKWorkoutActivityType", ""),
             "start": el.get("startDate"), "end": el.get("endDate"),
             "duration_min": float(el.get("duration") or 0), "source": el.get("sourceName")}
        for s in el.findall("WorkoutStatistics"):
            t = s.get("type").replace(Q, "")
            w[t] = {k: s.get(k) for k in ("sum", "average", "minimum", "maximum", "unit") if s.get(k)}
        w["meta"] = {m.get("key"): m.get("value") for m in el.findall("MetadataEntry")}
        r = el.find("WorkoutRoute")
        fr = r.find("FileReference") if r is not None else None
        w["route"] = fr.get("path") if fr is not None else None
        workouts.append(w)
        el.clear()
    elif el.tag == "Record":
        el.clear()

runs = [w for w in workouts if w["type"] == "Running"]
detail = [w for w in runs if w["start"][:10] >= DETAIL_FROM]
wins = sorted([(ts(w["start"]), ts(w["end"]), i) for i, w in enumerate(detail)])
for w in detail:
    w["hr"], w["dist"], w["steps"], w["dyn"] = [], [], [], collections.defaultdict(list)
starts = [x[0] for x in wins]

def find_win(t):
    i = bisect.bisect_right(starts, t) - 1
    if i >= 0 and wins[i][0] <= t <= wins[i][1]: return detail[wins[i][2]], wins[i][0]
    return None, None

# ---------- pass 2: records ----------
daily = collections.defaultdict(lambda: collections.defaultdict(list))
steps = collections.defaultdict(lambda: collections.defaultdict(float))
sleep = collections.defaultdict(lambda: collections.defaultdict(float))
weights = []
DYN = {"RunningPower", "RunningStrideLength", "RunningVerticalOscillation", "RunningGroundContactTime", "RunningSpeed"}
units = {}
for ev, el in ET.iterparse(path, events=("end",)):
    if el.tag != "Record":
        if el.tag in ("Workout", "ActivitySummary"): el.clear()
        continue
    ty = el.get("type"); sd = el.get("startDate"); day = sd[:10]
    short = ty.replace(Q, "").replace("HKCategoryTypeIdentifier", "")
    src = el.get("sourceName") or ""
    if short in ("HeartRate", "DistanceWalkingRunning", "StepCount") or short in DYN:
        t0 = ts(sd)
        w, ws = find_win(t0)
        if w is not None:
            v = float(el.get("value"))
            if short == "HeartRate": w["hr"].append(((t0 - ws).total_seconds(), v))
            elif short == "DistanceWalkingRunning":
                if "Watch" in src: w["dist"].append(((t0 - ws).total_seconds(), (ts(el.get("endDate")) - ws).total_seconds(), v))
            elif short == "StepCount":  # cadence (health_calc.cadence_bins)
                if "Watch" in src: w["steps"].append(((t0 - ws).total_seconds(), (ts(el.get("endDate")) - ws).total_seconds(), v))
            else:
                w["dyn"][short].append(v); units[short] = el.get("unit")
    if day >= DAILY_FROM or short == "BodyMass":
        if short in ("RestingHeartRate", "HeartRateVariabilitySDNN", "VO2Max", "WalkingHeartRateAverage",
                     "RespiratoryRate", "HeartRateRecoveryOneMinute", "OxygenSaturation"):
            daily[day][short].append(float(el.get("value")))
        elif short == "StepCount":
            steps[day]["watch" if "Watch" in src else "phone"] += float(el.get("value"))
        elif short == "SleepAnalysis" and "Watch" in src and "Asleep" in (el.get("value") or ""):
            end = ts(el.get("endDate")); mins = (end - ts(sd)).total_seconds() / 60
            sleep[end.strftime("%Y-%m-%d")][el.get("value").replace("HKCategoryValueSleepAnalysis", "")] += mins
        elif short == "BodyMass":
            weights.append((day, float(el.get("value")), el.get("unit")))
    el.clear()

# ---------- build ----------
days = sorted(set(daily) | set(steps) | set(sleep))
daily_out = []
for d in days:
    if d < DAILY_FROM: continue
    m = daily.get(d, {}); avg = lambda k: round(sum(m[k]) / len(m[k]), 1) if m.get(k) else None
    sl = sleep.get(d, {})
    daily_out.append({"date": d, "resting_hr": avg("RestingHeartRate"), "hrv": avg("HeartRateVariabilitySDNN"),
        "vo2max": avg("VO2Max"), "walking_hr": avg("WalkingHeartRateAverage"), "resp_rate": avg("RespiratoryRate"),
        "hrr1": avg("HeartRateRecoveryOneMinute"), "spo2": avg("OxygenSaturation"),
        "steps": round(max(steps[d].values())) if d in steps else None,
        "sleep_min": round(sum(sl.values())) if sl else None,
        "deep_min": round(sl.get("AsleepDeep", 0)) if sl else None, "rem_min": round(sl.get("AsleepREM", 0)) if sl else None})

def clean(w):
    o = {k: v for k, v in w.items() if k not in ("hr", "dist", "steps", "dyn")}
    if "hr" in w:
        o["hr"] = sorted(w["hr"]); o["dist"] = sorted(w["dist"]); o["steps"] = sorted(w["steps"])
        o["dyn"] = {k: round(sum(v) / len(v), 3) for k, v in w["dyn"].items() if v}
    return o

json.dump({"workouts": [clean(w) for w in workouts], "daily": daily_out, "weights": weights, "units": units}, open(out, "w"))
print("workouts", len(workouts), "runs", len(runs), "detailed runs", len(detail), "daily", len(daily_out), "units", units)
