-- ════════════════════════════════════════════════════════════════════
-- Fix sales-rep name: "Daniel Scharf" → "Daniel Scharf-Kraxner".
--
-- The employees table is the single source of truth for the rep's name
-- (offer creator, tickets, shifts, leave, PDF "Ihr Ansprechpartner").
-- The offer builder resolves the creator display name from this row via
-- the team_slug link, so correcting it here fixes it app-wide. Keyed on
-- the stable code 'dscharf' (team_slug stays 'dscharf').
-- ════════════════════════════════════════════════════════════════════

UPDATE employees
SET name = 'Daniel Scharf-Kraxner'
WHERE code = 'dscharf';
