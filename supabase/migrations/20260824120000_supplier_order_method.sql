-- ════════════════════════════════════════════════════════════════════
-- Bestellweg pro Lieferant (Strategy pattern, datengetrieben).
--
--   api    → über die Lieferanten-API bestellen (Jarltech, verbindlich)
--   email  → Bestell-E-Mail an suppliers.order_email (z. B. Orderman)
--   manual → nur intern erfassen, Mensch bestellt selbst (RCH, Pulsa, …)
--
-- Neue E-Mail-Lieferanten später = nur order_method='email' + order_email
-- setzen, keine Code-Änderung.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE suppliers
  ADD COLUMN order_method TEXT NOT NULL DEFAULT 'manual'
    CHECK (order_method IN ('api', 'email', 'manual'));

UPDATE suppliers SET order_method = 'api'   WHERE code = 'jarltech';
UPDATE suppliers SET order_method = 'email', order_email = 'sales@orderman.com'
  WHERE code = 'orderman';
