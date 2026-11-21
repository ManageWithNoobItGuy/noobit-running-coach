-- Cadence (steps per minute while running) per km split, from Apple Watch step samples.
-- runs.cadence_spm / steps / stride_m already exist; run_streams.points gains a "cad" array (spm per stream point).
ALTER TABLE splits ADD COLUMN cadence_spm INTEGER;
