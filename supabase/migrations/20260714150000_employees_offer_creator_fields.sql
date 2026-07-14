-- ════════════════════════════════════════════════════════════════════
-- Move the offer-creator contact details onto the employees table so the
-- hardcoded TEAM catalog (src/features/offers/data/catalogs.ts) can be
-- deleted and employees becomes the single source of truth.
--
-- The offer PDF's "Ihr Ansprechpartner" block needs name/role/phone/email;
-- employees already has name/email but lacks a phone and a display role.
-- Add them and backfill the 10 curated offer creators (marked by
-- team_slug, set in 20260714140000) from the values that lived in TEAM.
-- Location for the dropdown hint is resolved live from the standorte join,
-- so no location column is needed.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone     TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title TEXT;

UPDATE employees SET phone = v.phone, job_title = v.title
FROM (VALUES
  ('gkitz',        '+43 463 504454 77',  'Geschäftsführung'),
  ('hbauer',       '+43 4352 4176 21',   'Verkauf'),
  ('dscharf',      '+43 4352 4176 22',   'Verkauf'),
  ('anowak',       '+43 463 504454 82',  'Verkauf'),
  ('thuber',       '+43 664 886 033 14', 'Kassensystemberater'),
  ('hscheiber',    '+43 4352 4176 43',   'Software Support'),
  ('mklein',       '+43 463 504454 73',  'Support'),
  ('hrussnig',     '+43 463 504454 71',  'EDV / Technik'),
  ('coberlerchner','+43 4352 4176 38',   'Technik'),
  ('hkitz',        '+43 4352 4176 15',   'Geschäftsführer')
) AS v(slug, phone, title)
WHERE employees.team_slug = v.slug;
