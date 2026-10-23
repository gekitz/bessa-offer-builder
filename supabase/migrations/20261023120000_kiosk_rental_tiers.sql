-- Gastro-Kiosk-Bestellungen (code 203) only carried the 12-Monate (y=99) and
-- 6-Monate (s=125) subscription tiers, so it could not be priced in a
-- short-term rental offer: at the 2-Monate (Märkte) or Event (1-3 Tage) tier
-- the builder silently fell back to the 12-month rate. Add the two missing
-- rental tiers so the module can be included in rental offers.
--   2 Monate (m) = €159  (~1.6× the 12-month rate)
--   Event    (e) = €198  (2× the 12-month rate)
-- Mirrors the house pattern used by the Gastro Kassa products and keeps the
-- existing "Weiterer Kiosk" −50% discount untouched.
UPDATE products
SET pricing = jsonb_set(
      jsonb_set(pricing, '{tiers,m}', '159'::jsonb, true),
      '{tiers,e}', '198'::jsonb, true),
    updated_at = now()
WHERE id = 'd2c207cf-3c6f-41f6-a1df-739e8e48d4bb';
