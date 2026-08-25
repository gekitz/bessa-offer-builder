-- ════════════════════════════════════════════════════════════════════
-- Pulsa-Bestellnummer pro Produkt — symmetrisch zur Jarltech-Artikelkennung.
--
-- "Abgleichen" schreibt die in der Preisliste gefundene Bestellnummer
-- (ARTIKELNUMMER) hierher, damit sie sichtbar/gespeichert ist und die
-- XML-Bestellung sie verwendet — analog zu jarltech_item_id.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN pulsa_bestellnummer TEXT;

COMMENT ON COLUMN products.pulsa_bestellnummer IS
  'Pulsa-Bestellnummer (ARTIKELNUMMER), von "Abgleichen" aus der Preisliste gesetzt.';
