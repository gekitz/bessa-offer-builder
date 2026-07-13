-- Arbeitszeit (€118 "pro Stunde") was seeded as kind 'o' (one-time) but is an
-- hourly rate. Reclassify it as 'h' so the offer builder shows an editable
-- fractional-hours field and the PDF adds the "(N Std.)" label.
UPDATE products
SET kind = 'h'
WHERE id = 'b01429e1-672e-44ae-ae79-1d08c4f7f918';
