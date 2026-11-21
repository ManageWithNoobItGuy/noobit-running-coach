-- Raw payloads from the iOS Shortcut (last 60 kept) — used to check/adjust parsing.
CREATE TABLE ingest_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at  TEXT NOT NULL,
  ok           INTEGER,
  summary      TEXT,
  payload      TEXT
);
