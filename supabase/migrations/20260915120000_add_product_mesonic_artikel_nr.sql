-- ════════════════════════════════════════════════════════════════════
-- Mesonic-Artikelverknüpfung: Produkt ↔ Mesonic-Basis-Artikelnummer
--
-- Damit Lieferschein-/Reparaturschein-Belege echte Mesonic-Artikel buchen
-- (DB-Preisrechnung + Lagerbuchung) statt Freitext, hinterlegen wir pro
-- Produkt die BASIS-Artikelnummer OHNE Standort-Suffix (KL/WO). Der Suffix
-- wird beim Beleg-Export aus dem Ticket-/Lieferstandort abgeleitet
-- (mesonicArtikelForStandort), analog zu den Arbeitszeit-/Pseudoartikeln.
-- NULL = nicht verknüpft → die Position bleibt Freitext (Datentyp 3).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN mesonic_artikel_nr TEXT;

COMMENT ON COLUMN products.mesonic_artikel_nr IS
  'Mesonic Basis-Artikelnummer (ohne KL/WO-Suffix) für den Beleg-Export. NULL = nicht verknüpft → Freitext.';
