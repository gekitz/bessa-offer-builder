-- ════════════════════════════════════════════════════════════════════
-- Ticket-System: Tickets, Termine, Reparaturscheine, Abrechnung
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- Stundensätze & Reisepauschalen (Stand 01.01.2026)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE service_rates (
  id                       SMALLSERIAL PRIMARY KEY,
  code                     TEXT NOT NULL UNIQUE,
  label                    TEXT NOT NULL,
  category                 TEXT NOT NULL
                           CHECK (category IN ('hardware', 'it', 'kassen', 'buero', 'software', 'service', 'travel')),
  unit                     TEXT NOT NULL DEFAULT 'hour'
                           CHECK (unit IN ('hour', 'pauschale', 'km')),
  rate                     NUMERIC(10,2) NOT NULL CHECK (rate >= 0),
  -- Kassen-Staffelung: ab X Stunden gilt dieser Satz (NULL = unabhängig von Gesamtstunden)
  tier_min_hours           NUMERIC(6,2),
  -- Mesonic-spezifisch: TRUE = nur mit Wartungsvertrag, FALSE = nur ohne, NULL = irrelevant
  requires_wartungsvertrag BOOLEAN,
  mesonic_artikel_nr       TEXT,
  active_from              DATE NOT NULL DEFAULT '2026-01-01',
  active_to                DATE,
  CHECK (active_to IS NULL OR active_to > active_from)
);

CREATE INDEX idx_service_rates_category ON service_rates(category);
CREATE INDEX idx_service_rates_active ON service_rates(active_from, active_to);

INSERT INTO service_rates (code, label, category, unit, rate, tier_min_hours, requires_wartungsvertrag) VALUES
  -- Hardware-Stundensätze
  ('DRUCKER',              'Drucker, Colorprinter, MFP, Scanner, Kopierer, Plotter', 'hardware', 'hour', 130.00, NULL, NULL),
  ('PC_NB',                'PC, Notebook, Monitor, Software-Installation, Internet, Verkabelung', 'it', 'hour', 130.00, NULL, NULL),
  ('NETZWERK',             'Computer-Netzwerksysteme, Server', 'it', 'hour', 175.00, NULL, NULL),
  -- Kassen Gastro (3 Stufen je nach Gesamtstunden)
  ('KASSA_BASE',           'Kassensysteme Gastro', 'kassen', 'hour', 118.00, NULL, NULL),
  ('KASSA_10_20',          'Kassen Installation/Programmierung ab 10 Stunden', 'kassen', 'hour', 109.00, 10, NULL),
  ('KASSA_21PLUS',         'Kassen Installation/Programmierung ab 21 Stunden', 'kassen', 'hour', 98.00, 21, NULL),
  -- Telekom & Bürogeräte
  ('TELEKOM_BUERO',        'Telekommunikation, Fax, Beamer, Rechenmaschinen, Bürogeräte', 'buero', 'hour', 118.00, NULL, NULL),
  -- Mesonic Business Software (kunden-abhängig: Wartungsvertrag ja/nein)
  ('MESONIC_NO_CONTRACT',  'Mesonic-Business Software (ohne Wartungsvertrag)', 'software', 'hour', 183.00, NULL, FALSE),
  ('MESONIC_CONTRACT',     'Mesonic-Business Software (mit Wartungsvertrag)', 'software', 'hour', 138.00, NULL, TRUE),
  -- Service-Pauschalen
  ('FERNWARTUNG',          'Fernwartungs-Pauschale (unter 30 Min.)', 'service', 'pauschale', 45.00, NULL, NULL),
  ('KOSTENVORANSCHLAG_PC', 'Kostenvoranschlag PC/Notebook', 'service', 'pauschale', 63.00, NULL, NULL),
  ('KOSTENVORANSCHLAG_BG', 'Kostenvoranschlag Bürogeräte', 'service', 'pauschale', 63.00, NULL, NULL),
  -- Entsorgung
  ('ENTSORGUNG_ALT',       'Entsorgung Altgeräte', 'service', 'km', 21.00, NULL, NULL),         -- unit 'km' = per kg (sic)
  ('ENTSORGUNG_VERBRAUCH', 'Entsorgung Verbrauchsmaterial', 'service', 'km', 43.00, NULL, NULL),
  -- KM-Geld (Wegzeit getrennt vs inkludiert)
  ('KM_PLUS_WEGZEIT',      'KM-Geld (Wegzeit = Arbeitszeit, separat)', 'travel', 'km', 0.57, NULL, NULL),
  ('KM_INKL_WEGZEIT',      'KM-Geld inkl. Wegzeit (nur Sondervereinbarung)', 'travel', 'km', 1.10, NULL, NULL);

-- Anmerkung: ENTSORGUNG hat unit 'km' weil es per-kg ist und wir bisher nur 3 units haben.
-- Wenn 'kg' als unit gebraucht wird → CHECK constraint erweitern.

CREATE TABLE travel_zones (
  id                 SMALLINT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  label              TEXT NOT NULL,
  max_km             INTEGER,                       -- NULL = Stadt
  flat_rate          NUMERIC(8,2) NOT NULL CHECK (flat_rate >= 0),
  mesonic_artikel_nr TEXT,
  active_from        DATE NOT NULL DEFAULT '2026-01-01'
);

INSERT INTO travel_zones (id, code, label, max_km, flat_rate, mesonic_artikel_nr) VALUES
  (1, 'STADT',  'Stadt',          NULL, 32.00,  '31000000'),
  (2, 'ZONE_1', 'bis 5 km',       5,    56.00,  '31000001'),
  (3, 'ZONE_2', 'bis 10 km',      10,   84.00,  '31000002'),
  (4, 'ZONE_3', 'bis 20 km',      20,   102.00, '31000003'),
  (5, 'ZONE_4', 'bis 46 km',      46,   110.00, '31000004');

-- ────────────────────────────────────────────────────────────────────
-- Ticket-Nummern: 26-0000001 (YY-NNNNNNN), Jahres-Counter
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE ticket_number_counters (
  year         SMALLINT PRIMARY KEY,
  last_number  INTEGER  NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  v_yy   SMALLINT := EXTRACT(YEAR FROM NOW())::INTEGER % 100;
  v_next INTEGER;
BEGIN
  IF NEW.ticket_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO ticket_number_counters (year, last_number)
  VALUES (v_yy, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_number = ticket_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  NEW.ticket_number := LPAD(v_yy::TEXT, 2, '0') || '-' || LPAD(v_next::TEXT, 7, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────────
-- tickets
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number       TEXT UNIQUE,                                          -- 26-0000001, vom Trigger gesetzt
  title               TEXT NOT NULL,
  description         TEXT,
  kind                TEXT NOT NULL DEFAULT 'support'
                      CHECK (kind IN ('support', 'installation', 'reparatur', 'wartung', 'beratung', 'intern')),
  priority            TEXT NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'waiting', 'closed', 'cancelled')),
  pool_abteilung_id   SMALLINT REFERENCES abteilungen(id),
  assigned_to         UUID REFERENCES employees(id),
  -- Kunde (Mesonic-Referenz, denormalisiert)
  mesonic_customer_id TEXT,
  customer_name       TEXT,
  customer_phone      TEXT,
  customer_email      TEXT,
  customer_address    TEXT,
  -- Wartungsvertrag-Flag treibt die Wahl des Mesonic-Stundensatzes
  customer_has_wartungsvertrag BOOLEAN NOT NULL DEFAULT FALSE,
  standort_id         SMALLINT REFERENCES standorte(id),
  billable            BOOLEAN NOT NULL DEFAULT TRUE,
  closed_at           TIMESTAMPTZ,
  closed_by           UUID REFERENCES employees(id),
  resolution_note     TEXT,
  offer_id            UUID REFERENCES offers(id),
  mesonic_beleg_id    TEXT,                                                 -- nach Beleg-Import gefüllt
  created_by          UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_status      ON tickets(status);
CREATE INDEX idx_tickets_assigned    ON tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tickets_customer    ON tickets(mesonic_customer_id) WHERE mesonic_customer_id IS NOT NULL;
CREATE INDEX idx_tickets_pool        ON tickets(pool_abteilung_id) WHERE pool_abteilung_id IS NOT NULL;
CREATE INDEX idx_tickets_created     ON tickets(created_at DESC);
CREATE INDEX idx_tickets_ticket_no   ON tickets(ticket_number);

CREATE TRIGGER trg_tickets_number
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION generate_ticket_number();

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ────────────────────────────────────────────────────────────────────
-- appointments — Termine im zentralen Kalender
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE appointments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID REFERENCES tickets(id) ON DELETE SET NULL,
  mesonic_customer_id TEXT,
  customer_name       TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  kind                TEXT NOT NULL DEFAULT 'reparatur'
                      CHECK (kind IN ('installation', 'reparatur', 'wartung', 'beratung', 'abholung', 'lieferung', 'intern')),
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,
  all_day             BOOLEAN NOT NULL DEFAULT FALSE,
  location            TEXT,
  status              TEXT NOT NULL DEFAULT 'geplant'
                      CHECK (status IN ('geplant', 'bestaetigt', 'in_arbeit', 'erledigt', 'abgesagt')),
  standort_id         SMALLINT REFERENCES standorte(id),
  notes               TEXT,
  created_by          UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_appointments_dates  ON appointments(starts_at, ends_at);
CREATE INDEX idx_appointments_ticket ON appointments(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_appointments_status ON appointments(status);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TABLE appointment_assignees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'techniker'
                  CHECK (role IN ('lead', 'techniker', 'lehrling')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_id, employee_id)
);

CREATE INDEX idx_appointment_assignees_employee    ON appointment_assignees(employee_id);
CREATE INDEX idx_appointment_assignees_appointment ON appointment_assignees(appointment_id);

-- ────────────────────────────────────────────────────────────────────
-- repair_orders + entries + materials
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE repair_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  appointment_id      UUID REFERENCES appointments(id) ON DELETE SET NULL,
  seq_number          SMALLINT NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'completed', 'signed', 'cancelled')),
  work_description    TEXT,
  gps_travel_note     TEXT,
  signature_data      TEXT,
  signed_at           TIMESTAMPTZ,
  signed_by_name      TEXT,
  performed_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  billable            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_orders_ticket      ON repair_orders(ticket_id);
CREATE INDEX idx_repair_orders_appointment ON repair_orders(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_repair_orders_status      ON repair_orders(status);

CREATE OR REPLACE FUNCTION set_repair_order_seq()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(seq_number), 0) + 1 INTO NEW.seq_number
  FROM repair_orders WHERE ticket_id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repair_order_seq
  BEFORE INSERT ON repair_orders
  FOR EACH ROW EXECUTE FUNCTION set_repair_order_seq();

CREATE TRIGGER trg_repair_orders_updated_at
  BEFORE UPDATE ON repair_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TABLE repair_order_entries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id          UUID NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  employee_id              UUID NOT NULL REFERENCES employees(id),
  -- Stundensatz für die Arbeit (Gerätetyp-abhängig, vom Techniker beim Eintrag gewählt)
  service_rate_code        TEXT NOT NULL REFERENCES service_rates(code),
  work_minutes             INTEGER NOT NULL DEFAULT 0 CHECK (work_minutes >= 0),
  -- Anfahrt: drei mögliche Modi
  travel_mode              TEXT CHECK (travel_mode IN ('none', 'pauschale', 'km_plus_wegzeit', 'km_inkl_wegzeit')),
  travel_zone_code         TEXT REFERENCES travel_zones(code),
  travel_km                NUMERIC(6,2) CHECK (travel_km IS NULL OR travel_km >= 0),
  travel_wegzeit_minutes   INTEGER DEFAULT 0 CHECK (travel_wegzeit_minutes >= 0),
  note                     TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Konsistenz: Modus passt zu den Feldern
  CHECK (
    travel_mode IS NULL
    OR travel_mode = 'none'
    OR (travel_mode = 'pauschale'        AND travel_zone_code IS NOT NULL)
    OR (travel_mode = 'km_plus_wegzeit'  AND travel_km IS NOT NULL)
    OR (travel_mode = 'km_inkl_wegzeit'  AND travel_km IS NOT NULL)
  )
);

CREATE INDEX idx_repair_order_entries_repair   ON repair_order_entries(repair_order_id);
CREATE INDEX idx_repair_order_entries_employee ON repair_order_entries(employee_id);

CREATE TABLE repair_order_materials (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id    UUID NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  mesonic_artikel_nr TEXT NOT NULL,
  bezeichnung        TEXT NOT NULL,
  quantity           NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total              NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_materials_repair  ON repair_order_materials(repair_order_id);
CREATE INDEX idx_repair_materials_artikel ON repair_order_materials(mesonic_artikel_nr);

-- ────────────────────────────────────────────────────────────────────
-- ticket_comments — Kommentare + System-Events
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE ticket_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'comment'
              CHECK (kind IN ('comment', 'status_change', 'assignment', 'system')),
  body        TEXT,
  metadata    JSONB,
  created_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_comments_ticket  ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_created ON ticket_comments(created_at);

-- ────────────────────────────────────────────────────────────────────
-- ticket_attachments — Storage-Referenzen (Fotos, Dokumente)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE ticket_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID REFERENCES tickets(id) ON DELETE CASCADE,
  repair_order_id UUID REFERENCES repair_orders(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,                 -- 'tickets/<ticket_id>/<filename>'
  filename        TEXT NOT NULL,
  content_type    TEXT,
  size_bytes      BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by     UUID REFERENCES employees(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ticket_id IS NOT NULL OR repair_order_id IS NOT NULL)
);

CREATE INDEX idx_ticket_attachments_ticket ON ticket_attachments(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_ticket_attachments_repair ON ticket_attachments(repair_order_id) WHERE repair_order_id IS NOT NULL;

-- Storage-Bucket (private, signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- RLS Policies (permissive für jetzt, wie restliche App; später härten)
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE service_rates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_zones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_number_counters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_assignees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order_materials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments      ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_access ON service_rates           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON travel_zones            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON ticket_number_counters  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON tickets                 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON appointments            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON appointment_assignees   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON repair_orders           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON repair_order_entries    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON repair_order_materials  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON ticket_comments         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON ticket_attachments      FOR ALL USING (true) WITH CHECK (true);
