-- ════════════════════════════════════════════════════════════════════
-- Reconcile employee email + phone with the authoritative company
-- directory ("Telefon- und E-Mail-Verzeichnis Mitarbeiter", 03.07.2026).
--
-- The employees table is now the single source of truth for staff email
-- (customer-facing offer PDF, accept notifications) and SSO login
-- matching, but several addresses were wrong/guessed:
--   * the f.lastname@ forms (g.kitz@, h.bauer@, a.nowak@, …) were aliases,
--     not the real mailboxes — the directory uses short forms (kg@, bh@,
--     na@, …), which also match the Microsoft SSO login exactly.
--   * Marcel Klein was km@ but is actually kma@.
--
-- Phone = Standort base number + the employee's DW (Durchwahl):
--   Wolfsberg  04352 4176  → "+43 4352 4176 <DW>"
--   Klagenfurt 0463 504454 → "+43 463 504454 <DW>"
-- (Pavo Filipovic has no DW → no direct line.)
--
-- Keyed by the stable employees.code. Fr. Mera is inactive → skipped.
-- ════════════════════════════════════════════════════════════════════

UPDATE employees SET email = v.email, phone = v.phone
FROM (VALUES
  -- Wolfsberg (base 04352 4176)
  ('hkitz',         'kh@kitz.co.at',          '+43 4352 4176 15'),
  ('hbauer',        'bh@kitz.co.at',          '+43 4352 4176 21'),
  ('dscharf',       'sd@kitz.co.at',          '+43 4352 4176 22'),
  ('mgraf',         'gm@kitz.co.at',          '+43 4352 4176 31'),
  ('sbauer',        'bs@kitz.co.at',          '+43 4352 4176 32'),
  ('coberlerchner', 'oc@kitz.co.at',          '+43 4352 4176 38'),
  ('mbuchbauer',    'bm@kitz.co.at',          '+43 4352 4176 37'),
  ('mmaier',        'mm@kitz.co.at',          '+43 4352 4176 36'),
  ('skumpusch',     's.kumpusch@kitz.co.at',  '+43 4352 4176 41'),
  ('hscheiber',     'sh@kitz.co.at',          '+43 4352 4176 43'),
  ('dthorer',       'td@kitz.co.at',          '+43 4352 4176 12'),
  ('bzmug',         'zb@kitz.co.at',          '+43 4352 4176 11'),
  ('wkriegl',       'kw@kitz.co.at',          '+43 4352 4176 51'),
  ('sriedl',        'rs@kitz.co.at',          '+43 4352 4176 52'),
  -- Klagenfurt (base 0463 504454)
  ('aflagl',        'fa@kitz.co.at',          '+43 463 504454 72'),
  ('ahuber',        'ha@kitz.co.at',          '+43 463 504454 83'),
  ('hrussnig',      'rh@kitz.co.at',          '+43 463 504454 71'),
  ('pfilipovic',    'fp@kitz.co.at',          NULL),
  ('anowak',        'na@kitz.co.at',          '+43 463 504454 82'),
  ('gtriebelnig',   'tg@kitz.co.at',          '+43 463 504454 61'),
  ('gkitz',         'kg@kitz.co.at',          '+43 463 504454 77'),
  ('klein',         'kma@kitz.co.at',         '+43 463 504454 73')
) AS v(code, email, phone)
WHERE employees.code = v.code;
