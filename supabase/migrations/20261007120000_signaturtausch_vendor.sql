-- ════════════════════════════════════════════════════════════════════
-- Signaturtausch: Viertl-Register auf mehrere Hersteller verallgemeinern
--
-- Phase A von docs/signaturtausch-register.md. Rein additiv:
--   • vendor        — Hersteller des POS (gastrotouch default / sharp / rch / bhs)
--   • device_model  — Freitext-Gerätemodell ("Sharp XEA217")
--   • source        — Herkunft der Zeile (bestehende 341 ← 'viertl_excel')
-- Bestehende Zeilen werden automatisch vendor='gastrotouch' (DEFAULT) und
-- per Backfill source='viertl_excel'. Der Audit-Trigger wird um die zwei
-- neuen getrackten Spalten erweitert (CREATE OR REPLACE, voller Body).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE viertl_licenses
  ADD COLUMN IF NOT EXISTS vendor TEXT NOT NULL DEFAULT 'gastrotouch'
    CHECK (vendor IN ('gastrotouch','sharp','rch','bhs')),
  ADD COLUMN IF NOT EXISTS device_model TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Bestehende Zeilen stammen aus der Viertl-Excel.
UPDATE viertl_licenses SET source = 'viertl_excel' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_viertl_licenses_vendor ON viertl_licenses(vendor);

-- Audit-Trigger erweitern: auch vendor + device_model protokollieren.
-- Voller Funktionskörper (CREATE OR REPLACE ersetzt die Definition aus
-- 20260827120000_create_viertl_tracking.sql komplett).
CREATE OR REPLACE FUNCTION log_viertl_license_change() RETURNS TRIGGER AS $$
DECLARE
  fld TEXT; oldv TEXT; newv TEXT;
BEGIN
  FOR fld, oldv, newv IN
    SELECT t.f, t.o, t.n FROM (VALUES
      ('status',              OLD.status,                  NEW.status),
      ('customer_status',     OLD.customer_status,         NEW.customer_status),
      ('wartung',             OLD.wartung,                 NEW.wartung),
      ('gastrotouch_version', OLD.gastrotouch_version,     NEW.gastrotouch_version),
      ('hardware_model',      OLD.hardware_model,          NEW.hardware_model),
      ('hardware_needed',     OLD.hardware_needed::text,   NEW.hardware_needed::text),
      ('email',               OLD.email,                   NEW.email),
      ('closed_reason',       OLD.closed_reason,           NEW.closed_reason),
      ('notes',               OLD.notes,                   NEW.notes),
      ('vendor',              OLD.vendor,                  NEW.vendor),
      ('device_model',        OLD.device_model,            NEW.device_model)
    ) AS t(f,o,n)
    WHERE t.o IS DISTINCT FROM t.n
  LOOP
    INSERT INTO viertl_events (license_id, type, field, old_value, new_value, actor_id, actor_name)
    VALUES (NEW.id, 'field_change', fld, oldv, newv, NEW.updated_by_id, NEW.updated_by_name);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
