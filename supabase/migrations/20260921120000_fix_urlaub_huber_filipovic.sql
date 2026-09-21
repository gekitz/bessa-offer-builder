-- ════════════════════════════════════════════════════════════════════
-- HR correction to the go-live "STAND 16-09-2026" Resturlaub figures.
--
-- The go-live seed (20260917120100) recorded the paper snapshot, which was
-- one day too high for two people — each had a pre-snapshot vacation day
-- that was never netted out:
--
--   Anton Huber  (ahuber)     11.9.2026 → 26.0 should have been 25.0
--   Pavo Filipovic (pfilipovic) 7.9.2026 → 21.0 should have been 20.0
--
-- Consistent with the go-live convention (pre-snapshot taken days are
-- netted into `entitled`, historical leave_requests are NOT stored), we
-- correct `entitled` by -1 on the current Arbeitsjahr urlaub row so
-- `remaining` displays the true figure (25.0 / 20.0).
--
-- Idempotent: sets absolute values keyed by employee code, guarded so it
-- only touches the rows still at the un-corrected value. Safe on replay
-- and independent of the nightly accrual (both resets are in 2027).
-- ════════════════════════════════════════════════════════════════════

WITH corrections (code, old_entitled, new_entitled) AS (
  VALUES
    ('ahuber',     26.0, 25.0),
    ('pfilipovic', 21.0, 20.0)
),
updated AS (
  UPDATE leave_balances lb
  SET entitled = c.new_entitled,
      updated_at = now()
  FROM corrections c
  JOIN employees e ON e.code = c.code
  WHERE lb.employee_id = e.id
    AND lb.leave_type_id = 1
    AND lb.entitled = c.old_entitled
  RETURNING lb.employee_id, c.code, c.old_entitled, c.new_entitled
)
INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
SELECT 'balance.corrected', 'employee', u.employee_id, jsonb_build_object(
  'reason',        'HR correction: pre-snapshot vacation day not netted in go-live figure',
  'code',          u.code,
  'old_entitled',  u.old_entitled,
  'new_entitled',  u.new_entitled
)
FROM updated u;
