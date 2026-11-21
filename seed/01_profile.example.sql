-- Profile of the athlete. Copy to data/YYYY-MM-DD_profile.sql, replace every {{...}} value,
-- then apply:  npx wrangler d1 execute running-journal-db --remote --file=data/YYYY-MM-DD_profile.sql
--
-- HR maths (Karvonen): max_hr = 208 - 0.7 x age (estimate, unless measured)
--   Z1 < resting + 0.6 x (max - resting) ... easy_hr_cap = top of Z2 = resting + 0.7 x (max - resting), rounded down.
-- Do not use ASCII apostrophes in Thai text (double them if needed: '').

INSERT INTO profile (key, value) VALUES
  ('athlete_name',        '{{full name}}'),
  ('athlete_nickname',    '{{what the coach calls the athlete, e.g. พี่โอ๊ต / น้องมิ้น}}'),
  ('age',                 '{{age in years, e.g. 35}}'),
  ('max_hr',              '{{max HR, e.g. 184}}'),
  ('resting_hr',          '{{resting HR from Apple Health, e.g. 60}}'),
  ('resting_hr_assumed',  '{{0 if measured, 1 if guessed}}'),
  ('easy_hr_cap',         '{{top of Z2, see formula above}}'),
  ('goal_race_name',      '{{e.g. Half Marathon 21.1 km}}'),
  ('goal_race_date',      '{{YYYY-MM-DD}}'),
  ('goal_a',              '{{goal A, e.g. จบ 21.1 km แบบไม่เจ็บ}}'),
  ('goal_b',              '{{goal B, e.g. ต่ำกว่า 2:30 ชม.}}'),
  ('goal_c',              '{{goal C, e.g. ต่ำกว่า 2:15 ชม.}}'),
  ('journal_start',       '{{YYYY-MM-DD, the day the plan starts (usually today)}}'),
  ('coach_name',          'แพร'),
  ('timezone',            'Asia/Bangkok')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

-- Optional: personal best for the goal distance (shown on the goal page)
-- INSERT INTO profile (key, value) VALUES ('hm_pb', '{{2:20:00 · race name year}}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
