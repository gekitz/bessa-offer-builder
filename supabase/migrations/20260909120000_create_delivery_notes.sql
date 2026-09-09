-- ════════════════════════════════════════════════════════════════════
-- Lieferscheine (delivery notes): gelieferte Ware pro Ticket.
-- Spiegelt repair_orders / repair_order_materials 1:1, damit Signatur-,
-- PDF-, Portal- und Beleg-Export-Logik dieselben Muster wiederverwendet.
-- Siehe docs/ticket-lieferschein.md.
--
-- Ein Ticket kann MEHRERE Lieferscheine haben (Teillieferungen). Erst beim
-- Ticket-Abschluss wird je Lieferschein ein WinLine-Beleg angelegt
-- (Idempotenz über mesonic_beleg_key, wie beim Reparaturschein).
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- delivery_notes
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE delivery_notes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  seq_number               SMALLINT NOT NULL DEFAULT 1,   -- fortlaufend pro Ticket (Trigger)
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'signed', 'cancelled')),
  note                     TEXT,                          -- Freitext-Kopfnotiz
  -- Kundenunterschrift (gleiche Mechanik wie repair_orders)
  signature_data           TEXT,                          -- base64 PNG data URL
  signed_at                TIMESTAMPTZ,
  signed_by_name           TEXT,
  performed_at             DATE NOT NULL DEFAULT CURRENT_DATE,  -- Lieferdatum
  -- Mesonic-Beleg-Export-Tracking (gesetzt beim Ticket-Abschluss).
  -- mesonic_beleg_key (<konto>-<laufnummer>) ist der Idempotenz-Anker.
  mesonic_beleg_laufnummer INTEGER,
  mesonic_beleg_key        TEXT,
  mesonic_beleg_created_at TIMESTAMPTZ,
  created_by               UUID REFERENCES employees(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_notes_ticket ON delivery_notes(ticket_id);
CREATE INDEX idx_delivery_notes_status ON delivery_notes(status);

-- Fortlaufende seq_number je Ticket (identisch zu set_repair_order_seq).
CREATE OR REPLACE FUNCTION set_delivery_note_seq()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(seq_number), 0) + 1 INTO NEW.seq_number
  FROM delivery_notes WHERE ticket_id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delivery_note_seq
  BEFORE INSERT ON delivery_notes
  FOR EACH ROW EXECUTE FUNCTION set_delivery_note_seq();

CREATE TRIGGER trg_delivery_notes_updated_at
  BEFORE UPDATE ON delivery_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ────────────────────────────────────────────────────────────────────
-- delivery_note_items
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE delivery_note_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id   UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  -- Herkunfts-Produkt (für UI-Lookups wie is_serialized). NULL = Freitext.
  -- TEXT, weil products.id ein Mix aus UUIDs und Slugs ist.
  product_id         TEXT REFERENCES products(id) ON DELETE SET NULL,
  -- Snapshot der Mesonic-Artikelnummer zum Zeitpunkt der Anlage (unveränderlich
  -- für den späteren Beleg-Export). NULL/leer = Freitext-Position (Datentyp 3).
  mesonic_artikel_nr TEXT,
  bezeichnung        TEXT NOT NULL,
  quantity           NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  is_freetext        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Seriennummern je physischer Einheit (eine je Stück). Beim Export in die
  -- Bezeichnung gefaltet: "4x Sunmi L3 <s1>, <s2>, <s3>, <s4>".
  serial_numbers     TEXT[] NOT NULL DEFAULT '{}',
  sort               INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_note_items_note ON delivery_note_items(delivery_note_id);

-- ────────────────────────────────────────────────────────────────────
-- products.is_serialized — treibt die Seriennummer-Erfassung im UI
-- (Fallback bleibt app-seitig: Hardware-nahe Kataloge).
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN is_serialized BOOLEAN NOT NULL DEFAULT FALSE;

-- ────────────────────────────────────────────────────────────────────
-- RLS (permissiv wie der restliche Ticket-Bereich; später härten)
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE delivery_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_access ON delivery_notes      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON delivery_note_items FOR ALL USING (true) WITH CHECK (true);
