-- ════════════════════════════════════════════════════════════════════
-- Single source of truth for sales-rep identity.
--
-- The offer builder stores the creator as a TEAM slug (offers.creator_id,
-- e.g. 'mklein') plus a *snapshot* of the rep's name/email taken from the
-- hardcoded TEAM catalog (src/features/offers/data/catalogs.ts). Those
-- snapshot emails have drifted from the employees table — the authority
-- for all staff comms (tickets, shifts, leave, web push). E.g. TEAM had
-- m.klein@ / h.scheiber@ / t.huber@ while employees has km@ / sh@ /
-- a.huber@.
--
-- Link employees to the TEAM slug so notifications can resolve the
-- creator's *live* email + push subscriptions from employees, instead of
-- trusting the drifting snapshot. Backfilled by identity (names are unique
-- in the employees table; the 3 email-mismatched reps map cleanly by name:
-- Toni Huber → Anton Huber, plus Scheiber and Klein).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_slug TEXT UNIQUE;

UPDATE employees SET team_slug = v.slug
FROM (VALUES
  ('Georg Kitz',            'gkitz'),
  ('Helmut Bauer',          'hbauer'),
  ('Daniel Scharf',         'dscharf'),
  ('Andreas Nowak',         'anowak'),
  ('Anton Huber',           'thuber'),
  ('Heribert Scheiber',     'hscheiber'),
  ('Marcel Klein',          'mklein'),
  ('Heimo Russnig',         'hrussnig'),
  ('Christian Oberlerchner','coberlerchner'),
  ('Herbert Kitz',          'hkitz')
) AS v(name, slug)
WHERE employees.name = v.name;

CREATE INDEX IF NOT EXISTS idx_employees_team_slug
  ON employees(team_slug) WHERE team_slug IS NOT NULL;
