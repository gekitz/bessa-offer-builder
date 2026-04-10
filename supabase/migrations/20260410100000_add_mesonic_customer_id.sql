-- Add Mesonic customer reference to offers
-- This stores the Mesonic Kontonummer (customer number) so we can link
-- offers back to Mesonic customers for CRM lookups and Beleg creation.

ALTER TABLE offers ADD COLUMN mesonic_customer_id TEXT;

-- Index for looking up all offers for a given Mesonic customer
CREATE INDEX idx_offers_mesonic_customer ON offers(mesonic_customer_id)
  WHERE mesonic_customer_id IS NOT NULL;

-- Also add customer address since we now collect it via CustomerPicker
ALTER TABLE offers ADD COLUMN customer_address TEXT;
