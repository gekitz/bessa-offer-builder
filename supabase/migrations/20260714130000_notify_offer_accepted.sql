-- ════════════════════════════════════════════════════════════════════
-- Notify the offer creator when a customer accepts an offer.
--
-- Same acceptance signal the ticket-creation trigger uses
-- (20260710160000): signed_at newly set (signature path) OR accepted_at /
-- status='accepted' newly set (payment path). A single AFTER UPDATE
-- trigger fires an async pg_net POST to the notify-offer-accepted Edge
-- Function, which sends the creator an email + web push.
--
-- Auth & endpoint reuse the SAME Vault secrets the daily follow-up digest
-- already relies on (20260506080000):
--   • digest_project_url  → https://<project-ref>.supabase.co
--   • digest_cron_secret  → matches the CRON_SECRET function secret
-- so no new Vault setup is required.
--
-- pg_net is fire-and-forget: the HTTP call is queued and the trigger
-- returns immediately, so a slow or failing notification never blocks or
-- rolls back the customer's acceptance.
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_offer_accepted()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  -- Only when an acceptance signal *newly* appears (mirrors the
  -- ticket-creation trigger so both fire on exactly the same events).
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

  -- If the secrets aren't configured (e.g. local/dev), skip silently
  -- rather than erroring inside the customer's acceptance transaction.
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-offer-accepted',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('offerId', NEW.id),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offer_accepted_notify
  AFTER UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION notify_offer_accepted();
