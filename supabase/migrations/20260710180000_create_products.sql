-- ════════════════════════════════════════════════════════════════════
-- Product catalog — Phase 1: the table.
-- Mirrors the hardcoded Item shape (src/features/offers/data/catalogs.ts)
-- so products can move to the DB without changing pricing/PDF/cart logic.
-- The app still reads the hardcoded file in Phase 1; this table is a
-- non-breaking mirror seeded with the EXISTING UUIDs so offers resolve.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE products (
  -- TEXT, not UUID: product ids are a mix of UUIDs (BESSA…) and slugs
  -- (SHARP 'sharp-bp51c26'). The cart keys on these strings verbatim.
  id          TEXT PRIMARY KEY,                 -- preserved from catalogs.ts
  code        TEXT,
  name        TEXT NOT NULL,
  catalog     TEXT NOT NULL,                    -- BESSA, HARDWARE, SHARP, …
  category    TEXT,                             -- the item's `cat`
  kind        TEXT NOT NULL,                    -- Item.t: 'm' | 'o' | 'h' | 'copier'
  note        TEXT,
  info        TEXT,
  -- Flat `price` OR tiered `tiers:{y,s,m,e}`, plus servicePercent + discount.
  pricing     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Kind-specific fields (copier vk/uhg/install/page rates, etc.).
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Data-driven side effects, e.g. auto-add Arbeitszeit: {productId, qty}.
  auto_add    JSONB,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_catalog ON products(catalog);
CREATE INDEX idx_products_active  ON products(active) WHERE active;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- Internal only: managed by staff, never read by the anon accept page
-- (which renders from offer_data). Harden later if needed.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_access ON products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
