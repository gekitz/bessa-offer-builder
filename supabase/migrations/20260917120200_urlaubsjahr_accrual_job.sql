-- ════════════════════════════════════════════════════════════════════
-- Urlaubsjahr accrual — the self-updating job.
--
-- On each employee's entry anniversary, grant the fresh annual
-- entitlement and carry the prior year's remainder forward. Pure in-DB
-- (no edge function / secrets), scheduled nightly via pg_cron.
--
-- See docs/vacation-accrual.md.
-- ════════════════════════════════════════════════════════════════════

-- Working days (Mon–Fri) in [p_start, p_end], honouring half-day flags.
-- MUST mirror countWorkingDays() in src/features/vacation/lib/balance.ts:
-- weekends never count, and a half-day only subtracts when that boundary
-- day is itself a weekday.
CREATE OR REPLACE FUNCTION leave_working_days(
  p_start      DATE,
  p_end        DATE,
  p_half_start BOOLEAN,
  p_half_end   BOOLEAN
) RETURNS NUMERIC AS $$
DECLARE
  v_days NUMERIC;
BEGIN
  IF p_end < p_start THEN
    RETURN 0;
  END IF;
  SELECT count(*) INTO v_days
  FROM generate_series(p_start, p_end, INTERVAL '1 day') AS d
  WHERE EXTRACT(ISODOW FROM d) < 6;            -- Mon(1)..Fri(5)
  IF p_half_start AND v_days > 0 AND EXTRACT(ISODOW FROM p_start) < 6 THEN
    v_days := v_days - 0.5;
  END IF;
  IF p_half_end AND v_days > 0 AND EXTRACT(ISODOW FROM p_end) < 6 THEN
    v_days := v_days - 0.5;
  END IF;
  RETURN v_days;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Advance every employee whose Arbeitsjahr has ended on/before p_today.
-- Loops so a missed year (or multi-year gap) settles in a single run.
-- Returns the number of period rollovers performed.
CREATE OR REPLACE FUNCTION run_urlaubsjahr_accrual(p_today DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  r          RECORD;
  v_used     NUMERIC;
  v_remain   NUMERIC;
  v_start    DATE;
  v_end      DATE;
  n          INTEGER := 0;
BEGIN
  LOOP
    SELECT e.id, e.annual_entitlement, e.urlaubsjahr_reset,
           lb.id AS balance_id, lb.entitled, lb.carried_over,
           lb.period_start, lb.period_end
    INTO r
    FROM employees e
    JOIN leave_balances lb
      ON lb.employee_id = e.id AND lb.leave_type_id = 1
    WHERE e.active
      AND e.annual_entitlement IS NOT NULL
      AND e.urlaubsjahr_reset IS NOT NULL
      AND e.urlaubsjahr_reset <= p_today
    ORDER BY e.urlaubsjahr_reset, e.id
    LIMIT 1;
    EXIT WHEN NOT FOUND;

    -- Days consumed in the closing Arbeitsjahr (approved + pending both
    -- reduce the balance). Clamp each leave to the period so a request
    -- straddling the boundary only counts its in-period portion.
    SELECT COALESCE(SUM(leave_working_days(
             GREATEST(lr.start_date, r.period_start),
             LEAST(lr.end_date,   r.period_end),
             lr.half_day_start AND lr.start_date >= r.period_start,
             lr.half_day_end   AND lr.end_date   <= r.period_end
           )), 0)
    INTO v_used
    FROM leave_requests lr
    WHERE lr.employee_id = r.id
      AND lr.leave_type_id = 1
      AND lr.status IN ('approved', 'pending')
      AND lr.start_date <= r.period_end
      AND lr.end_date   >= r.period_start;

    v_remain := r.entitled + r.carried_over - v_used;
    v_start  := r.urlaubsjahr_reset;
    v_end    := (r.urlaubsjahr_reset + INTERVAL '1 year' - INTERVAL '1 day')::date;

    UPDATE leave_balances
    SET carried_over = v_remain,
        entitled     = r.annual_entitlement,
        used         = 0,
        planned      = 0,
        period_start = v_start,
        period_end   = v_end,
        year         = EXTRACT(YEAR FROM v_start)::smallint,
        updated_at   = NOW()
    WHERE id = r.balance_id;

    UPDATE employees
    SET urlaubsjahr_reset = (r.urlaubsjahr_reset + INTERVAL '1 year')::date
    WHERE id = r.id;

    INSERT INTO workforce_audit_log (action, entity_type, entity_id, details)
    VALUES ('balance.accrued', 'employee', r.id, jsonb_build_object(
      'closed_period_start', r.period_start,
      'closed_period_end',   r.period_end,
      'used_in_period',      v_used,
      'carried_over',        v_remain,
      'granted',             r.annual_entitlement,
      'new_period_start',    v_start,
      'new_period_end',      v_end
    ));

    n := n + 1;
    IF n > 5000 THEN
      RAISE EXCEPTION 'run_urlaubsjahr_accrual loop guard tripped';
    END IF;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- Nightly at 02:00 UTC. Idempotent — only fires per employee once the
-- reset date is reached, then rolls it forward.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'urlaubsjahr-accrual';

SELECT cron.schedule(
  'urlaubsjahr-accrual',
  '0 2 * * *',
  $$ SELECT run_urlaubsjahr_accrual(); $$
);
