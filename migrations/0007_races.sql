-- Official races the athlete has run (past and planned)
CREATE TABLE races (
  id           INTEGER PRIMARY KEY,
  race_date    TEXT NOT NULL,
  name         TEXT NOT NULL,
  distance_km  REAL NOT NULL,     -- official course distance
  measured_km  REAL,              -- what the watch/phone recorded
  time_s       INTEGER,           -- finish time (null for future races)
  location     TEXT,
  source       TEXT,
  notes        TEXT
);
