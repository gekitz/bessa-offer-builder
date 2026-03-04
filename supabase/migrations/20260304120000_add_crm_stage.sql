ALTER TABLE offers
  ADD COLUMN stage TEXT NOT NULL DEFAULT 'new'
  CHECK (stage IN ('new', 'offer_sent', 'closed', 'lost'));

-- Back-fill existing offers that were already sent
UPDATE offers SET stage = 'offer_sent'
  WHERE status IN ('sent', 'delivered', 'opened', 'bounced');

CREATE INDEX idx_offers_stage ON offers(stage);
