-- ════════════════════════════════════════════════════════════════════
-- Leihstellungen (loaner hardware inventory).
-- Jedes physische Gerät ist ein eigener Datensatz (loaner_devices) mit
-- Seriennummer = Barcode-Aufkleber. Eine Leihstellung (loans) ist eine
-- Übergabe an einen Bestandskunden und kann MEHRERE Geräte enthalten
-- (loan_devices); Geräte werden einzeln zurückgenommen (returned_at je Zeile).
--
-- Deckungsbeitrag = Kostendeckung/Auslastung (kein Verrechnungssatz), aus
-- acquisition_cost + Leihdauer je Gerät abgeleitet. Beim Check-out entsteht
-- EIN Mesonic-Lieferschein (Belegart 19) mit einer TEXT-Position je Gerät
-- (Datentyp 3), analog zum Freitext-Pfad in deliveryNoteToBelegPositions().
-- Check-in erzeugt KEINEN Beleg — nur einen CRM-Kommentar.
-- Siehe docs/leihstellungen.md.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- loaner_devices — physisches Gerät (Anlagegut)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE loaner_devices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Artikel-Identität (Mesonic-Basisartikel, is_serialized). TEXT, weil
  -- products.id ein Mix aus UUIDs und Slugs ist. NULL = ohne Katalogzuordnung.
  product_id           TEXT REFERENCES products(id) ON DELETE SET NULL,
  -- Anzeigename (aus dem Produkt vorbefüllt, aber gespeichert, damit das Gerät
  -- immer beschriftet ist — auch ohne Katalog-Link). Analog delivery_note_items.
  bezeichnung          TEXT NOT NULL,
  serial_number        TEXT NOT NULL UNIQUE,          -- Barcode auf dem Aufkleber
  inventory_no         TEXT,                          -- interner Asset-Tag (optional)
  acquisition_cost     NUMERIC(10,2) CHECK (acquisition_cost >= 0),
  acquired_at          DATE,
  -- Optionaler €-Tagessatz nur für DB-Reporting (nicht verrechnet, v1 nicht im UI).
  notional_daily_value NUMERIC(10,2) CHECK (notional_daily_value >= 0),
  status               TEXT NOT NULL DEFAULT 'available'
                       CHECK (status IN ('available', 'on_loan', 'defective', 'retired')),
  standort             TEXT CHECK (standort IN ('klagenfurt', 'wolfsberg')),
  note                 TEXT,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loaner_devices_status  ON loaner_devices(status);
CREATE INDEX idx_loaner_devices_product ON loaner_devices(product_id);

CREATE TRIGGER trg_loaner_devices_updated_at
  BEFORE UPDATE ON loaner_devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ────────────────────────────────────────────────────────────────────
-- loans — Kopf: eine Leihstellung (Übergabe an einen Bestandskunden)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE loans (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name            TEXT NOT NULL,             -- Snapshot
  customer_kdnr            TEXT NOT NULL,             -- Mesonic Kontonummer (immer: Bestandskunde)
  ticket_id                UUID REFERENCES tickets(id) ON DELETE SET NULL,
  started_at               DATE NOT NULL DEFAULT CURRENT_DATE,   -- Leihbeginn / Check-out
  expected_return          DATE,
  note                     TEXT,
  -- Mesonic-Beleg-Export-Tracking (Leih-Lieferschein). <konto>-<laufnummer> = Idempotenz-Anker.
  mesonic_beleg_laufnummer INTEGER,
  mesonic_beleg_key        TEXT,
  mesonic_beleg_created_at TIMESTAMPTZ,
  created_by               UUID REFERENCES employees(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loans_customer_kdnr ON loans(customer_kdnr);
CREATE INDEX idx_loans_ticket        ON loans(ticket_id);

CREATE TRIGGER trg_loans_updated_at
  BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ────────────────────────────────────────────────────────────────────
-- loan_devices — Zeile: ein Gerät auf einer Leihstellung
-- returned_at je Zeile ⇒ Geräte einer Leihstellung sind einzeln rückgebbar.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE loan_devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id     UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES loaner_devices(id) ON DELETE RESTRICT,
  returned_at DATE,                                  -- NULL = noch verliehen
  note        TEXT,                                  -- z. B. Zustand bei Rückgabe
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loan_devices_loan   ON loan_devices(loan_id);
CREATE INDEX idx_loan_devices_device ON loan_devices(device_id);

-- Invariante: ein Gerät ist zu einem Zeitpunkt auf höchstens EINER offenen
-- Leihstellung (returned_at IS NULL). Der Check-out muss diese Regel wahren.
CREATE UNIQUE INDEX uq_loan_devices_open
  ON loan_devices(device_id) WHERE returned_at IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- RLS (permissiv wie der restliche App-Bereich; später härten)
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE loaner_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_devices   ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_access ON loaner_devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON loans          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON loan_devices   FOR ALL USING (true) WITH CHECK (true);
