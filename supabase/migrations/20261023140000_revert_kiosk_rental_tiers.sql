-- Revert 20261023120000_kiosk_rental_tiers.sql. The 2-Monate (m) and Event (e)
-- tiers were added to Gastro-Kiosk-Bestellungen (code 203) in the wrong place:
-- they surface Märkte/Events pills for this module in the main offer builder,
-- which is not wanted. The Gastro Kiosk is instead offered through the POS
-- Leihstellung (rental) calculator (RENTAL_SOFTWARE_IDS). Strip the two tiers
-- back to the original {y:99, s:125}; the "Weiterer Kiosk" discount is kept.
UPDATE products
SET pricing = (pricing #- '{tiers,m}') #- '{tiers,e}',
    updated_at = now()
WHERE id = 'd2c207cf-3c6f-41f6-a1df-739e8e48d4bb';
