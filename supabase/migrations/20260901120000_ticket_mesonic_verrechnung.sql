-- Ticket → Mesonic Verrechnung: Grundlage für den Reparaturschein-Beleg-Export.
-- Siehe docs/ticket-mesonic-verrechnung.md.

-- ── Vertreternummer je Mitarbeiter ────────────────────────────────────
-- Treibt den Arbeitszeit-/Reise-Artikel 30000XX{WO/KL} (XX = Vertreternummer,
-- Suffix = Heimat-Standort des Mitarbeiters). Aus dem Telefonverzeichnis 2025
-- (Spalte V). NICHT unique: die Büro-Sammelnummer 22 ist mehrfach vergeben,
-- Herbert nutzt die Wolfsberg-Nummer 10 (KL-Nummer 35 ungenutzt).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS mesonic_rep_id TEXT;

UPDATE employees AS e SET mesonic_rep_id = v.rep
FROM (VALUES
  -- Techniker / EDV (schreiben Reparaturscheine)
  ('sh@kitz.co.at',         '9'),   -- Scheiber Heribert (Heri), WO
  ('gm@kitz.co.at',         '12'),  -- Graf Mario, WO
  ('oc@kitz.co.at',         '15'),  -- Oberlerchner Christian, WO
  ('s.kumpusch@kitz.co.at', '17'),  -- Kumpusch Sandro, WO
  ('mm@kitz.co.at',         '19'),  -- Maier Marc, WO
  ('bm@kitz.co.at',         '21'),  -- Buchbauer Marco, WO
  ('bs@kitz.co.at',         '28'),  -- Bauer Stefan, WO
  ('rh@kitz.co.at',         '33'),  -- Russnig Heimo, KL
  ('fa@kitz.co.at',         '34'),  -- Flagel Alexander, KL
  ('ha@kitz.co.at',         '37'),  -- Huber Anton, KL
  ('fp@kitz.co.at',         '44'),  -- Filipovic Pavo, KL
  ('kma@kitz.co.at',        '46'),  -- Klein Marcel, KL
  ('kg@kitz.co.at',         '26'),  -- Kitz Georg, KL
  ('kh@kitz.co.at',         '10'),  -- Kitz Herbert → Wolfsberg-Nummer 10
  -- Verkauf / Buchhaltung (i. d. R. keine Reparaturscheine, der Vollständigkeit halber)
  ('bh@kitz.co.at',         '2'),   -- Bauer Helmut
  ('sd@kitz.co.at',         '16'),  -- Scharf-Kraxner Daniel
  ('na@kitz.co.at',         '36'),  -- Nowak Andreas
  ('tg@kitz.co.at',         '30'),  -- Triebelnig Gudrun
  ('kd@kitz.co.at',         '7')    -- Kitz Dorothea
) AS v(email, rep)
WHERE lower(e.email) = v.email;

-- ── Beleg-Tracking je Reparaturschein ─────────────────────────────────
-- Ein WinLine-Beleg pro Reparaturschein (tickets.mesonic_beleg_id reicht nicht).
-- mesonic_beleg_key (<konto>-<laufnummer>) ist der Idempotenz-Anker: ist er
-- gesetzt, wurde der Schein bereits exportiert und wird beim erneuten Abschluss
-- übersprungen.
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS mesonic_beleg_laufnummer INTEGER;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS mesonic_beleg_key        TEXT;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS mesonic_beleg_created_at TIMESTAMPTZ;
