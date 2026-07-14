-- ════════════════════════════════════════════════════════════════════
-- Roster cleanup to match the 2025 company directory:
--   + add Dorothea Kitz (Buchhaltung, Wolfsberg, DW 16, kd@kitz.co.at)
--   − remove the stale "Fr. Mera" placeholder (inactive; her slot was
--     already superseded by Marcel Klein in 20260508140000).
--
-- Phone = Wolfsberg base 04352 4176 + DW 16. Not an offer creator, so
-- team_slug stays NULL. Other columns fall back to their defaults
-- (weekly_hours 38.5, employment_type 'fulltime', active TRUE).
-- ════════════════════════════════════════════════════════════════════

INSERT INTO employees (code, name, email, phone, job_title, standort_id)
VALUES ('dkitz', 'Dorothea Kitz', 'kd@kitz.co.at', '+43 4352 4176 16', 'Buchhaltung', 2)
ON CONFLICT (code) DO NOTHING;

DELETE FROM employees WHERE code = 'mera';
