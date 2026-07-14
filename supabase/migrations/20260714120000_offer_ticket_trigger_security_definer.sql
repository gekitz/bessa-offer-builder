-- ════════════════════════════════════════════════════════════════════
-- Fix: public signature acceptance failed with
--   "new row violates row-level security policy for table tickets"
--
-- The offer-accepted → create-ticket trigger (20260710160000) runs as the
-- role that UPDATEs the offer. On the public acceptance page the customer
-- is the `anon` role, which — since 20260513090000 replaced the permissive
-- tickets policy with `authenticated_access` — has no INSERT policy on
-- tickets. So signing the offer fired the trigger and the ticket INSERT
-- was rejected by RLS.
--
-- Make the trigger function SECURITY DEFINER (same pattern as
-- handle_new_user) so the ticket is inserted as the function owner,
-- bypassing the anon RLS restriction. Body is unchanged.
-- ════════════════════════════════════════════════════════════════════

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

  -- Route by offer type: pos → Kassen (1), sharp/brother (printers) → MFP (5).
  v_pool := CASE NEW.offer_type
    WHEN 'pos'     THEN 1
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
