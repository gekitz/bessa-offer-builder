-- ════════════════════════════════════════════════════════════════════
-- Go-live backfill for the Urlaubsplaner, from the paper
-- "URLAUBSLISTE STAND 16-09-2026" plus HR's per-person annual grants.
--
--   reset_date = the PDF "bis <date>" (start of the next Arbeitsjahr)
--   resturlaub = remaining days as of the snapshot  → current `entitled`
--   grant      = fresh days added each new Arbeitsjahr → annual_entitlement
--
-- The current urlaub balance row is set so `remaining` displays the paper
-- figure today (used/planned come from leave_requests, which the go-live
-- runbook wipes down to Graf's vacation + Nowak's Krankenstand). The
-- Arbeitsjahr window is [reset-1yr, reset-1day].
--
-- Idempotent: employees updated by code; the urlaub balance rows are
-- rebuilt from scratch (the old calendar-year seed rows are replaced so
-- there is exactly one urlaub row per employee, keyed to its own period).
--
-- NOT accrued (annual_entitlement/urlaubsjahr_reset stay NULL): gkitz,
-- hkitz (GF), dkitz, klein — not on the Urlaubsliste.
--
-- See docs/vacation-accrual.md.
-- ════════════════════════════════════════════════════════════════════

-- Per-person go-live data. grant NULL is impossible here (all 19 listed).
CREATE TEMP TABLE _golive (code TEXT, resturlaub NUMERIC, grant_days NUMERIC, reset_date DATE) ON COMMIT DROP;
INSERT INTO _golive VALUES
  ('hbauer',        16.0, 30.0, DATE '2027-03-29'),
  ('dscharf',        8.0, 25.0, DATE '2027-03-12'),
  ('hscheiber',     13.0, 30.0, DATE '2027-04-17'),
  ('skumpusch',     10.0, 25.0, DATE '2026-10-12'),
  ('mgraf',          4.5, 30.0, DATE '2026-11-30'),
  ('sbauer',        22.0, 25.0, DATE '2027-06-21'),
  ('coberlerchner', 38.0, 25.0, DATE '2027-08-15'),
  ('mbuchbauer',    10.0, 25.0, DATE '2026-11-01'),
  ('mmaier',        18.0, 25.0, DATE '2027-07-20'),
  ('bzmug',          9.5, 25.0, DATE '2026-11-02'),
  ('dthorer',       21.0, 25.0, DATE '2027-04-07'),
  ('wkriegl',        6.5, 20.0, DATE '2027-01-21'),
  ('sriedl',        19.0, 20.0, DATE '2027-08-28'),
  ('gtriebelnig',   27.0, 24.0, DATE '2027-06-10'),
  ('ahuber',        26.0, 25.0, DATE '2027-07-01'),
  ('anowak',         3.5, 25.0, DATE '2027-02-01'),
  ('hrussnig',       3.0, 25.0, DATE '2026-10-02'),
  ('aflagl',        12.0, 25.0, DATE '2027-01-11'),
  ('pfilipovic',    21.0, 25.0, DATE '2027-06-01');

-- 1) annual grant + next reset on the employee row.
UPDATE employees e
SET annual_entitlement = g.grant_days,
    urlaubsjahr_reset  = g.reset_date
FROM _golive g
WHERE e.code = g.code;

-- 2) Rebuild the urlaub balance rows (leave_type_id 1) for these 19 so
--    there is exactly one, keyed to its Arbeitsjahr period. Drops the
--    old calendar-year seed rows (entitled 25) for them first.
DELETE FROM leave_balances
WHERE leave_type_id = 1
  AND employee_id IN (SELECT e.id FROM employees e JOIN _golive g ON g.code = e.code);

INSERT INTO leave_balances
  (employee_id, year, leave_type_id, entitled, carried_over, used, planned, period_start, period_end)
SELECT
  e.id,
  EXTRACT(YEAR FROM (g.reset_date - INTERVAL '1 year'))::smallint,
  1,
  g.resturlaub,
  0, 0, 0,
  (g.reset_date - INTERVAL '1 year')::date,
  (g.reset_date - INTERVAL '1 day')::date
FROM _golive g
JOIN employees e ON e.code = g.code;
