-- ingest_log now holds two kinds of Shortcut deliveries: the morning health metrics and runs.
ALTER TABLE ingest_log ADD COLUMN kind TEXT DEFAULT 'daily';  -- daily | run
