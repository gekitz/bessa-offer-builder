-- Seed the 2026 H1 weekend/holiday duty schedule from the v1 paper
-- roster on the office door. Assignments cover KW1 through KW26
-- (01.01.2026 → 28.06.2026). Anything after KW26 is left unassigned —
-- admins fill the rest of the year via "Rest auffüllen".
--
-- Two new employees are introduced as PLACEHOLDERS:
--   * Hr. Klein  (code 'klein')  — appears as the second person in
--     the rotation on the paper schedule.
--   * Fr. Mera   (code 'mera')   — appears as the fourth person.
-- Both are added with default Klagenfurt / fulltime / 38.5h details
-- so the foreign keys resolve. HR should update name + standort_id
-- + birth_date / hire_date + weekly_hours via the admin UI once the
-- real records are confirmed.

-- ============================================================
--  Placeholder employees (Klein, Mera)
-- ============================================================

INSERT INTO employees (code, name, standort_id, employment_type, weekly_hours)
VALUES
  ('klein', 'Hr. Klein', 1, 'fulltime', 38.5),
  ('mera',  'Fr. Mera',  1, 'fulltime', 38.5)
ON CONFLICT (code) DO NOTHING;

-- Give them a primary role so existing role-aware UI doesn't choke.
-- Verkauf is the safest default given we have no further info.
INSERT INTO employee_roles (employee_id, abteilung_id, standort_id, kind)
SELECT e.id, a.id, e.standort_id, 'primary'
FROM employees e
JOIN abteilungen a ON a.name = 'Verkauf'
WHERE e.code IN ('klein', 'mera')
  AND NOT EXISTS (
    SELECT 1 FROM employee_roles er
    WHERE er.employee_id = e.id AND er.kind = 'primary'
  );

-- ============================================================
--  Re-shape shift_roster to match the paper schedule
-- ============================================================
-- Target order (from the paper sheet KW52/2025 → KW3/2026):
--   1. Russnig         (already at 1)
--   2. Klein           (NEW — slot in)
--   3. Oberlerchner    (was 2)
--   4. Mera            (NEW — slot in)
--   5. Buchbauer       (was 3)
--   6. Kumpusch        (was 4)
--   7. Georg Kitz      (was 5)
--
-- shift_roster.position UNIQUE is DEFERRABLE INITIALLY IMMEDIATE.
-- Defer for the duration of this transaction so we can use temporary
-- negative offsets while shuffling.

SET CONSTRAINTS shift_roster_position_unique DEFERRED;

-- Push existing entries into negative space first.
UPDATE shift_roster
SET    position = -1 * position
WHERE  employee_id IN (
  SELECT id FROM employees
  WHERE code IN ('hrussnig','coberlerchner','mbuchbauer','skumpusch','gkitz')
);

-- Now place every roster member at its final position.
INSERT INTO shift_roster (employee_id, position, active)
SELECT e.id, q.position, TRUE FROM (VALUES
  ('hrussnig',      1),
  ('klein',         2),
  ('coberlerchner', 3),
  ('mera',          4),
  ('mbuchbauer',    5),
  ('skumpusch',     6),
  ('gkitz',         7)
) AS q(code, position)
JOIN employees e ON e.code = q.code
ON CONFLICT (employee_id) DO UPDATE
  SET position = EXCLUDED.position,
      active   = TRUE;

SET CONSTRAINTS shift_roster_position_unique IMMEDIATE;

-- ============================================================
--  Scaffold 2026 (idempotent)
-- ============================================================
-- Creates an unassigned row per (date, slot_kind) for every shift
-- day in 2026. Required before the assignment UPDATEs below can find
-- targets to update.

SELECT scaffold_shift_year(2026);

-- ============================================================
--  Assign every slot from the paper schedule (KW1 → KW26)
-- ============================================================

WITH assignments(d, slot_code, code) AS (VALUES
  -- KW1: 01.01 Neujahr (holiday) → Oberlerchner
  (DATE '2026-01-01', 'holiday', 'coberlerchner'),
  -- KW1: 02.–04.01 → Mera
  (DATE '2026-01-02', 'fri_pm',  'mera'),
  (DATE '2026-01-03', 'sat',     'mera'),
  (DATE '2026-01-04', 'sun',     'mera'),
  -- KW2: 06.01 Hl. 3 Könige → Buchbauer
  (DATE '2026-01-06', 'holiday', 'mbuchbauer'),
  -- KW2: 09.–11.01 → Kumpusch
  (DATE '2026-01-09', 'fri_pm',  'skumpusch'),
  (DATE '2026-01-10', 'sat',     'skumpusch'),
  (DATE '2026-01-11', 'sun',     'skumpusch'),
  -- KW3: 16.–18.01 → Georg Kitz
  (DATE '2026-01-16', 'fri_pm',  'gkitz'),
  (DATE '2026-01-17', 'sat',     'gkitz'),
  (DATE '2026-01-18', 'sun',     'gkitz'),
  -- KW4: 23.–25.01 → Kumpusch
  (DATE '2026-01-23', 'fri_pm',  'skumpusch'),
  (DATE '2026-01-24', 'sat',     'skumpusch'),
  (DATE '2026-01-25', 'sun',     'skumpusch'),
  -- KW5: 30.01.–01.02 → Buchbauer
  (DATE '2026-01-30', 'fri_pm',  'mbuchbauer'),
  (DATE '2026-01-31', 'sat',     'mbuchbauer'),
  (DATE '2026-02-01', 'sun',     'mbuchbauer'),
  -- KW6: 06.–08.02 → Oberlerchner
  (DATE '2026-02-06', 'fri_pm',  'coberlerchner'),
  (DATE '2026-02-07', 'sat',     'coberlerchner'),
  (DATE '2026-02-08', 'sun',     'coberlerchner'),
  -- KW7: 13.–15.02 → Russnig
  (DATE '2026-02-13', 'fri_pm',  'hrussnig'),
  (DATE '2026-02-14', 'sat',     'hrussnig'),
  (DATE '2026-02-15', 'sun',     'hrussnig'),
  -- KW8: 20.–22.02 → Klein
  (DATE '2026-02-20', 'fri_pm',  'klein'),
  (DATE '2026-02-21', 'sat',     'klein'),
  (DATE '2026-02-22', 'sun',     'klein'),
  -- KW9: 27.02.–01.03 → Mera
  (DATE '2026-02-27', 'fri_pm',  'mera'),
  (DATE '2026-02-28', 'sat',     'mera'),
  (DATE '2026-03-01', 'sun',     'mera'),
  -- KW10: 06.–08.03 → Buchbauer
  (DATE '2026-03-06', 'fri_pm',  'mbuchbauer'),
  (DATE '2026-03-07', 'sat',     'mbuchbauer'),
  (DATE '2026-03-08', 'sun',     'mbuchbauer'),
  -- KW11: 13.–15.03 → Georg Kitz
  (DATE '2026-03-13', 'fri_pm',  'gkitz'),
  (DATE '2026-03-14', 'sat',     'gkitz'),
  (DATE '2026-03-15', 'sun',     'gkitz'),
  -- KW12: 20.–22.03 → Oberlerchner
  (DATE '2026-03-20', 'fri_pm',  'coberlerchner'),
  (DATE '2026-03-21', 'sat',     'coberlerchner'),
  (DATE '2026-03-22', 'sun',     'coberlerchner'),
  -- KW13: 27.–29.03 → Kumpusch
  (DATE '2026-03-27', 'fri_pm',  'skumpusch'),
  (DATE '2026-03-28', 'sat',     'skumpusch'),
  (DATE '2026-03-29', 'sun',     'skumpusch'),
  -- KW14: 03.–05.04 → Russnig
  (DATE '2026-04-03', 'fri_pm',  'hrussnig'),
  (DATE '2026-04-04', 'sat',     'hrussnig'),
  (DATE '2026-04-05', 'sun',     'hrussnig'),
  -- KW15: 06.04 Ostermontag → Russnig (continuation of KW14 block)
  (DATE '2026-04-06', 'holiday', 'hrussnig'),
  -- KW15: 10.–12.04 → Klein
  (DATE '2026-04-10', 'fri_pm',  'klein'),
  (DATE '2026-04-11', 'sat',     'klein'),
  (DATE '2026-04-12', 'sun',     'klein'),
  -- KW16: 17.–19.04 → Mera
  (DATE '2026-04-17', 'fri_pm',  'mera'),
  (DATE '2026-04-18', 'sat',     'mera'),
  (DATE '2026-04-19', 'sun',     'mera'),
  -- KW17: 24.–26.04 → Buchbauer
  (DATE '2026-04-24', 'fri_pm',  'mbuchbauer'),
  (DATE '2026-04-25', 'sat',     'mbuchbauer'),
  (DATE '2026-04-26', 'sun',     'mbuchbauer'),
  -- KW18: 01.–03.05 → Georg Kitz (01.05 = Staatsfeiertag → holiday slot)
  (DATE '2026-05-01', 'holiday', 'gkitz'),
  (DATE '2026-05-02', 'sat',     'gkitz'),
  (DATE '2026-05-03', 'sun',     'gkitz'),
  -- KW19: 08.–10.05 → Oberlerchner
  (DATE '2026-05-08', 'fri_pm',  'coberlerchner'),
  (DATE '2026-05-09', 'sat',     'coberlerchner'),
  (DATE '2026-05-10', 'sun',     'coberlerchner'),
  -- KW20: 14.05 Christi Himmelfahrt → Kumpusch
  (DATE '2026-05-14', 'holiday', 'skumpusch'),
  -- KW20: 15.–17.05 → Russnig
  (DATE '2026-05-15', 'fri_pm',  'hrussnig'),
  (DATE '2026-05-16', 'sat',     'hrussnig'),
  (DATE '2026-05-17', 'sun',     'hrussnig'),
  -- KW21: 22.–24.05 → Klein
  (DATE '2026-05-22', 'fri_pm',  'klein'),
  (DATE '2026-05-23', 'sat',     'klein'),
  (DATE '2026-05-24', 'sun',     'klein'),
  -- KW22: 25.05 Pfingstmontag → Mera
  (DATE '2026-05-25', 'holiday', 'mera'),
  -- KW22: 29.–31.05 → Buchbauer
  (DATE '2026-05-29', 'fri_pm',  'mbuchbauer'),
  (DATE '2026-05-30', 'sat',     'mbuchbauer'),
  (DATE '2026-05-31', 'sun',     'mbuchbauer'),
  -- KW23: 04.06 Fronleichnam → Georg Kitz
  (DATE '2026-06-04', 'holiday', 'gkitz'),
  -- KW23: 05.–07.06 → Oberlerchner
  (DATE '2026-06-05', 'fri_pm',  'coberlerchner'),
  (DATE '2026-06-06', 'sat',     'coberlerchner'),
  (DATE '2026-06-07', 'sun',     'coberlerchner'),
  -- KW24: 12.–14.06 → Kumpusch
  (DATE '2026-06-12', 'fri_pm',  'skumpusch'),
  (DATE '2026-06-13', 'sat',     'skumpusch'),
  (DATE '2026-06-14', 'sun',     'skumpusch'),
  -- KW25: 19.–21.06 → Russnig
  (DATE '2026-06-19', 'fri_pm',  'hrussnig'),
  (DATE '2026-06-20', 'sat',     'hrussnig'),
  (DATE '2026-06-21', 'sun',     'hrussnig'),
  -- KW26: 26.–28.06 → Klein
  (DATE '2026-06-26', 'fri_pm',  'klein'),
  (DATE '2026-06-27', 'sat',     'klein'),
  (DATE '2026-06-28', 'sun',     'klein')
)
UPDATE shifts s
SET    employee_id = e.id,
       status      = 'assigned',
       updated_at  = NOW()
FROM   assignments a
JOIN   shift_slot_kinds k ON k.code = a.slot_code
JOIN   employees       e ON e.code  = a.code
WHERE  s.shift_date   = a.d
  AND  s.slot_kind_id = k.id
  AND  s.status       = 'unassigned';

-- Audit-log the bulk seed for Betriebsrat traceability.
INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
VALUES (
  'shift.seed_2026_h1',
  'shift_year',
  NULL,
  jsonb_build_object(
    'source', 'docs/v1 paper roster (office door)',
    'range', '2026-01-01..2026-06-28',
    'placeholder_employees', jsonb_build_array('klein', 'mera')
  )
);
