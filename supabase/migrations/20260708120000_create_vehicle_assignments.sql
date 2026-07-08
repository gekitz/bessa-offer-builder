-- ════════════════════════════════════════════════════════════════════
-- Fahrzeug-Zuordnung: Webfleet-Fahrzeug → Techniker
-- ════════════════════════════════════════════════════════════════════
--
-- Webfleet trackt fahrzeug-bezogen (kein Fahrer-Login). In der Regel
-- fährt ein Techniker sein festes Fahrzeug; gelegentlich wird getauscht.
-- Diese Tabelle bildet genau das ab:
--   • Stehende Zuordnung   → valid_to IS NULL  (gilt "bis auf Weiteres")
--   • Tausch an einem Tag  → zusätzliche Zeile mit valid_from/valid_to
--
-- Auflösung (im App-Layer, siehe lib/webfleetTrips.ts):
--   Für (Techniker, Datum) gilt die Zeile, die das Datum abdeckt und
--   das späteste valid_from hat — so gewinnt ein Tages-Tausch über die
--   stehende Zuordnung.

CREATE TABLE vehicle_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Webfleet-Objektreferenz. objectno = das im WEBFLEET.connect-API
  -- verwendete Kennzeichen/Kürzel des Fahrzeugs (z. B. "W-1234").
  webfleet_object_no TEXT NOT NULL,
  -- Anzeige-Kennzeichen + optionale Bezeichnung fürs UI.
  plate              TEXT,
  label              TEXT,
  valid_from         DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to           DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX idx_vehicle_assignments_employee ON vehicle_assignments(employee_id);
CREATE INDEX idx_vehicle_assignments_object   ON vehicle_assignments(webfleet_object_no);
CREATE INDEX idx_vehicle_assignments_validity ON vehicle_assignments(valid_from, valid_to);

CREATE TRIGGER trg_vehicle_assignments_updated_at
  BEFORE UPDATE ON vehicle_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- RLS: permissiv wie der Rest der App (später härten).
ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_access ON vehicle_assignments FOR ALL USING (true) WITH CHECK (true);
