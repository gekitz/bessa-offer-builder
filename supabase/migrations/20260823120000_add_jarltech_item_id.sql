-- ════════════════════════════════════════════════════════════════════
-- Jarltech-Preisintegration: Produkt ↔ Jarltech-Artikelkennung
--
-- Speichert die Jarltech-Item-Kennung (z. B. 'mpk1s12v') pro Produkt,
-- damit die Einkaufs-Ansicht über die jarltech-proxy Edge Function den
-- kundenspezifischen Nettopreis + Lagerstand abrufen kann. NULL = kein
-- Jarltech-Bezug hinterlegt (dann bleibt der Preis manuell).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN jarltech_item_id TEXT;

COMMENT ON COLUMN products.jarltech_item_id IS
  'Jarltech-Artikelkennung für die Preis-/Lagerabfrage (jarltech-proxy). NULL = nicht verknüpft.';
