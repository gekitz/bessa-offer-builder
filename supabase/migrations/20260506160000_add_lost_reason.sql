-- Capture WHY deals are lost so we can spot patterns ("we lose 40%
-- to price", "feature gap is up this quarter") instead of marking
-- Verloren into a black hole. Required at the UI level via a small
-- chip-based modal; "Sonstiges" is the explicit-unknown escape hatch
-- so the data stays honest rather than being skipped.
--
-- lost_at is its own timestamp because updated_at gets bumped by any
-- edit (notes, briefing, etc.) and isn't a reliable "when was this
-- closed as lost" anchor for time-series analytics.

ALTER TABLE offers
  ADD COLUMN lost_reason TEXT
    CHECK (
      lost_reason IS NULL OR lost_reason IN (
        'price',
        'competitor',
        'timing',
        'feature_gap',
        'no_response',
        'internal_decision',
        'other'
      )
    ),
  ADD COLUMN lost_reason_note TEXT,
  ADD COLUMN lost_at TIMESTAMPTZ;

-- Partial index: most offers will never be lost, so we only index
-- the rows that have a value. Keeps the index small and useful for
-- "lost offers by reason / by date" analytical queries.
CREATE INDEX idx_offers_lost_at ON offers(lost_at) WHERE lost_at IS NOT NULL;

-- Force PostgREST to refresh its schema cache so the new columns
-- are visible to the REST API immediately on deploy. Without this,
-- the first POSTs after migration can fail with "column does not
-- exist" until the cache TTL expires (~10 min).
NOTIFY pgrst, 'reload schema';
