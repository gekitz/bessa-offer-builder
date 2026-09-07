-- Idempotency anchor for the WinLine CRM Aktion (staff deep-link note) posted
-- once per ticket and once per repair order. Mirrors offers.mesonic_crm_key.
-- When set, the client-side "on open"/"on create" post is skipped.

ALTER TABLE tickets ADD COLUMN mesonic_crm_key TEXT;
CREATE INDEX idx_tickets_mesonic_crm_key
  ON tickets(mesonic_crm_key)
  WHERE mesonic_crm_key IS NOT NULL;

ALTER TABLE repair_orders ADD COLUMN mesonic_crm_key TEXT;
CREATE INDEX idx_repair_orders_mesonic_crm_key
  ON repair_orders(mesonic_crm_key)
  WHERE mesonic_crm_key IS NOT NULL;
