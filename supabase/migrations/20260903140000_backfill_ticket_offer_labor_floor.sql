-- Backfill offer_labor_minutes / offer_labor_rate on OPEN fulfillment tickets
-- created from an accepted offer BEFORE 20260903130000 added the labor-floor
-- feature. Those tickets have the columns at their DEFAULT (0 / NULL) because
-- the offers they came from were sent before computeAcceptTotals froze
-- laborMinutes/laborAmount into offer_data.acceptSnapshot — so the accept
-- trigger had nothing to copy.
--
-- We recompute the quoted labor directly from offer_data.cart, mirroring
-- src/lib/acceptTotals.js::computeLabor:
--   * an item counts as labor when its kind is 'h' (Arbeitszeit + hourly
--     Dienstleistungen); the merged item def is the products row, falling back
--     to offer_data.customItems (products win — matches computeAcceptTotals).
--   * hours   = qty + discountQty
--   * unit €  = priceOverride ?? catalog/custom price   (no hourly product
--               carries a discount — verified against the catalog — so the
--               discountQty portion is priced at the same unit €)
--   * counted = skip `optional` lines and unselected option-group members
--               (countedIds semantics)
--   * rate    = amount / hours  (weighted; the frozen unit rate)
--
-- Idempotent + safe: only OPEN tickets (never closed/cancelled), only rows
-- still at offer_labor_minutes = 0 (never overwrites a trigger-set value), and
-- only when the computed floor is > 0. These tickets have not been billed to
-- Mesonic yet (offer_labor_floor_billed_minutes = 0), so setting the floor now
-- cannot conflict with an exported Beleg.

DO $$
DECLARE
  v_count integer;
BEGIN
  WITH labor AS (
    SELECT
      tk.id AS ticket_id,
      SUM(COALESCE((ce.value->>'qty')::numeric, 0)
          + COALESCE((ce.value->>'discountQty')::numeric, 0)) AS hours,
      SUM(
        COALESCE(
          NULLIF(ce.value->>'priceOverride', '')::numeric,   -- per-line override wins
          (p.pricing->>'price')::numeric,                     -- product flat price (hourly)
          (o.offer_data->'customItems'->ce.key->'p'->>'o')::numeric,
          (o.offer_data->'customItems'->ce.key->>'price')::numeric,
          0
        )
        * (COALESCE((ce.value->>'qty')::numeric, 0)
           + COALESCE((ce.value->>'discountQty')::numeric, 0))
      ) AS amount
    FROM tickets tk
    JOIN offers o ON o.id = tk.offer_id
    CROSS JOIN LATERAL jsonb_each(COALESCE(o.offer_data->'cart', '{}'::jsonb)) AS ce
    LEFT JOIN products p ON p.id = ce.key
    WHERE tk.offer_id IS NOT NULL
      AND tk.status NOT IN ('closed', 'cancelled')
      AND tk.offer_labor_minutes = 0
      -- kind: products row wins, else the custom item's `t`
      AND COALESCE(p.kind, o.offer_data->'customItems'->ce.key->>'t') = 'h'
      -- countedIds: optional lines never count
      AND (ce.value->>'optional') IS DISTINCT FROM 'true'
      -- countedIds: for an option-group member, only the selected one counts
      AND NOT (
        ce.value ? 'optionGroup'
        AND (ce.value->>'optionSelected') IS DISTINCT FROM 'true'
      )
    GROUP BY tk.id
  )
  UPDATE tickets tk
  SET offer_labor_minutes = round(labor.hours * 60),
      offer_labor_rate    = round(labor.amount / labor.hours, 2)
  FROM labor
  WHERE tk.id = labor.ticket_id
    AND labor.hours > 0
    AND round(labor.hours * 60) > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'labor-floor backfill: % ticket(s) updated', v_count;
END $$;
