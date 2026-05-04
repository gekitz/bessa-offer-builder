-- Stripe billing fields on offers
ALTER TABLE offers
  ADD COLUMN service_start_date    DATE,
  ADD COLUMN plan_chosen           TEXT CHECK (plan_chosen IN ('standard','ratenzahlung','miete')),
  ADD COLUMN stripe_customer_id    TEXT,
  ADD COLUMN stripe_checkout_id    TEXT,
  ADD COLUMN stripe_invoice_ids    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN stripe_subscription_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN stripe_schedule_id    TEXT,
  ADD COLUMN payment_status        TEXT DEFAULT 'none'
    CHECK (payment_status IN ('none','setup_pending','active','past_due','unpaid','canceled')),
  ADD COLUMN accepted_at           TIMESTAMPTZ;

CREATE INDEX idx_offers_stripe_customer ON offers(stripe_customer_id);
CREATE INDEX idx_offers_payment_status ON offers(payment_status);

-- Payment event audit trail (separate from email_events)
CREATE TABLE offer_payment_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id     UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  stripe_object_id TEXT,
  occurred_at  TIMESTAMPTZ DEFAULT NOW(),
  payload      JSONB
);

CREATE INDEX idx_payment_events_offer ON offer_payment_events(offer_id);
CREATE INDEX idx_payment_events_type ON offer_payment_events(event_type);

ALTER TABLE offer_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on offer_payment_events" ON offer_payment_events
  FOR ALL USING (true) WITH CHECK (true);
