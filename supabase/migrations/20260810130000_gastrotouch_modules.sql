-- Add the GastroTouch module price list (UVP-Preisliste, Stand Jänner 2024)
-- under the existing GASTROTOUCH catalog: one-time purchase price (net) plus
-- Software-Wartung pro Jahr = 30% of the UVP (servicePercent), grouped under a
-- new "Module" category. Mirrors the same items in
-- src/features/offers/data/catalogs.ts (GASTROTOUCH_MODULE, the offline
-- fallback). Same shape as the MELZER positions (Einmalpreis + 30% Wartung).
--
-- The modules sort before the existing update price list, so first shift the
-- 12 update rows (currently sort 0-11) to 18-29, then insert the modules at
-- 0-17 — matching the regenerated seed migration.
UPDATE products SET sort = sort + 18
  WHERE catalog = 'GASTROTOUCH' AND code LIKE '160671%' AND sort < 18;

INSERT INTO products (id, code, name, catalog, category, kind, note, info, pricing, attrs, auto_add, sort) VALUES
  ('gt-mod-grund-voll', NULL, 'Grundmodul „Voll" inkl. BackOffice', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":950,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 0),
  ('gt-mod-grund-light', NULL, 'Grundmodul „Light"', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":650,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 1),
  ('gt-mod-arbeitsplatz', NULL, 'Jeder weitere Arbeitsplatz', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":600,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 2),
  ('gt-mod-01-zimmer', NULL, 'Zimmer, Stammgäste, =Kreditm. (Modul 1)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":350,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 3),
  ('gt-mod-02-lager', NULL, 'Lagerverwaltung (Modul 2)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":300,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 4),
  ('gt-mod-03-zeit', NULL, 'Zeiterfassung (Modul 3)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":250,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 5),
  ('gt-mod-04-funk', NULL, 'Funksystem-Handy pro Handy (Modul 4)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":290,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 6),
  ('gt-mod-05-schank', NULL, 'Schankverbund (Modul 5)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":670,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 7),
  ('gt-mod-06-backoffice2', NULL, 'ab 2. BackOffice (Modul 6)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":300,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 8),
  ('gt-mod-07-hotel', NULL, 'Hotelverbund (Modul 7)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":650,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 9),
  ('gt-mod-10-bankomat', NULL, 'Bankomat / Kreditkartenschnittstelle (Modul 10)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":400,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 10),
  ('gt-mod-10-gastroid', NULL, 'Gastroid / Six-Anbindung pro Handy', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":100,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 11),
  ('gt-mod-12-bondispo', NULL, 'Bondispo (Modul 12)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":470,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 12),
  ('gt-mod-12-bondispo-ms', NULL, 'Bondispo „Master/Slave"', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":670,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 13),
  ('gt-mod-13-gastrocontrol', NULL, 'Gastro Control (Modul 13)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":320,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 14),
  ('gt-mod-18-export', NULL, 'Exportmodul (Modul 18)', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":440,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 15),
  ('gt-mod-incert', NULL, 'Gutscheinschnittstelle INCERT', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":600,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 16),
  ('gt-mod-treuepass', NULL, 'Treuepass-, Report-, Bestell-APP', 'GASTROTOUCH', 'Module', 'o', NULL, NULL, '{"price":320,"servicePercent":30}'::jsonb, '{}'::jsonb, NULL, 17)
ON CONFLICT (id) DO NOTHING;
