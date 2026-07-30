-- ════════════════════════════════════════════════════════════════════
-- Keep the CRM stage and the acceptance signals in sync, both ways.
--
-- Background: an offer carries two independent notions of "done":
--   • stage   (CRM pipeline)  — new / offer_sent / closed / lost
--   • status  + accepted_at / signed_at (acceptance) — what the
--     ticket-creation (20260710160000) and notification (20260714130000)
--     triggers watch.
--
-- Until now these drifted apart:
--   • acceptOfferWithSignature() set status='accepted' but left stage in
--     'offer_sent', so accepted deals never showed as "Abgeschlossen".
--   • The "Abschließen" button in the offer list set stage='closed' only
--     (offerApi.updateOfferStage), touching none of the acceptance signals
--     — so closing a won deal fired NO ticket and NO creator notification.
--
-- The second gap is why an OFFLINE-signed order (rep marks it closed by
-- hand) produced no fulfillment ticket. Fixing it in the app's one code
-- path would miss the reverse direction and any future writer, so we do it
-- in a single BEFORE UPDATE trigger — the one place that sees every write.
--
-- Direction 1  stage → accepted:
--   stage newly becomes 'closed'  ⇒  status='accepted',
--                                     accepted_at = COALESCE(accepted_at, now())
-- Direction 2  accepted → stage:
--   an acceptance signal newly appears (signed_at / accepted_at / status)
--   and the deal isn't 'lost'      ⇒  stage='closed'
--
-- Because this is BEFORE UPDATE, the existing AFTER UPDATE triggers
-- (create_ticket_for_accepted_offer, notify_offer_accepted) see the
-- reconciled row and fire on exactly the same acceptance signals they
-- already key on — no change needed there, and their idempotency guard
-- (one ticket per offer) still prevents duplicates.
--
-- Reactivating a closed deal (stage → new/offer_sent via "Reaktivieren")
-- intentionally leaves accepted_at/status untouched: the fulfillment
-- ticket already exists, and re-closing later won't create a second one.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_offer_stage_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  -- Direction 1: closing the deal IS accepting it.
  IF NEW.stage = 'closed' AND OLD.stage IS DISTINCT FROM 'closed' THEN
    NEW.accepted_at := COALESCE(NEW.accepted_at, now());
    NEW.status      := 'accepted';
  END IF;

  -- Direction 2: accepting the deal closes the CRM stage (unless the
  -- deal was explicitly marked lost, which wins).
  IF NEW.stage IS DISTINCT FROM 'lost' AND (
       (NEW.signed_at   IS NOT NULL AND OLD.signed_at   IS NULL)
    OR (NEW.accepted_at IS NOT NULL AND OLD.accepted_at IS NULL)
    OR (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  ) THEN
    NEW.stage := 'closed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 'aa_' prefix so this BEFORE trigger sorts ahead of any other and the
-- row is fully reconciled before the AFTER triggers read it.
CREATE TRIGGER trg_aa_sync_offer_stage_acceptance
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION sync_offer_stage_acceptance();
