-- Corrections to the v1 paper-roster seed (20260508130000):
--   * Hr. Klein → Marcel Klein (real employee, Standort Klagenfurt).
--   * Fr. Mera no longer with the company. Every shift previously
--     assigned to Mera moves to Herbert Kitz; Mera is removed from
--     the active rotation and her employee row is deactivated. The
--     row is kept (not deleted) so the prior audit-log references
--     remain valid.

-- ============================================================
--  Klein → Marcel Klein
-- ============================================================

UPDATE employees
SET    name = 'Marcel Klein'
WHERE  code = 'klein';

-- ============================================================
--  Mera's shifts → Herbert Kitz
-- ============================================================
-- Reassign every shift Mera currently holds (assigned or pending swap)
-- to Herbert Kitz (hkitz). swap_pending rows are touched too, since
-- "Mera no longer exists" implies any pending swap she was part of
-- was decided in her absence.

WITH mera AS (SELECT id FROM employees WHERE code = 'mera'),
     father AS (SELECT id FROM employees WHERE code = 'hkitz')
UPDATE shifts s
SET    employee_id = (SELECT id FROM father),
       updated_at  = NOW()
WHERE  s.employee_id = (SELECT id FROM mera);

-- Audit-log the bulk reassignment.
INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
SELECT 'shift.bulk_reassign',
       'employee',
       m.id,
       jsonb_build_object(
         'from_code', 'mera',
         'to_code',   'hkitz',
         'reason',    'Mera no longer with the company; coverage taken over by Herbert Kitz'
       )
FROM   employees m
WHERE  m.code = 'mera';

-- ============================================================
--  Roster: drop Mera, slot Herbert into her position
-- ============================================================
-- Mera was at position 4 in the rotation. Herbert (hkitz) takes that
-- slot. Other roster entries (positions 1, 2, 3, 5, 6, 7) keep their
-- order so the round-robin continues without surprise jumps.

DELETE FROM shift_roster
WHERE  employee_id = (SELECT id FROM employees WHERE code = 'mera');

INSERT INTO shift_roster (employee_id, position, active)
SELECT id, 4, TRUE FROM employees WHERE code = 'hkitz'
ON CONFLICT (employee_id) DO UPDATE
  SET position = 4,
      active   = TRUE;

-- ============================================================
--  Deactivate Mera's employee row
-- ============================================================
-- Marking inactive (rather than deleting) keeps her id valid for
-- the prior audit-log entries. listEmployees({activeOnly:true})
-- already filters her out of UI dropdowns.

UPDATE employees SET active = FALSE WHERE code = 'mera';
