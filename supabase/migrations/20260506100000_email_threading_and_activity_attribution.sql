-- Wider follow-up feature: send templated emails through the tool,
-- threaded into the original offer conversation, with open events
-- attributed to the specific follow-up activity.
--
-- offers.email_subject  — the actual subject line sent for the
--   original offer. Stored so follow-ups can prefix "Re:" without
--   guessing (the user can customize the subject in EmailPreviewModal,
--   so reconstructing from defaults would break threading).
--
-- email_events.activity_id — when present, the event belongs to a
--   specific follow-up activity (resend-webhook forwards this from
--   the matching 'sent' event). NULL means the event belongs to the
--   original offer send.

ALTER TABLE offers ADD COLUMN email_subject TEXT;

ALTER TABLE email_events
  ADD COLUMN activity_id UUID NULL REFERENCES offer_activities(id) ON DELETE SET NULL;

-- Hot-trail query (offers with > 2 opens in last 7 days) reads
-- email_events filtered by event_type and occurred_at, grouped by
-- offer_id. This index covers that path.
CREATE INDEX idx_email_events_offer_opens
  ON email_events(offer_id, event_type, occurred_at);
