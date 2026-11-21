-- Sleep detail per night (filed under the wake-up date)
ALTER TABLE daily_metrics ADD COLUMN core_min INTEGER;
ALTER TABLE daily_metrics ADD COLUMN awake_min INTEGER;   -- awake time between falling asleep and final wake
ALTER TABLE daily_metrics ADD COLUMN bed_time TEXT;       -- HH:MM first asleep (Bangkok)
ALTER TABLE daily_metrics ADD COLUMN wake_time TEXT;      -- HH:MM last asleep
