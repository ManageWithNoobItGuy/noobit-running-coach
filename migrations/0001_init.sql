-- Running Journal schema

-- Key/value settings: goal race, HR caps, athlete name...
CREATE TABLE profile (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- One row per activity (from Strava / Apple Watch screenshots)
CREATE TABLE runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date        TEXT NOT NULL,            -- YYYY-MM-DD, Bangkok time
  start_time      TEXT,                     -- HH:MM
  title           TEXT,
  run_type        TEXT,                     -- easy | runwalk | long | tempo | interval | test | race
  distance_km     REAL NOT NULL,
  moving_time_s   INTEGER NOT NULL,
  elapsed_time_s  INTEGER,
  avg_pace_s      INTEGER,                  -- seconds per km
  avg_hr          INTEGER,
  max_hr          INTEGER,
  calories        INTEGER,
  steps           INTEGER,
  cadence_spm     INTEGER,
  elev_gain_m     REAL,
  device          TEXT,
  source          TEXT DEFAULT 'strava',
  rpe             INTEGER,                  -- 1-10 perceived effort, if told
  feeling         TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_runs_date ON runs(run_date);

-- Per-km splits
CREATE TABLE splits (
  run_id       INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  split_no     INTEGER NOT NULL,
  distance_km  REAL NOT NULL,
  pace_s       INTEGER NOT NULL,
  avg_hr       INTEGER,
  elev_m       REAL,
  PRIMARY KEY (run_id, split_no)
);

-- Coach notes written by Claude: per run, per week, or about the plan
CREATE TABLE analyses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scope       TEXT NOT NULL,               -- run | week | plan
  run_id      INTEGER REFERENCES runs(id) ON DELETE CASCADE,
  week_start  TEXT,                        -- Monday YYYY-MM-DD for week notes
  title       TEXT NOT NULL,
  verdict     TEXT,                        -- one-line summary
  rating      INTEGER,                     -- 1-5 how well it fit the plan
  body_md     TEXT,                        -- longer text (light markdown)
  highlights  TEXT,                        -- JSON array of strings
  watchouts   TEXT,                        -- JSON array of strings
  next_steps  TEXT,                        -- JSON array of strings
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Long-range training phases
CREATE TABLE plan_phases (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  subtitle         TEXT,
  start_date       TEXT NOT NULL,
  end_date         TEXT NOT NULL,
  focus            TEXT,
  runs_per_week    TEXT,
  weekly_km_from   REAL,
  weekly_km_to     REAL,
  long_run_km_from REAL,
  long_run_km_to   REAL,
  key_sessions     TEXT                    -- JSON array of strings
);

-- Day-by-day workouts (detailed a few weeks ahead, adjusted weekly)
CREATE TABLE planned_workouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_date  TEXT NOT NULL,
  kind          TEXT NOT NULL,             -- easy | runwalk | long | strides | tempo | interval | test | race | strength | rest
  title         TEXT NOT NULL,
  details       TEXT,
  target_km     REAL,
  target_min    INTEGER,
  target_pace   TEXT,                      -- e.g. "8:45-9:30"
  target_hr     TEXT,                      -- e.g. "< 145"
  status        TEXT NOT NULL DEFAULT 'planned', -- planned | done | partial | skipped | moved
  run_id        INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_pw_date ON planned_workouts(workout_date);

-- Why the plan changed, so adjustments stay visible
CREATE TABLE plan_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_on  TEXT NOT NULL,
  title       TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Journey checkpoints toward the half marathon
CREATE TABLE milestones (
  id             INTEGER PRIMARY KEY,
  sort           INTEGER NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  target_date    TEXT,
  achieved_date  TEXT,
  run_id         INTEGER REFERENCES runs(id) ON DELETE SET NULL
);
