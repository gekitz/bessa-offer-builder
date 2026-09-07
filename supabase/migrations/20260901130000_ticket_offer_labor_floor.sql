-- ════════════════════════════════════════════════════════════════════
-- Offer labor-hours floor on fulfillment tickets.
--
-- When an offer quotes Arbeitszeit (kind:'h'), the fulfillment ticket must
-- never bill fewer labor hours than the offer quoted. We freeze the quoted
-- labor breakdown from the accept snapshot onto the ticket at creation time
-- so later edits to the offer/catalog can never move a committed floor.
--
--   offer_labor_minutes              — frozen quoted labor minutes.
--   offer_labor_rate                 — frozen weighted rate (€/h), NULL when
--                                      there is no labor at all.
--   offer_labor_floor_billed_minutes — cumulative floor top-up minutes already
--                                      written to Mesonic Belege (drives the
--                                      incremental-export correctness).
--
-- The DEFAULT 0 means already-open tickets are unaffected (floor 0 = no-op);
-- no backfill of historical tickets.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE tickets ADD COLUMN offer_labor_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN offer_labor_rate NUMERIC(10,2);
ALTER TABLE tickets ADD COLUMN offer_labor_floor_billed_minutes INTEGER NOT NULL DEFAULT 0;

-- Re-create the offer-accepted → create-ticket trigger to also copy the
-- frozen labor breakdown from acceptSnapshot. Scalar JSONB extraction only
-- (no product join). The frozen rate defaults to €118 at the source so the
-- billing layer never has to guess. Keeps SECURITY DEFINER (RLS bypass on
-- the anon public-acceptance path).
CREATE OR REPLACE FUNCTION create_ticket_for_accepted_offer()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool SMALLINT;
  v_labor_min  INTEGER;
  v_labor_amt  NUMERIC;
  v_labor_rate NUMERIC(10,2);
BEGIN
  -- Only when an acceptance signal *newly* appears.
  IF NOT (
       (NEW.signed_at   IS NOT NULL AND OLD.signed_at   IS NULL)
    OR (NEW.accepted_at IS NOT NULL AND OLD.accepted_at IS NULL)
    OR (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  ) THEN
    RETURN NEW;
  END IF;

  -- Never create a second ticket for the same offer.
  IF EXISTS (SELECT 1 FROM tickets WHERE offer_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Route by offer type: pos → Kassen (1), sharp/brother (printers) → MFP (5).
  v_pool := CASE NEW.offer_type
    WHEN 'pos'     THEN 1
    WHEN 'sharp'   THEN 5
    WHEN 'brother' THEN 5
    ELSE NULL
  END;

  -- Frozen labor breakdown from the accept snapshot (scalar extraction).
  v_labor_min := COALESCE((NEW.offer_data #>> '{acceptSnapshot,laborMinutes}')::int, 0);
  v_labor_amt := (NEW.offer_data #>> '{acceptSnapshot,laborAmount}')::numeric; -- may be NULL
  v_labor_rate := CASE
                    WHEN v_labor_min > 0
                    THEN round(COALESCE(v_labor_amt, (v_labor_min / 60.0) * 118)
                               / (v_labor_min / 60.0), 2)
                  END; -- NULL only when there is no labor at all

  INSERT INTO tickets (
    title, description, kind, status, pool_abteilung_id,
    customer_name, customer_email, customer_phone, mesonic_customer_id,
    offer_id, billable,
    offer_labor_minutes, offer_labor_rate
  ) VALUES (
    'Angebot angenommen: ' || COALESCE(NULLIF(NEW.customer_company, ''), NEW.customer_name, 'Kunde'),
    CASE
      WHEN COALESCE(NULLIF(NEW.briefing, ''), '') <> ''
        THEN NEW.briefing || E'\n\n' || 'Automatisch aus angenommenem Angebot erstellt.'
      ELSE 'Automatisch aus angenommenem Angebot erstellt.'
    END,
    'installation', 'open', v_pool,
    COALESCE(NULLIF(NEW.customer_company, ''), NEW.customer_name),
    NEW.customer_email, NEW.customer_phone, NEW.mesonic_customer_id,
    NEW.id, TRUE,
    v_labor_min, v_labor_rate
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
