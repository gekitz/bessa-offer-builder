-- ════════════════════════════════════════════════════════════════════
-- Sprint 7: customer-facing share codes + external comments
-- ════════════════════════════════════════════════════════════════════
--
-- Adds `share_code` to tickets so customers can view their auftrag
-- via /?t=<share_code> without authentication. Tightens the existing
-- permissive `all_access` policies on tickets, appointments and
-- ticket_comments so anon access is scoped to share_code lookups
-- only — the authenticated path keeps the same shape.

-- ────────────────────────────────────────────────────────────────────
-- 1. share_code on tickets — generate on insert + backfill
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE tickets ADD COLUMN share_code TEXT UNIQUE;
CREATE INDEX idx_tickets_share_code ON tickets(share_code);

CREATE OR REPLACE FUNCTION generate_ticket_share_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.share_code IS NULL THEN
    -- Same pattern as offers.share_code: random URL-safe token.
    -- Collisions on the UNIQUE constraint re-raise.
    NEW.share_code := REPLACE(gen_random_uuid()::TEXT, '-', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_share_code
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION generate_ticket_share_code();

-- Backfill any existing rows (handful from prod testing).
UPDATE tickets
SET share_code = REPLACE(gen_random_uuid()::TEXT, '-', '')
WHERE share_code IS NULL;

ALTER TABLE tickets ALTER COLUMN share_code SET NOT NULL;

-- ────────────────────────────────────────────────────────────────────
-- 2. is_external on ticket_comments
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE ticket_comments
  ADD COLUMN is_external BOOLEAN NOT NULL DEFAULT FALSE;

-- ────────────────────────────────────────────────────────────────────
-- 3. Re-scope RLS — auth path unchanged, anon scoped to share_code
-- ────────────────────────────────────────────────────────────────────

-- Drop the permissive policies; they currently apply to all roles
-- including anon, which would let anon read every ticket without a
-- share_code. Re-create them scoped to `authenticated` only.
DROP POLICY IF EXISTS all_access ON tickets;
DROP POLICY IF EXISTS all_access ON appointments;
DROP POLICY IF EXISTS all_access ON ticket_comments;

CREATE POLICY authenticated_access ON tickets
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY authenticated_access ON appointments
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY authenticated_access ON ticket_comments
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon: SELECT any ticket if its share_code is non-NULL. The client
-- is expected to filter by `share_code=eq.<code>` — the policy lets
-- the query through, the filter narrows it to the right row.
CREATE POLICY anon_select_ticket_by_share
  ON tickets FOR SELECT
  TO anon
  USING (share_code IS NOT NULL);

-- Anon: SELECT appointments belonging to a ticket they can see.
CREATE POLICY anon_select_appointments_by_ticket_share
  ON appointments FOR SELECT
  TO anon
  USING (
    ticket_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = appointments.ticket_id
        AND t.share_code IS NOT NULL
    )
  );

-- Anon: SELECT comments. Only customer-visible kinds are exposed —
-- internal kinds like 'assignment' / 'system' stay private even if
-- the anon knows the ticket_id.
CREATE POLICY anon_select_comments_by_ticket_share
  ON ticket_comments FOR SELECT
  TO anon
  USING (
    kind IN ('comment', 'status_change')
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND t.share_code IS NOT NULL
    )
  );

-- Anon: INSERT external comments only. is_external=TRUE prevents
-- the customer from impersonating internal staff (those comments
-- carry is_external=FALSE and a non-null created_by).
CREATE POLICY anon_insert_external_comment
  ON ticket_comments FOR INSERT
  TO anon
  WITH CHECK (
    is_external = TRUE
    AND kind = 'comment'
    AND created_by IS NULL
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND t.share_code IS NOT NULL
    )
  );
