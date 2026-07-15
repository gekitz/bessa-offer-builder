-- ════════════════════════════════════════════════════════════════════
-- Allow the 'rental' offer type (POS Leihstellung).
--
-- The NewOfferTypeModal PoS step lets the rep pick Kauf ('pos') or
-- Leihstellung ('rental'), and the rental calculator saves offers with
-- offer_type = 'rental'. But the check constraint from
-- 20260630120000_add_offer_type.sql only permitted 'pos'/'sharp'/'brother',
-- so saving a Leihstellung failed with:
--   new row for relation "offers" violates check constraint
--   "offers_offer_type_check"  (SQLSTATE 23514)
--
-- Widen the constraint and route accepted rentals to the Kassen pool (1),
-- since a Leihstellung is a POS product just like a 'pos' offer.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE offers
  DROP CONSTRAINT IF EXISTS offers_offer_type_check;

ALTER TABLE offers
  ADD CONSTRAINT offers_offer_type_check
  CHECK (offer_type IN ('pos', 'sharp', 'brother', 'rental'));

-- Route accepted rentals to Kassen (1), same as 'pos'. Body otherwise
-- unchanged from 20260714120000.
CREATE OR REPLACE FUNCTION create_ticket_for_accepted_offer()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool SMALLINT;
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

  -- Route by offer type: pos/rental → Kassen (1), sharp/brother (printers) → MFP (5).
  v_pool := CASE NEW.offer_type
    WHEN 'pos'     THEN 1
    WHEN 'rental'  THEN 1
    WHEN 'sharp'   THEN 5
    WHEN 'brother' THEN 5
    ELSE NULL
  END;

  INSERT INTO tickets (
    title, description, kind, status, pool_abteilung_id,
    customer_name, customer_email, customer_phone, mesonic_customer_id,
    offer_id, billable
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
    NEW.id, TRUE
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Refresh PostgREST's schema cache so writes accept the new value immediately.
NOTIFY pgrst, 'reload schema';
