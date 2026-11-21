-- Strava sync

ALTER TABLE runs ADD COLUMN strava_id INTEGER;
CREATE UNIQUE INDEX idx_runs_strava ON runs(strava_id);

-- Downsampled time series for the full pace / HR graphs
CREATE TABLE run_streams (
  run_id  INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  points  TEXT NOT NULL            -- JSON {d:[km], t:[s], hr:[bpm], v:[m/s], cad:[spm], alt:[m]}
);

-- Non-running Strava activities (weight training, walks...) — used for week dots
CREATE TABLE other_activities (
  strava_id      INTEGER PRIMARY KEY,
  activity_date  TEXT NOT NULL,
  start_time     TEXT,
  sport_type     TEXT,
  name           TEXT,
  moving_time_s  INTEGER,
  distance_km    REAL,
  avg_hr         INTEGER
);
CREATE INDEX idx_other_date ON other_activities(activity_date);

-- Single row (id = 1): the connected Strava account
CREATE TABLE strava_auth (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  athlete_id       INTEGER,
  athlete_name     TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  expires_at       INTEGER,
  scope            TEXT,
  verify_token     TEXT,
  subscription_id  INTEGER,
  backfill_done    INTEGER DEFAULT 0,
  last_sync_at     TEXT,
  last_sync_note   TEXT
);

INSERT OR REPLACE INTO profile (key, value) VALUES ('strava_backfill_from', '2026-08-01');
