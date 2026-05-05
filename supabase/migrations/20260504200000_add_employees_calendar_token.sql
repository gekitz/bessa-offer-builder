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

-- Keep the feed token out of normal row SELECT/UPDATE paths. The
-- app gets and rotates a token through the security-definer RPCs
-- below, which enforce "own employee or approver" access.
REVOKE SELECT (calendar_token), UPDATE (calendar_token) ON employees FROM anon, authenticated;

CREATE OR REPLACE FUNCTION get_employee_calendar_token(p_employee_id UUID)
RETURNS UUID
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token UUID;
BEGIN
  IF NOT (p_employee_id = current_employee_id() OR is_workforce_approver()) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT calendar_token INTO token
  FROM employees
  WHERE id = p_employee_id;

  IF token IS NULL THEN
    RAISE EXCEPTION 'employee calendar token not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN token;
END;
$$;

CREATE OR REPLACE FUNCTION rotate_employee_calendar_token(p_employee_id UUID)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token UUID;
BEGIN
  IF NOT (p_employee_id = current_employee_id() OR is_workforce_approver()) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE employees
  SET calendar_token = gen_random_uuid()
  WHERE id = p_employee_id
  RETURNING calendar_token INTO token;

  IF token IS NULL THEN
    RAISE EXCEPTION 'employee calendar token not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN token;
END;
$$;

REVOKE ALL ON FUNCTION get_employee_calendar_token(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rotate_employee_calendar_token(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_employee_calendar_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_employee_calendar_token(UUID) TO authenticated;
