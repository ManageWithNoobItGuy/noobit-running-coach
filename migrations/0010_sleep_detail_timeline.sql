-- Per-night timeline for the sleep-night view (hypnogram + sleeping heart rate).
CREATE TABLE sleep_detail (
  date      TEXT PRIMARY KEY,   -- wake-up date, same key as daily_metrics
  start_ms  INTEGER NOT NULL,   -- epoch ms of falling asleep (offset 0)
  segments  TEXT NOT NULL,      -- JSON [[startMin, endMin, code]] code: 0 awake, 1 REM, 2 core, 3 deep, 4 asleep (unspecified)
  hr        TEXT                -- JSON [[offsetMin, bpm]] heart rate during the night, if known
);
