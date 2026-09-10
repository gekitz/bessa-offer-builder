-- ════════════════════════════════════════════════════════════════════
-- KM-Geld rate bump: 0.57 → 0.75 €/km.
--
-- The standard travel km rate (KM_PLUS_WEGZEIT, "Wegzeit separat") was
-- seeded at 0.57 (20260512120000) and never changed since — the live value
-- read back as exactly 0.57 before this bump. New rate is 0.75 €/km.
-- billing.ts reads this live from service_rates, so this is the single
-- source of truth for the calculation.
--
-- KM_INKL_WEGZEIT (special agreement, 1.10) is left unchanged.
-- ════════════════════════════════════════════════════════════════════

UPDATE service_rates SET rate = 0.75 WHERE code = 'KM_PLUS_WEGZEIT';
