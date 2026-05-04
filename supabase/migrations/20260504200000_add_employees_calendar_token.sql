-- Per-employee calendar subscription token. Used as the authentication
-- secret on the public ICS feed endpoint (functions/calendar-feed):
--
--   https://<project>.supabase.co/functions/v1/calendar-feed?token=<token>
--
-- The token is the only secret; revoking it (regenerate) invalidates
-- any existing Outlook / Apple Calendar / Google Calendar subscription
-- that was set up against the old URL.

ALTER TABLE employees
  ADD COLUMN calendar_token UUID UNIQUE;

-- Backfill existing rows so seeded employees get a token immediately.
UPDATE employees
SET    calendar_token = gen_random_uuid()
WHERE  calendar_token IS NULL;

-- Going forward, new employees get one automatically.
ALTER TABLE employees
  ALTER COLUMN calendar_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN calendar_token SET NOT NULL;

CREATE INDEX idx_employees_calendar_token ON employees(calendar_token);
