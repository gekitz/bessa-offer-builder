-- Offer type discriminator — distinguishes the product family an
-- offer belongs to so the list can be filtered by it and the builder
-- + PDF can branch on it.
--
--   'pos'     — point-of-sale offers (everything built so far)
--   'sharp'   — Sharp MFP copier offers (leasing / managed print)
--   'brother' — Brother MFP offers (planned; mirrors Sharp)
--
-- Stored as a top-level column (not inside offer_data) so the offer
-- list query can filter/group without pulling the full cart JSON.
-- Existing rows backfill to 'pos' via the default — every offer in
-- the system today is a PoS offer.

ALTER TABLE offers
  ADD COLUMN offer_type TEXT NOT NULL DEFAULT 'pos'
  CHECK (offer_type IN ('pos', 'sharp', 'brother'));

CREATE INDEX IF NOT EXISTS idx_offers_offer_type ON offers(offer_type);

-- Refresh PostgREST's schema cache so the REST API serves the new
-- column immediately instead of failing writes for ~10 minutes.
NOTIFY pgrst, 'reload schema';
