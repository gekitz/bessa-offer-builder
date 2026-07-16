-- Backfill offer_data.acceptSnapshot for payment-enabled offers that predate
-- the snapshotting feature, so the anonymous accept page no longer needs the
-- bundled product catalog to compute totals (RLS blocks anon from `products`,
-- so the old fallback read a stale hand-maintained copy).
--
-- Derived from the stored quoted totals (total_monthly / total_once /
-- total_period) + the offer's tier — the same identity AcceptanceDetails
-- already uses: yearly = period - monthly*months - once. These are the actual
-- quoted numbers, so this is strictly more accurate than recomputing against
-- the live catalog. Only fills rows that are missing the snapshot.
UPDATE offers AS o
SET offer_data = jsonb_set(
  COALESCE(o.offer_data, '{}'::jsonb),
  '{acceptSnapshot}',
  jsonb_build_object(
    'monthly',     COALESCE(o.total_monthly, 0),
    'once',        COALESCE(o.total_once, 0),
    'periodTotal', COALESCE(o.total_period, 0),
    'maxMonths',   t.months,
    'yearly',      GREATEST(
      0,
      COALESCE(o.total_period, 0) - COALESCE(o.total_monthly, 0) * t.months - COALESCE(o.total_once, 0)
    )
  ),
  true
)
FROM (
  SELECT id,
    CASE COALESCE(offer_data->>'globalTier', '12mo')
      WHEN '12mo'  THEN 12
      WHEN '6mo'   THEN 6
      WHEN '2mo'   THEN 2
      WHEN 'event' THEN 1
      ELSE 12
    END AS months
  FROM offers
) AS t
WHERE o.id = t.id
  AND o.payment_enabled = true
  AND (o.offer_data -> 'acceptSnapshot') IS NULL;
