-- Exact time in each HR zone, read from the Apple Fitness "Heart Rate Zones" screen.
-- JSON array of 5 numbers: seconds in Z1..Z5. When set, it overrides the estimate from splits.
ALTER TABLE runs ADD COLUMN zone_secs TEXT;
