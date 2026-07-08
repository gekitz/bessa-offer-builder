-- Korrektur: Heribert Scheiber ist am Standort Wolfsberg (2), nicht
-- Klagenfurt (1). Der Seed in 20260708130000 hatte ihn initial mit
-- Standort 1 angelegt. Idempotent — auf einem frischen Build (mit dem
-- bereits korrigierten Seed) ein No-Op.
UPDATE employees SET standort_id = 2 WHERE code = 'hscheiber';
