-- ════════════════════════════════════════════════════════════════════
-- Real weekly hours for the part-time staff.
--
-- The workforce seed set every employee to the 38.5h full-time
-- placeholder. The only part-timers are the three 4-day-week employees,
-- confirmed by their Urlaub grants (20/20/24 = 0.8 × 25/25/30):
--   Kriegl, Riedl, Triebelnig → 0.8 FTE → 38.5 × 0.8 = 30.8h/Woche.
-- Everyone else is genuinely full-time 38.5h, so the seed value already
-- holds for them.
-- ════════════════════════════════════════════════════════════════════

UPDATE employees
SET weekly_hours = 30.8,
    employment_type = 'parttime'
WHERE code IN ('wkriegl', 'sriedl', 'gtriebelnig');
