"""Per-night sleep from an Apple Health export → SQL upserts for daily_metrics sleep columns.

usage: python3 -I scripts/extract_sleep_nights.py <export.xml> <out.sql> [--from 2025-11-01] [--detail <detail.sql>]

--detail also writes the per-night timeline (stage segments + Watch heart rate) for the sleep_detail table.

Same rules as sleepNights() in src/ingest.ts: Apple Watch samples only, a 3 h+ gap starts a new night,
overlaps are merged, the night is filed under its wake-up date, and naps never replace the main night.
"""
import sys, json, bisect, xml.etree.ElementTree as ET
from datetime import datetime, timedelta

src, out = sys.argv[1], sys.argv[2]
FROM = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else "2025-11-01"
DETAIL = sys.argv[sys.argv.index("--detail") + 1] if "--detail" in sys.argv else None
CODE = {"awake": 0, "rem": 1, "core": 2, "deep": 3, "asleep": 4}
FMT = "%Y-%m-%d %H:%M:%S %z"
KIND = {"AsleepCore": "core", "AsleepDeep": "deep", "AsleepREM": "rem", "AsleepUnspecified": "asleep", "Asleep": "asleep", "Awake": "awake"}

samples = []
for _, el in ET.iterparse(src, events=("end",)):
    if el.tag == "Record" and el.get("type") == "HKCategoryTypeIdentifierSleepAnalysis" and el.get("startDate", "") >= FROM:
        if "Watch" in (el.get("sourceName") or ""):
            k = KIND.get((el.get("value") or "").replace("HKCategoryValueSleepAnalysis", ""))
            if k:
                s, e = datetime.strptime(el.get("startDate"), FMT), datetime.strptime(el.get("endDate"), FMT)
                if e > s:
                    samples.append((s, e, k))
    if el.tag in ("Record", "Workout", "ActivitySummary"):
        el.clear()

samples.sort()
groups, end = [], None
for x in samples:
    if end is None or x[0] - end > timedelta(hours=3):
        groups.append([])
    groups[-1].append(x)
    end = max(end, x[1]) if end else x[1]


def merged(items):
    total, cur = timedelta(), None
    for s, e, _ in sorted(items):
        if cur and s <= cur[1]:
            cur[1] = max(cur[1], e)
        else:
            if cur: total += cur[1] - cur[0]
            cur = [s, e]
    if cur: total += cur[1] - cur[0]
    return total


nights = {}
for g in groups:
    asleep = [x for x in g if x[2] != "awake"]
    if not asleep:
        continue
    bed, wake = min(x[0] for x in asleep), max(x[1] for x in asleep)
    mins = lambda td: round(td.total_seconds() / 60)
    total = mins(merged(asleep))
    if total <= 30:
        continue
    stage = lambda k: mins(sum((x[1] - x[0] for x in asleep if x[2] == k), timedelta()))
    awake = mins(merged([x for x in g if x[2] == "awake" and x[0] >= bed and x[1] <= wake]))
    n = {"date": wake.strftime("%Y-%m-%d"), "sleep_min": total, "deep_min": stage("deep"), "rem_min": stage("rem"),
         "core_min": stage("core"), "awake_min": awake, "bed_time": bed.strftime("%H:%M"), "wake_time": wake.strftime("%H:%M")}
    n["_bed"], n["_wake"] = bed, wake
    n["_segments"] = [[round((x[0] - bed).total_seconds() / 60, 1), round((x[1] - bed).total_seconds() / 60, 1), CODE[x[2]]]
                      for x in g if x[0] >= bed - timedelta(minutes=1) and x[1] <= wake + timedelta(minutes=1)]
    if n["date"] not in nights or total > nights[n["date"]]["sleep_min"]:
        nights[n["date"]] = n

cols = ["sleep_min", "deep_min", "rem_min", "core_min", "awake_min", "bed_time", "wake_time"]
q = lambda v: "NULL" if v is None else (f"'{v}'" if isinstance(v, str) else str(v))
with open(out, "w") as f:
    f.write("-- Per-night sleep from Apple Health export (scripts/extract_sleep_nights.py). Safe to re-run.\n")
    for n in sorted(nights.values(), key=lambda n: n["date"]):
        f.write(f"INSERT INTO daily_metrics (date, {', '.join(cols)}) VALUES ({q(n['date'])}, {', '.join(q(n[c]) for c in cols)}) "
                f"ON CONFLICT(date) DO UPDATE SET {', '.join(f'{c} = excluded.{c}' for c in cols)};\n")
print(len(samples), "samples →", len(nights), "nights →", out)

if DETAIL:
    # Second pass: Watch heart rate inside each night window (15 min margin).
    wins = sorted((n["_bed"] - timedelta(minutes=15), n["_wake"] + timedelta(minutes=15), n["date"]) for n in nights.values())
    starts = [w[0] for w in wins]
    hr = {n["date"]: [] for n in nights.values()}
    for _, el in ET.iterparse(src, events=("end",)):
        if el.tag == "Record" and el.get("type") == "HKQuantityTypeIdentifierHeartRate" and el.get("startDate", "") >= FROM \
                and "Watch" in (el.get("sourceName") or ""):
            t = datetime.strptime(el.get("startDate"), FMT)
            i = bisect.bisect_right(starts, t) - 1
            if i >= 0 and wins[i][0] <= t <= wins[i][1]:
                n = nights[wins[i][2]]
                hr[n["date"]].append([round((t - n["_bed"]).total_seconds() / 60, 1), round(float(el.get("value")))])
        if el.tag in ("Record", "Workout", "ActivitySummary"):
            el.clear()
    with open(DETAIL, "w") as f:
        f.write("-- Per-night sleep timeline from Apple Health export (scripts/extract_sleep_nights.py --detail). Safe to re-run.\n")
        for n in sorted(nights.values(), key=lambda n: n["date"]):
            seg = json.dumps(n["_segments"], separators=(",", ":"))
            h = json.dumps(sorted(hr[n["date"]]), separators=(",", ":")) if hr[n["date"]] else None
            f.write(f"INSERT OR REPLACE INTO sleep_detail (date, start_ms, segments, hr) VALUES ('{n['date']}', {int(n['_bed'].timestamp() * 1000)}, '{seg}', {q(h)});\n")
    print("timeline →", DETAIL, "| nights with HR:", sum(1 for v in hr.values() if v))
