-- Reconcile stored totals for Leihstellung (rental) offers saved before the
-- priceOverride fix. Back then a rental's net was kept fresh on the cart line /
-- custom item, but the `totals` memo (keyed on `cart`) froze at an earlier
-- value — so the saved total_once/total_period could disagree with the offer
-- line. Result: the list + details summary showed a different number than the
-- POSITIONEN line (e.g. €51,80 vs €423,80).
--
-- The rental custom-item price is the correct net (it equals
-- buildRentalOffer(rental).netto and is what the offer line shows). A rental
-- offer has exactly this one line, so total_once = total_period = that price.
-- Only rows whose totals actually diverge are touched; the 'leihstellung-pos'
-- key is unique to rental offers, so non-rental offers are never affected.
UPDATE offers
SET
  total_once   = (offer_data->'customItems'->'leihstellung-pos'->>'price')::numeric,
  total_period = (offer_data->'customItems'->'leihstellung-pos'->>'price')::numeric
WHERE (offer_data->'customItems') ? 'leihstellung-pos'
  AND (offer_data->'customItems'->'leihstellung-pos'->>'price') IS NOT NULL
  AND (
    total_once   IS DISTINCT FROM (offer_data->'customItems'->'leihstellung-pos'->>'price')::numeric
    OR total_period IS DISTINCT FROM (offer_data->'customItems'->'leihstellung-pos'->>'price')::numeric
  );
