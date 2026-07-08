-- ════════════════════════════════════════════════════════════════════
-- Seed: Webfleet Fahrzeug-Zuordnungen (Baseline, Stand 2026-07-08)
-- ════════════════════════════════════════════════════════════════════
--
-- Basis-Mapping aus dem Webfleet-Standardfahrer je Fahrzeug. Zwei Fahrer
-- fehlten in den Stammdaten und werden angelegt. Fahrzeuge ohne festen
-- Fahrer (002, 004, 013) bleiben unzugeordnet. Künftige Wechsel laufen
-- über die App (datierte vehicle_assignments-Zeilen).

-- Techniker, die Firmenfahrzeuge fahren, aber noch nicht als Mitarbeiter
-- erfasst waren.
INSERT INTO employees (code, name, standort_id) VALUES
  ('hscheiber',  'Heribert Scheiber', 2),  -- Wolfsberg
  ('pfilipovic', 'Pavo Filipovic',    1)   -- Klagenfurt
ON CONFLICT (code) DO NOTHING;

-- Stehende Zuordnung: Webfleet objectno → Techniker (per employee.code).
INSERT INTO vehicle_assignments (employee_id, webfleet_object_no, label, valid_from)
SELECT e.id, v.object_no, v.label, DATE '2026-07-08'
FROM (VALUES
  ('001', 'Renault Kangoo lang',   'hrussnig'),
  ('003', 'Nissan NV200 Diesel',   'mgraf'),
  ('005', 'Nissan NV200 Benzin',   'sbauer'),
  ('006', 'Peugeot Rifter',        'hscheiber'),
  ('007', 'Renault Kangoo Wo',     'mbuchbauer'),
  ('008', 'Renault Express',       'coberlerchner'),
  ('009', 'Fiat Fiorino Klgft',    'pfilipovic'),
  ('010', 'ZOE',                   'skumpusch'),
  ('011', 'Peugeot Partner Tepee', 'aflagl'),
  ('012', 'Nissan Townstar Klgft', 'ahuber')
) AS v(object_no, label, code)
JOIN employees e ON e.code = v.code;
