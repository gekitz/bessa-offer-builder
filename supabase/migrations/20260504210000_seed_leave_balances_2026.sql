-- Seed Urlaub entitlement for the 2026 calendar year.
--
-- Austrian Urlaubsgesetz baseline: 25 working days/year for full-time
-- employment after the 6th month. We seed every active employee at 25
-- and pro-rate part-timers by `weekly_hours / 38.5` (the standard FT
-- week). Apprentices (Lehrlinge) legally get 30 days but we keep them
-- at 25 here — HR can edit individual rows after the fact.
--
-- This is idempotent: ON CONFLICT does nothing so re-running the
-- migration on top of manually-edited rows preserves them. used /
-- planned stay at 0; the dashboard computes those at read time from
-- leave_requests.

INSERT INTO leave_balances (employee_id, year, leave_type_id, entitled, carried_over, used, planned)
SELECT
  e.id,
  2026,
  1,                                                              -- leave_types.id 1 = Urlaub
  ROUND((25.0 * (e.weekly_hours / 38.5))::numeric, 1),
  0,
  0,
  0
FROM employees e
WHERE e.active = true
ON CONFLICT (employee_id, year, leave_type_id) DO NOTHING;
