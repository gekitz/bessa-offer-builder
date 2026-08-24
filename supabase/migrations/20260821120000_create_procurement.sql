-- ════════════════════════════════════════════════════════════════════
-- Hardware-Beschaffung: Bestellanfragen aggregieren → Sammelbestellungen
--
-- Reps stellen "Ich brauche N × Produkt X"-Anfragen (order_requests). Ein
-- Einkäufer (admin) aggregiert offene Anfragen pro Lieferant, wählt bei
-- Doppelquellen (Sunmi/Epson → Jarltech ODER Pulsa) den Lieferanten +
-- Preis und löst eine Sammelbestellung (purchase_orders) aus.
--
-- Lifecycle je Anfrage: open → ordered → received (oder cancelled).
-- RLS ist bewusst permissiv (wie der Rest der App); die Einkaufs-Ansicht
-- wird im Frontend über die Admin-Rolle abgesichert.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- suppliers — Lieferanten (Orderman, RCH, Jarltech, Pulsa, Black Pepper)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,             -- 'orderman', 'jarltech', …
  name        TEXT NOT NULL,
  order_email TEXT,                             -- Bestell-E-Mail (Phase 2: Auto-Mail)
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_active ON suppliers(active) WHERE active;

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

INSERT INTO suppliers (code, name, sort) VALUES
  ('orderman',     'Orderman',     10),
  ('rch',          'RCH',          20),
  ('jarltech',     'Jarltech',     30),
  ('pulsa',        'Pulsa',        40),
  ('black_pepper', 'Black Pepper', 50);

-- ────────────────────────────────────────────────────────────────────
-- products ↔ supplier: bevorzugter Lieferant + Alternativen
--
-- supplier_id      = Standard-Bezugsquelle (z. B. Orderman → Orderman).
-- alt_supplier_ids = weitere mögliche Quellen. Sunmi/Epson kommen von
--                    Jarltech ODER Pulsa; der Einkäufer entscheidet pro
--                    Bestellung nach Preis/Verfügbarkeit.
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN supplier_id      UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN alt_supplier_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_products_supplier ON products(supplier_id) WHERE supplier_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
-- purchase_orders — eine Sammelbestellung an EINEN Lieferanten, bündelt
-- mehrere order_requests. price_quotes hält den Preisvergleich fest
-- (z. B. [{supplierId, unitPrice}]) — reine Historie fürs spätere
-- "wir haben beim Günstigeren bestellt".
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE purchase_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID NOT NULL REFERENCES suppliers(id),
  status       TEXT NOT NULL DEFAULT 'ordered'
               CHECK (status IN ('ordered', 'received', 'cancelled')),
  note         TEXT,
  price_quotes JSONB,                           -- optionaler Preisvergleich
  ordered_by   UUID REFERENCES employees(id),
  ordered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status   ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_ordered  ON purchase_orders(ordered_at DESC);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ────────────────────────────────────────────────────────────────────
-- order_requests — "Ich brauche N × Produkt X"
--
-- product_id ist optional + ON DELETE SET NULL: product_name/product_code
-- sind Snapshots, damit die Anfrage lesbar bleibt, auch wenn ein Produkt
-- später umbenannt/gelöscht wird (oder es sich um einen Freitext handelt).
-- supplier_id wird bei Erstellung aus dem bevorzugten Lieferanten des
-- Produkts vorbelegt; der Einkäufer kann ihn (Doppelquelle) umstellen.
-- unit_price wird beim Bestellen gesetzt. customer_*/offer_id sind
-- optionale Verknüpfungen ("dieses Sunmi ist für Deal X").
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE order_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name      TEXT NOT NULL,
  product_code      TEXT,
  supplier_id       UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  qty               INTEGER NOT NULL CHECK (qty > 0),
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'ordered', 'received', 'cancelled')),
  unit_price        NUMERIC(12, 2) CHECK (unit_price IS NULL OR unit_price >= 0),
  -- Optionale Verknüpfung zu einem Kunden/Angebot (denormalisiert)
  customer_id       TEXT,
  customer_name     TEXT,
  offer_id          UUID REFERENCES offers(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  requested_by      UUID REFERENCES employees(id),
  ordered_at        TIMESTAMPTZ,
  received_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_requests_status   ON order_requests(status);
CREATE INDEX idx_order_requests_supplier ON order_requests(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_order_requests_po       ON order_requests(purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX idx_order_requests_requester ON order_requests(requested_by) WHERE requested_by IS NOT NULL;
CREATE INDEX idx_order_requests_created  ON order_requests(created_at DESC);

CREATE TRIGGER trg_order_requests_updated_at
  BEFORE UPDATE ON order_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ────────────────────────────────────────────────────────────────────
-- RLS — permissiv (wie der Rest der App); Einkaufs-Ansicht wird im
-- Frontend über die Admin-Rolle abgesichert.
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_requests   ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_access ON suppliers       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON order_requests  FOR ALL USING (true) WITH CHECK (true);
