-- Per-offer activity log for follow-up tracking. Each row is one
-- contact attempt or note ("called, no answer", "postponed to next
-- week", etc.). The latest row's next_followup_at is mirrored onto
-- offers.next_followup_at so we can sort/filter the offer list
-- without joining.

CREATE TABLE offer_activities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id         UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('call','email','meeting','note')),
  outcome          TEXT,
  note             TEXT,
  next_followup_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id    TEXT,
  created_by_name  TEXT
);

CREATE INDEX idx_offer_activities_offer ON offer_activities(offer_id, created_at DESC);
CREATE INDEX idx_offer_activities_followup ON offer_activities(next_followup_at)
  WHERE next_followup_at IS NOT NULL;

ALTER TABLE offers
  ADD COLUMN last_activity_at TIMESTAMPTZ,
  ADD COLUMN next_followup_at TIMESTAMPTZ;

CREATE INDEX idx_offers_followup ON offers(next_followup_at)
  WHERE next_followup_at IS NOT NULL;

-- Latest activity wins: offers.next_followup_at always reflects the
-- next_followup_at of the most-recently-created activity for that
-- offer (which may be NULL — i.e. "I've already talked, nothing
-- pending"). Logging a new activity without a follow-up date
-- naturally clears any prior reminder.
CREATE OR REPLACE FUNCTION refresh_offer_activity_denorm() RETURNS TRIGGER AS $$
DECLARE
  target_offer UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_offer := OLD.offer_id;
  ELSE
    target_offer := NEW.offer_id;
  END IF;

  UPDATE offers SET
    last_activity_at = (
      SELECT MAX(created_at) FROM offer_activities WHERE offer_id = target_offer
    ),
    next_followup_at = (
      SELECT next_followup_at FROM offer_activities
      WHERE offer_id = target_offer
      ORDER BY created_at DESC
      LIMIT 1
    )
  WHERE id = target_offer;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offer_activities_denorm
  AFTER INSERT OR UPDATE OR DELETE ON offer_activities
  FOR EACH ROW EXECUTE FUNCTION refresh_offer_activity_denorm();

ALTER TABLE offer_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on offer_activities" ON offer_activities
  FOR ALL USING (true) WITH CHECK (true);
