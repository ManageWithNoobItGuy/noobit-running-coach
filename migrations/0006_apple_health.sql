-- Apple Health import: workout details on runs, daily recovery metrics, running history by year.

ALTER TABLE runs ADD COLUMN hk_start TEXT;        -- Apple Health workout start timestamp (import key)
ALTER TABLE runs ADD COLUMN indoor INTEGER;       -- 1 = treadmill / indoor run
ALTER TABLE runs ADD COLUMN temp_c REAL;          -- weather at start (Apple Watch)
ALTER TABLE runs ADD COLUMN humidity INTEGER;     -- %
ALTER TABLE runs ADD COLUMN power_w REAL;         -- running dynamics (outdoor runs only)
ALTER TABLE runs ADD COLUMN stride_m REAL;
ALTER TABLE runs ADD COLUMN vert_osc_cm REAL;
ALTER TABLE runs ADD COLUMN gct_ms REAL;
CREATE UNIQUE INDEX idx_runs_hk ON runs(hk_start);

CREATE TABLE daily_metrics (
  date        TEXT PRIMARY KEY,
  resting_hr  REAL,
  hrv         REAL,      -- SDNN ms, daily mean
  vo2max      REAL,
  walking_hr  REAL,
  resp_rate   REAL,      -- breaths/min during sleep
  hrr1        REAL,      -- heart-rate recovery after 1 min
  spo2        REAL,
  steps       INTEGER,
  sleep_min   INTEGER,   -- asleep minutes for the night ending on this date
  deep_min    INTEGER,
  rem_min     INTEGER
);

CREATE TABLE running_years (
  year            INTEGER PRIMARY KEY,
  runs            INTEGER,
  km              REAL,
  longest_km      REAL,
  longest_date    TEXT,
  longest_time_s  INTEGER,
  best_pace_s     INTEGER   -- best average pace on runs ≥ 3 km
);
