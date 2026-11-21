-- Detailed day instructions for planned workouts
ALTER TABLE planned_workouts ADD COLUMN purpose TEXT;  -- why this session
ALTER TABLE planned_workouts ADD COLUMN steps TEXT;    -- JSON array: step-by-step what to do
ALTER TABLE planned_workouts ADD COLUMN tips TEXT;     -- JSON array: before/after tips
