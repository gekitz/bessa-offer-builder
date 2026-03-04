ALTER TABLE offers ADD COLUMN share_code TEXT UNIQUE;
CREATE INDEX idx_offers_share_code ON offers(share_code);
