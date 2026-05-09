-- Web Push subscription registry. One row per (employee, browser-
-- profile, device). The Push API guarantees a unique `endpoint` URL
-- per subscription, so that's the natural unique key.
--
-- Used by the future send-push edge function (and folded into
-- notify-shift-swap) to fan out push notifications to every device
-- a recipient has registered.
--
-- pushsubscriptionchange (browser-rotated endpoints) and 410 Gone
-- responses from the push service are cleaned up by the sender:
-- delete the row by endpoint and let the client re-subscribe.

CREATE TABLE push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- The push service URL. Globally unique per subscription.
  endpoint      TEXT NOT NULL UNIQUE,
  -- ECDH public key used by web-push to encrypt payloads.
  p256dh        TEXT NOT NULL,
  -- Authentication secret paired with the public key.
  auth_token    TEXT NOT NULL,
  -- Optional UA string at subscription time. Used to surface
  -- "This phone" / "Office desktop" labels in a future settings UI
  -- and as a hint when debugging delivery failures.
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Bumped by the sender on every successful delivery. Lets a
  -- cleanup cron prune dead subscriptions older than e.g. 90 days.
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_employee   ON push_subscriptions(employee_id);
CREATE INDEX idx_push_subscriptions_last_seen  ON push_subscriptions(last_seen_at);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Permissive policy mirroring the rest of the workforce schema —
-- tighten when RLS-aware UI lands.
CREATE POLICY workforce_all ON push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);
