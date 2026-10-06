-- Customer-facing heading for a campaign, shown on the public landing page
-- (?c=<token>). Kept separate from `title`, which stays the internal
-- back-office label (campaign picker, funnel). Null → the landing falls back
-- to `title`, so existing campaigns keep working unchanged.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS public_title text;
