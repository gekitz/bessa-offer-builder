-- Backfill email for Marcel Klein. Per the user-stated general rule
-- (<last-letter><first-letter>@kitz.co.at) Marcel Klein → km@kitz.co.at.
-- The other rows seeded in 20260504220000 use the longer
-- '<f>.<lastname>' alias; both forms are aliased in Exchange so
-- Resend deliveries succeed either way.
--
-- Mera (deactivated) is left as NULL.

UPDATE employees
SET    email = 'km@kitz.co.at'
WHERE  code  = 'klein'
  AND  email IS NULL;
