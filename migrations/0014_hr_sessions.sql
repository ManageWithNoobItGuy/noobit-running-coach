-- Heart-rate sessions from Apple Health that a strength / mobility log can be linked to (also after the fact).
-- Sources: the run Shortcut (Watch workouts, with kcal), the morning Shortcut (dense HR clusters from yesterday's
-- heart-rate samples) and the Apple Health export (other_activities rows, average HR only — copied in when linked).
CREATE TABLE hr_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_ms   INTEGER NOT NULL,
  secs       INTEGER NOT NULL,
  avg_hr     INTEGER,
  max_hr     INTEGER,
  kcal       INTEGER,
  hr         TEXT,                 -- JSON [[offsetMin, bpm]] ~every 30 s
  source     TEXT NOT NULL,        -- watch | daily | export
  sport      TEXT,                 -- export workout type (FunctionalStrengthTraining, Walking…)
  ref        INTEGER,              -- other_activities.strava_id for export rows
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_hr_sessions_start ON hr_sessions(start_ms);

ALTER TABLE workouts ADD COLUMN hr_session_id INTEGER;

-- Watch data already attached to workouts becomes a session too.
INSERT INTO hr_sessions (start_ms, secs, avg_hr, max_hr, kcal, hr, source)
  SELECT watch_start_ms, watch_secs, avg_hr, max_hr, calories, hr, 'watch' FROM workouts WHERE watch_start_ms IS NOT NULL;
UPDATE workouts SET hr_session_id = (SELECT s.id FROM hr_sessions s WHERE s.start_ms = workouts.watch_start_ms LIMIT 1)
  WHERE watch_start_ms IS NOT NULL;
