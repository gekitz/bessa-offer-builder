-- ════════════════════════════════════════════════════════════════════
-- Public (customer-portal) access to SIGNED delivery notes.
-- Mirrors 20260710130000_public_signed_repair_order.sql: tighten the
-- permissive all_access policy to authenticated, and give anon SELECT on
-- signed Lieferscheine (+ their items) belonging to a shareable ticket.
-- The signature milestone comment is already exposed to anon by the
-- existing anon_select_comments_by_ticket_share policy (kind 'milestone').
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS all_access ON delivery_notes;
DROP POLICY IF EXISTS all_access ON delivery_note_items;

CREATE POLICY authenticated_access ON delivery_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_access ON delivery_note_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY anon_select_signed_delivery_notes
  ON delivery_notes FOR SELECT
  TO anon
  USING (
    status = 'signed'
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = delivery_notes.ticket_id
        AND t.share_code IS NOT NULL
    )
  );

CREATE POLICY anon_select_signed_delivery_note_items
  ON delivery_note_items FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM delivery_notes d
      JOIN tickets t ON t.id = d.ticket_id
      WHERE d.id = delivery_note_items.delivery_note_id
        AND d.status = 'signed'
        AND t.share_code IS NOT NULL
    )
  );
