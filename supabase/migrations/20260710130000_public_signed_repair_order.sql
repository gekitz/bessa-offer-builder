-- ════════════════════════════════════════════════════════════════════
-- Public access to SIGNED repair orders (customer portal), + expose
-- 'milestone' comments to anon.
-- ════════════════════════════════════════════════════════════════════

-- 1. Let the customer portal see milestone events on the timeline.
DROP POLICY IF EXISTS anon_select_comments_by_ticket_share ON ticket_comments;
CREATE POLICY anon_select_comments_by_ticket_share
  ON ticket_comments FOR SELECT
  TO anon
  USING (
    kind IN ('comment', 'status_change', 'milestone')
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND t.share_code IS NOT NULL
    )
  );

-- 2. Re-scope repair_orders + children. They currently carry a permissive
-- all_access policy that applies to ALL roles (incl. anon) — tighten to
-- authenticated for full access, and give anon SELECT on SIGNED orders
-- (and their entries/materials) belonging to a shareable ticket only.
DROP POLICY IF EXISTS all_access ON repair_orders;
DROP POLICY IF EXISTS all_access ON repair_order_entries;
DROP POLICY IF EXISTS all_access ON repair_order_materials;

CREATE POLICY authenticated_access ON repair_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_access ON repair_order_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_access ON repair_order_materials
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY anon_select_signed_repair_orders
  ON repair_orders FOR SELECT
  TO anon
  USING (
    status = 'signed'
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = repair_orders.ticket_id
        AND t.share_code IS NOT NULL
    )
  );

CREATE POLICY anon_select_signed_repair_entries
  ON repair_order_entries FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM repair_orders r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = repair_order_entries.repair_order_id
        AND r.status = 'signed'
        AND t.share_code IS NOT NULL
    )
  );

CREATE POLICY anon_select_signed_repair_materials
  ON repair_order_materials FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM repair_orders r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = repair_order_materials.repair_order_id
        AND r.status = 'signed'
        AND t.share_code IS NOT NULL
    )
  );

-- Note: service_rates + travel_zones keep their PUBLIC all_access policy
-- (rate cards, needed for the amount calculation on the portal).
