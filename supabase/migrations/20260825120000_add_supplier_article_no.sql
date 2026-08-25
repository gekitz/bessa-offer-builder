-- ════════════════════════════════════════════════════════════════════
-- Lieferanten-Artikelnummer pro Produkt.
--
-- Die Artikelnummer, die auf einer Bestellung beim (Haupt-)Lieferanten
-- steht — z. B. die Orderman-Artikelnummer, die in der Bestell-E-Mail
-- mitgeschickt werden soll. Generisch für alle E-Mail-/Manuell-Lieferanten.
-- (Jarltech nutzt weiterhin jarltech_item_id für die API.)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN supplier_article_no TEXT;

COMMENT ON COLUMN products.supplier_article_no IS
  'Artikelnummer beim Lieferanten (z. B. Orderman-Art.Nr.) — wird in der Bestell-E-Mail mitgeschickt.';
