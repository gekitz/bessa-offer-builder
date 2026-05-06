-- Internal briefing field — what the customer actually asked for.
-- Stored as a top-level column (not inside offer_data) so the offer
-- list and follow-up views can show a preview without paying the
-- cost of pulling the full cart JSON.
--
-- Strictly internal: never rendered in the customer-facing PDF and
-- never sent to the customer (the existing offer_data.notes field
-- handles customer-visible footer notes; briefing is for reps).

ALTER TABLE offers ADD COLUMN briefing TEXT;
