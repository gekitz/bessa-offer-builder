-- ════════════════════════════════════════════════════════════════════
-- Accepted offer → WinLine-Angebot (Belegart 17).
--
-- When a customer accepts an offer, push it into Mesonic as an Angebot
-- Beleg so the accounting team — who work solely in WinLine — find it
-- there. Same acceptance signal the ticket-creation (20260710160000) and
-- notify (20260714130000) triggers use, and the same async pg_net → Edge
-- Function pattern: a single AFTER UPDATE trigger POSTs to the
-- export-offer-angebot function, which builds the freetext positions from
-- the offer's frozen lineSnapshot and imports them via the mesonic-proxy.
--
-- Auth & endpoint reuse the SAME Vault secrets as notify-offer-accepted:
--   • digest_project_url  → https://<project-ref>.supabase.co
--   • digest_cron_secret  → matches the CRON_SECRET function secret
--
-- pg_net is fire-and-forget: a slow or failing export never blocks or rolls
-- back the customer's acceptance. Idempotency is enforced downstream via
-- mesonic_beleg_key (<konto>-<laufnummer>); the trigger additionally skips
-- rows already exported so re-acceptance updates don't re-fire needlessly.
-- ════════════════════════════════════════════════════════════════════

-- ── Beleg-Tracking je Angebot ────────────────────────────────────────
-- mesonic_beleg_key (<konto>-<laufnummer>) = Idempotenz-Anker (analog
-- Reparaturschein/Lieferschein). mesonic_beleg_status dokumentiert auch die
-- Nicht-Export-Fälle, damit die UI "kein Mesonic-Kunde verknüpft" anzeigen
-- und ein späterer manueller Export sie nachholen kann.
--   status: 'exported' | 'skipped_no_customer' | 'failed'
ALTER TABLE offers ADD COLUMN IF NOT EXISTS mesonic_beleg_laufnummer INTEGER;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS mesonic_beleg_key        TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS mesonic_beleg_number     TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS mesonic_beleg_status     TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS mesonic_beleg_error      TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS mesonic_beleg_created_at TIMESTAMPTZ;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION export_offer_angebot()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  -- Only when an acceptance signal *newly* appears (mirrors the
  -- ticket-creation + notify triggers so all three fire on the same events),
  -- and only if this offer hasn't been exported yet.
  IF NEW.mesonic_beleg_key IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (
       (NEW.signed_at   IS NOT NULL AND OLD.signed_at   IS NULL)
    OR (NEW.accepted_at IS NOT NULL AND OLD.accepted_at IS NULL)
    OR (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'digest_project_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'digest_cron_secret';

  -- Secrets not configured (e.g. local/dev) → skip silently rather than
  -- erroring inside the customer's acceptance transaction.
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/export-offer-angebot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('offerId', NEW.id),
    timeout_milliseconds := 20000
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offer_accepted_export_angebot
  AFTER UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION export_offer_angebot();
