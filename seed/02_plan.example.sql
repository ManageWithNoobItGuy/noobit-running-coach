-- Example of the long-range plan + the first workouts. The AI agent writes the real one for the athlete
-- (see README "Step 6"), as data/YYYY-MM-DD_initial-plan.sql, then applies it with
--   npx wrangler d1 execute running-journal-db --remote --file=data/YYYY-MM-DD_initial-plan.sql
-- Dates below are only examples. Explicit ids + INSERT OR REPLACE make the file safe to re-run.

-- ---------- phases: from journal_start to goal_race_date ----------
INSERT OR REPLACE INTO plan_phases
  (id, name, subtitle, start_date, end_date, focus, runs_per_week, weekly_km_from, weekly_km_to, long_run_km_from, long_run_km_to, key_sessions)
VALUES
  (1, 'สร้างฐาน', 'วิ่งสลับเดิน → วิ่งต่อเนื่อง 30 นาที', '2027-01-04', '2027-03-28',
   'วิ่ง 3 ครั้ง/สัปดาห์ ทุกครั้งเบา (Z2) ค่อยๆ ยืดช่วงวิ่งให้ยาวขึ้น', '3', 10, 18, 5, 8,
   json_array('Run/Walk', 'Easy run', 'Strength')),
  (2, 'ฐานแอโรบิก', 'วิ่งต่อเนื่อง 10 km ได้', '2027-03-29', '2027-06-20',
   'เพิ่มเวลาวิ่งต่อเนื่อง ใส่ strides ตอนท้าย', '3–4', 18, 28, 8, 14,
   json_array('Easy run', 'Long run', 'Strides')),
  (3, 'เฉพาะทาง', 'tempo + long run 16–18 km', '2027-06-21', '2027-10-10',
   'เพิ่ม tempo / hills ทีละน้อย long run ยาวขึ้นสัปดาห์ละไม่เกิน 1 km', '4', 25, 38, 14, 18,
   json_array('Tempo', 'Long run', 'Hills')),
  (4, 'เทเปอร์ + วันแข่ง', 'ลดปริมาณ คงความคม', '2027-10-11', '2027-11-07',
   'ลดระยะ 30–50% คงความเร็วสั้นๆ นอนให้พอ', '3', 15, 25, 8, 12,
   json_array('Easy run', 'Race pace', 'Race'));

-- ---------- milestones ----------
INSERT OR REPLACE INTO milestones (id, sort, title, description, target_date, achieved_date, run_id) VALUES
  (1, 1, 'วิ่งต่อเนื่องไม่หยุด 20 นาที', 'ไม่เดินเลย ที่เพซเบา', '2027-02-14', NULL, NULL),
  (2, 2, 'วิ่งต่อเนื่อง 5 km',          'จบ Phase 1',          '2027-03-28', NULL, NULL),
  (3, 3, 'Long run 10 km',              'วิ่งต่อเนื่องได้',      '2027-06-20', NULL, NULL),
  (4, 4, 'Long run 18 km',              'พร้อมสำหรับ 21.1',     '2027-10-10', NULL, NULL);

-- ---------- planned workouts: keep ~4 weeks of detailed rows ahead ----------
-- Every row needs purpose (why), prep (how to get ready), steps (warm-up → main set with HR zone → cool-down → after care), tips.
INSERT OR REPLACE INTO planned_workouts
  (id, workout_date, kind, title, details, target_km, target_min, target_pace, target_hr, purpose, prep, steps, tips, status, created_at, updated_at)
VALUES
  (1, '2027-01-04', 'runwalk', 'วิ่งสลับเดิน 30 นาที', NULL, NULL, 30, NULL, 'Z2 ≤ 141',
   'เริ่มสร้างฐานแอโรบิก ให้เอ็นและกระดูกปรับตัวกับแรงกระแทก',
   json_array('คืนก่อนนอนให้ได้ 7 ชม.', 'ดื่มน้ำ 1 แก้ว 30 นาทีก่อนออกวิ่ง',
              'Apple Watch: Workout → Outdoor Run → Custom: วอร์ม 5 นาที, วิ่ง 2 นาที / เดิน 1 นาที × 7, คูลดาวน์ 4 นาที; ตั้ง HR alert สูงสุด 141'),
   json_array('เดินเร็ว 5 นาที', 'วิ่งเบา 2 นาที (Z2) สลับเดิน 1 นาที × 7 รอบ', 'เดินคูลดาวน์ 4 นาที', 'ยืดน่อง-สะโพก 5 นาที'),
   json_array('ถ้า HR เกิน 141 ให้ชะลอหรือเดินจนลงมาก่อน', 'ช้าแค่ไหนก็ได้ ขอให้พูดเป็นประโยคได้'),
   'planned', datetime('now'), datetime('now')),
  (2, '2027-01-05', 'rest', 'พัก / เดินเบา 20 นาที', NULL, NULL, 20, NULL, 'Z1 < 130',
   'ให้ร่างกายซ่อมแซม streak ยังนับได้ถ้าเดินเบาหรือยืดเหยียด',
   json_array('ไม่ต้องเตรียมอะไรเป็นพิเศษ'),
   json_array('เดินสบายๆ 20 นาที', 'Foam roll น่องและต้นขา 5–10 นาที'),
   json_array('ไม่ต้องวิ่งชดเชยวันที่พลาดไปนะคะ'),
   'planned', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO plan_changes (id, changed_on, title, reason) VALUES
  (1, '2027-01-03', 'เริ่มแผน', 'แผนแรกจากข้อมูลตอนตั้งค่า: เป้าหมาย, HR พัก, ประวัติการวิ่ง');
