-- Corrections (Korrekturen) on a repair order — a signed line-item can't
-- be edited, so a reduction/adjustment is posted as its own signed-amount
-- entry with a reason (like a Gutschrift). Billing sums these in.
--
-- Internal only: NO anon policy, so corrections never surface on the
-- customer portal — the customer's signed document stays as-signed.
CREATE TABLE repair_order_adjustments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id  UUID NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  amount           NUMERIC(12,2) NOT NULL,   -- signed net EUR; negative = Reduktion
  reason           TEXT NOT NULL,
  created_by       UUID REFERENCES employees(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_order_adjustments_ro ON repair_order_adjustments(repair_order_id);

ALTER TABLE repair_order_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_access ON repair_order_adjustments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
