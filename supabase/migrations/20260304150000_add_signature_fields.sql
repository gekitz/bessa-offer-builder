ALTER TABLE offers
  ADD COLUMN signature_data JSONB,
  ADD COLUMN signed_at TIMESTAMPTZ,
  ADD COLUMN signed_pdf_path TEXT;
