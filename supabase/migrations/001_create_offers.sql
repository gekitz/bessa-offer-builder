-- Create offers table
CREATE TABLE offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','delivered','opened','accepted','rejected','expired','bounced')),
  customer_name   TEXT,
  customer_company TEXT,
  customer_email  TEXT,
  customer_phone  TEXT,
  creator_id      TEXT NOT NULL,
  creator_name    TEXT NOT NULL,
  offer_data      JSONB NOT NULL,
  total_monthly   NUMERIC(10,2) DEFAULT 0,
  total_once      NUMERIC(10,2) DEFAULT 0,
  total_period    NUMERIC(10,2) DEFAULT 0,
  pdf_path        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ
);

-- Create email events table
CREATE TABLE email_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('sent','delivered','opened','clicked','bounced')),
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  metadata    JSONB
);

-- Indexes
CREATE INDEX idx_offers_status ON offers(status);
CREATE INDEX idx_offers_creator ON offers(creator_id);
CREATE INDEX idx_offers_updated ON offers(updated_at DESC);
CREATE INDEX idx_email_events_offer ON email_events(offer_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);

-- Enable Row Level Security
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon users (team app, no per-user auth)
CREATE POLICY "Allow all operations on offers" ON offers
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on email_events" ON email_events
  FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for offer PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('offer-pdfs', 'offer-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to offer PDFs
CREATE POLICY "Public read access to offer PDFs" ON storage.objects
  FOR SELECT USING (bucket_id = 'offer-pdfs');

CREATE POLICY "Allow upload to offer PDFs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'offer-pdfs');

CREATE POLICY "Allow update of offer PDFs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'offer-pdfs');
