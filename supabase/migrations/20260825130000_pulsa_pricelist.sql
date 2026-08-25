-- ════════════════════════════════════════════════════════════════════
-- Pulsa: Preislisten-Spiegel + Bestellweg per XML-E-Mail.
--
-- Pulsa hat keine API, aber eine Preislisten-CSV (ARTIKELNUMMER,
-- HERSTELLERNUMMER, EK_NET, VERFUEGBAR, EAN, …). Wir spiegeln sie in
-- pulsa_items und matchen sie über EAN / Herstellernummer an unsere
-- Produkte → liefert Bestellnummer + Einkaufspreis + Lager für die
-- Preisvergleich-Ansicht und die XML-Bestellung.
--
-- Bestellung erfolgt als XML-Anhang per E-Mail an info@pulsa.de
-- (order_method 'email_xml').
-- ════════════════════════════════════════════════════════════════════

-- Match-Schlüssel am Produkt (herstellerneutral). manufacturer_sku hilft
-- auch der Jarltech-Auflösung.
ALTER TABLE products
  ADD COLUMN manufacturer_sku TEXT,
  ADD COLUMN ean              TEXT;

CREATE INDEX idx_products_ean     ON products(ean) WHERE ean IS NOT NULL;
CREATE INDEX idx_products_mfr_sku ON products(manufacturer_sku) WHERE manufacturer_sku IS NOT NULL;

-- Unsere Kundennummer beim Lieferanten (für die Pulsa-Bestell-XML).
ALTER TABLE suppliers ADD COLUMN customer_number TEXT;

-- Neuer Bestellweg: XML-Anhang per E-Mail.
ALTER TABLE suppliers DROP CONSTRAINT suppliers_order_method_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_order_method_check
  CHECK (order_method IN ('api', 'email', 'email_xml', 'manual'));

UPDATE suppliers SET order_method = 'email_xml', order_email = 'info@pulsa.de'
  WHERE code = 'pulsa';

-- ────────────────────────────────────────────────────────────────────
-- pulsa_items — Spiegel der Preisliste (nur benötigte Spalten)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE pulsa_items (
  artikelnummer     TEXT PRIMARY KEY,          -- ARTIKELNUMMER = Bestellnummer
  name              TEXT,                       -- NAME_DE
  herstellernummer  TEXT,                       -- HERSTELLERNUMMER (Match-Key)
  ean               TEXT,                       -- EAN (Match-Key)
  ek_net            NUMERIC(12, 2),             -- EK_NET (Einkaufspreis netto)
  vk_net            NUMERIC(12, 2),             -- VK_NET
  verfuegbar        INTEGER,                    -- VERFUEGBAR (Lager)
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulsa_items_herstellernummer ON pulsa_items(herstellernummer) WHERE herstellernummer IS NOT NULL;
CREATE INDEX idx_pulsa_items_ean              ON pulsa_items(ean) WHERE ean IS NOT NULL;

ALTER TABLE pulsa_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_access ON pulsa_items FOR ALL USING (true) WITH CHECK (true);
