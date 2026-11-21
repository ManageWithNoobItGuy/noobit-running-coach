-- Strength / gym workouts logged in the web app (sets, reps, weight) + Apple Watch data from the run Shortcut.
CREATE TABLE workouts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_date   TEXT NOT NULL,            -- YYYY-MM-DD Bangkok
  start_time     TEXT,                     -- HH:MM
  kind           TEXT DEFAULT 'strength',  -- strength | mobility | other
  title          TEXT,
  duration_min   INTEGER,
  rpe            INTEGER,
  notes          TEXT,
  planned_id     INTEGER,                  -- planned_workouts.id it fulfils
  source         TEXT DEFAULT 'app',       -- app | watch | chat
  watch_start_ms INTEGER,                  -- Apple Watch session (from the run Shortcut)
  watch_secs     INTEGER,
  avg_hr         INTEGER,
  max_hr         INTEGER,
  calories       INTEGER,
  hr             TEXT,                     -- JSON [[offsetMin, bpm]] downsampled
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT
);
CREATE INDEX idx_workouts_date ON workouts(workout_date);

CREATE TABLE workout_sets (
  workout_id  INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  set_no      INTEGER NOT NULL,            -- order within the workout
  exercise    TEXT NOT NULL,               -- exercises.js id, or "custom:<name>"
  reps        INTEGER,
  weight_kg   REAL,                        -- NULL / 0 = bodyweight
  secs        INTEGER,                     -- timed holds (plank)
  PRIMARY KEY (workout_id, set_no)
);

ALTER TABLE analyses ADD COLUMN workout_id INTEGER;
ALTER TABLE planned_workouts ADD COLUMN workout_id INTEGER;
