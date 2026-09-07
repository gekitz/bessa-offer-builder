-- Idempotency anchor for the auto-posted WinLine CRM Aktion (offer link).
-- Stores the created Aktion key (e.g. 'CRM0-33490'); its presence means the
-- note has already been posted for this offer, so we never post twice.
ALTER TABLE offers ADD COLUMN mesonic_crm_key TEXT;

CREATE INDEX idx_offers_mesonic_crm_key
  ON offers(mesonic_crm_key)
  WHERE mesonic_crm_key IS NOT NULL;
