-- bessa Kauflizenz – „AKTION UMSTIEG", Preisliste Stand 01.10.2026.
-- One-time purchase price (net) + yearly Wartung. Regular Wartung = 30% of the
-- purchase price; the Umstieg campaign grants a permanent −50% → effectively
-- 15% (servicePercent). For replacing old POS systems (Austria only, against
-- proof of the replaced till). Same shape as the MELZER / GastroTouch positions
-- (Einmalpreis + Wartung). Mirrors BESSA_KAUF in catalogSeed.ts (offline copy).
INSERT INTO products (id, code, name, catalog, category, kind, note, info, pricing, attrs, auto_add, sort) VALUES
  ('bk-100',  '100',  'Mobile Kassa',                            'BESSA_KAUF', 'Kassa – Mobil',             'o', NULL, NULL,                    '{"price":479,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 0),
  ('bk-110',  '110',  'Kleiner Handelsbetrieb',                  'BESSA_KAUF', 'Kassa – Handel',            'o', NULL, NULL,                    '{"price":605,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 1),
  ('bk-111',  '111',  'Großer Handelsbetrieb',                   'BESSA_KAUF', 'Kassa – Handel',            'o', NULL, NULL,                    '{"price":1058,"servicePercent":15}'::jsonb, '{}'::jsonb, NULL, 2),
  ('bk-120',  '120',  'Kleiner Gastrobetrieb',                   'BESSA_KAUF', 'Kassa – Gastro',            'o', NULL, NULL,                    '{"price":1134,"servicePercent":15}'::jsonb, '{}'::jsonb, NULL, 3),
  ('bk-121',  '121',  'Großer Gastrobetrieb',                    'BESSA_KAUF', 'Kassa – Gastro',            'o', NULL, NULL,                    '{"price":1562,"servicePercent":15}'::jsonb, '{}'::jsonb, NULL, 4),
  ('bk-020',  '020',  'Zusätzlicher Bediener',                   'BESSA_KAUF', 'Kassa – Einzelfunktionen',  'o', NULL, NULL,                    '{"price":76,"servicePercent":15}'::jsonb,   '{}'::jsonb, NULL, 5),
  ('bk-021',  '021',  'Kundenverwaltung',                        'BESSA_KAUF', 'Kassa – Einzelfunktionen',  'o', NULL, 'pro Filiale',           '{"price":252,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 6),
  ('bk-022',  '022',  'Lagerverwaltung',                         'BESSA_KAUF', 'Kassa – Einzelfunktionen',  'o', NULL, 'pro Filiallager',       '{"price":378,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 7),
  ('bk-023',  '023',  'Lokale Gutscheinverwaltung',              'BESSA_KAUF', 'Kassa – Einzelfunktionen',  'o', NULL, 'pro Filiale',           '{"price":252,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 8),
  ('bk-024',  '024',  'Erweitertes Berichtswesen',               'BESSA_KAUF', 'Kassa – Einzelfunktionen',  'o', NULL, NULL,                    '{"price":454,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 9),
  ('bk-040a', '040a', 'Anbindung bessa Zahlen (Kartenzahlung)',  'BESSA_KAUF', 'Kassa – Externe Systeme',   'o', NULL, NULL,                    '{"price":0}'::jsonb,                         '{}'::jsonb, NULL, 10),
  ('bk-040',  '040',  'Anbindung Kartenzahlungsterminal',        'BESSA_KAUF', 'Kassa – Externe Systeme',   'o', NULL, 'pro Filiale/Anbieter',  '{"price":302,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 11),
  ('bk-042',  '042',  'Nebenterminal',                           'BESSA_KAUF', 'Kassa – Externe Systeme',   'o', NULL, 'pro Terminal',          '{"price":353,"servicePercent":15}'::jsonb,  '{}'::jsonb, NULL, 12)
ON CONFLICT (id) DO NOTHING;
