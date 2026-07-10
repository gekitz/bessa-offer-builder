-- Per-offer payment gating + customer signature acceptance.
--
-- payment_enabled: when TRUE the customer's accept page offers Stripe
-- payment plans; when FALSE (default) it offers a signature acceptance
-- (no payment). Stripe is opt-in per offer.
-- signed_by_name: the name the customer typed when accepting by signature.
ALTER TABLE offers ADD COLUMN payment_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE offers ADD COLUMN signed_by_name TEXT;
