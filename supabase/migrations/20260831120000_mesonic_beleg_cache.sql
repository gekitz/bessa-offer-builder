-- ════════════════════════════════════════════════════════════════════
-- Mesonic-Beleg-Cache — CRM-weit, keyed by Kd.Nr. (NICHT an Viertl gebunden)
--
-- Belege gehören einem Mesonic-Kunden (Kontonummer), nicht einer Viertl-
-- Zeile. Daher liegt der Cache bewusst eigenständig: jede Funktion
-- (Viertl, künftiges CRM, Angebote) liest denselben Cache per Kd.Nr.
--
-- Belege sind UNVERÄNDERLICH → wir cachen sie dauerhaft und laden per
-- mesonic_beleg_sync.synced_index nur NEUE Belege nach (Resume-Zeiger).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE mesonic_beleg (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesonic_kdnr  TEXT NOT NULL,
  beleg_index   INTEGER NOT NULL,          -- die laufende <n> aus Key <kdnr>-<n>
  laufnummer    TEXT,                       -- interne WinLine-Laufnummer (≠ index)
  belegart      TEXT,
  datum_faktura DATE,
  positions     JSONB NOT NULL DEFAULT '[]',
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mesonic_kdnr, beleg_index)
);

CREATE INDEX idx_mesonic_beleg_kdnr ON mesonic_beleg(mesonic_kdnr, datum_faktura DESC NULLS LAST);

-- Wie weit wurde pro Kunde gescannt (höchster abgefragter Index). Nächster
-- Sync startet bei synced_index + 1 → nur neue Belege.
CREATE TABLE mesonic_beleg_sync (
  mesonic_kdnr  TEXT PRIMARY KEY,
  synced_index  INTEGER NOT NULL DEFAULT 0,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mesonic_beleg      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesonic_beleg_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on mesonic_beleg" ON mesonic_beleg
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on mesonic_beleg_sync" ON mesonic_beleg_sync
  FOR ALL USING (true) WITH CHECK (true);
