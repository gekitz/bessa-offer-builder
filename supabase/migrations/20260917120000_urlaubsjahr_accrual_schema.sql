-- ════════════════════════════════════════════════════════════════════
-- Urlaubsjahr accrual — schema.
--
-- KITZ earns vacation per Arbeitsjahr (entry-date anniversary), not per
-- calendar year. Two new columns on employees drive the nightly accrual
-- job, and two on leave_balances turn the urlaub balance into an
-- Arbeitsjahr window instead of a calendar year.
--
-- See docs/vacation-accrual.md.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE employees
  -- Fresh Urlaub granted at the start of each new Arbeitsjahr. NULL =
  -- not accrued (GF / staff not on the Urlaubsliste). 25 default per
  -- Urlaubsgesetz; 30 after 25 years; 20/24 for 4-day-week part-timers.
  ADD COLUMN IF NOT EXISTS annual_entitlement NUMERIC(4,1),
  -- The NEXT reset date (= current period_end + 1 day). The accrual job
  -- fires for an employee once today >= this date, then rolls it +1 year.
  ADD COLUMN IF NOT EXISTS urlaubsjahr_reset  DATE;

ALTER TABLE leave_balances
  -- Arbeitsjahr window the entitled/carried_over figures belong to. When
  -- set (urlaub rows), the balance panel sums used/planned over this
  -- window; when NULL it falls back to the calendar `year` (legacy /
  -- other leave types).
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end   DATE;

COMMENT ON COLUMN employees.annual_entitlement IS
  'Urlaubstage granted at each Arbeitsjahr reset; NULL = employee not accrued.';
COMMENT ON COLUMN employees.urlaubsjahr_reset IS
  'Next Arbeitsjahr reset date (entry anniversary). Rolled +1 year on accrual.';
COMMENT ON COLUMN leave_balances.period_start IS
  'Start of the Arbeitsjahr this urlaub balance row covers.';
COMMENT ON COLUMN leave_balances.period_end IS
  'End of the Arbeitsjahr this urlaub balance row covers (inclusive).';
