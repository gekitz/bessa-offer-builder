# Product Catalog Management — Plan

Move the offer product catalog from hardcoded TypeScript
(`src/features/offers/data/catalogs.ts`, ~197 items) to a database-backed,
admin-manageable catalog — **without breaking existing offers** and without
changing pricing/PDF/cart behaviour.

## Why now
Everything is hardcoded: adding/repricing a product means a code change +
deploy. ~197 items across ~10 catalogs (BESSA, MELZER, RCH, HARDWARE, UNIFY,
DRUCKER, KUECHENMONITORE(_SUNMI), KIOSK, ORDERMAN, DIENSTLEISTUNGEN, SHARP…).
Sales can't self-serve; price changes are risky.

## Key asset: stable UUIDs
Every product already has a stable UUID, and **offers reference products by
UUID** (the `cart` is `{ [productId]: { qty, discountQty, tier, mode } }`).
So we can move products to a DB table **preserving the UUIDs** and every
historical offer still resolves. This is what makes the migration safe.

## Current item shape (to mirror)
Common: `id`, `code`, `name`, `cat` (category), `t` (kind: `'m'` monthly /
`'o'` once / `'h'` hourly / `'copier'`), `note`, `info`, `discount {type,value,label}`.
Pricing is **either** flat `price` **or** tiered `p:{ y, s, m, e }` (the four
global tiers) + `servicePercent` (yearly maintenance %). Copier/MFP items add
`vk, uhg, install, pageBw, pageColor, speed, console, includedOptions[], description`.

## Target data model
`products` table:
- Typed/queryable columns: `id (uuid, PRESERVED)`, `code`, `name`, `catalog`,
  `category`, `kind` (m/o/h/copier), `active` (bool), `sort` (int), `note`, `info`.
- `pricing jsonb` — holds flat `price` OR tier object `{y,s,m,e}` + `servicePercent` + `discount`.
- `attrs jsonb` — kind-specific fields (copier vk/uhg/install/page rates/etc.).
- `auto_add jsonb` (nullable) — data-driven side-effects (see below).
- RLS: `authenticated` full access; **no anon write**; anon SELECT of `active`
  products only if the accept page ever needs live catalog (it reads `offer_data`
  today, so likely not needed).

## Locked decisions
- **Price snapshotting: YES.** When an offer is **sent/accepted**, snapshot the
  resolved line-item prices into `offer_data` so reopening an old offer always
  shows what was quoted. Today prices are looked up **live** from `ALL`, so
  without this, editing a product's price would retroactively change old offers'
  displayed line items. (Accepted/signed offers already keep totals in
  `total_*` + the signed PDF, but line items re-render live — snapshotting fixes that.)
- **Encoded behaviour → data.** Rules currently hardcoded by UUID move into the
  product row. Known case: `WORK_INTENSIVE_ITEMS` in `OfferBuilderPage` auto-adds
  10 h Arbeitszeit for Lagerverwaltung + Anbindung Schankanlage — becomes
  `auto_add: { productId: <Arbeitszeit>, qty: 10 }` on those products.
- **Custom items** stay per-offer (already separate via `isCustomItem`), not catalog.
- **Same interface.** The app keeps consuming `ALL` + per-catalog arrays with the
  identical `Item` shape; only the *source* changes (DB vs module).

## Phased migration (each phase shippable, low-risk)
**Phase 1 — model + seed (non-breaking).** Create `products` table; generate a
seed migration from the current `catalogs.ts` inserting every item with its
existing UUID. App unchanged — data mirrors code. Reversible foundation.

**Phase 2 — read path.** `loadCatalog()` fetches products → builds the same
`ALL` + catalog groups (memoised per session; keep the bundled file as an offline
fallback). Swap the ~10 importers to the loaded catalog. Add price-snapshotting at
send/accept. The one careful step (many consumers) — shape is unchanged so it's mechanical.

**Phase 3 — admin "Produkte" screen.** Admin-gated CRUD (reuse `useAuth().isAdmin`):
list by catalog, edit name/prices/note/discount, activate/deactivate, add new.

## Risks / watch-outs
- Many consumers of `ALL`/catalogs (OfferBuilderPage, OfferView, AcceptPage,
  modals, LeihstellungCalculator, copier engine, PDF). Phase 2 must keep the shape byte-identical.
- Caching/offline: load once per session; bundled fallback so the builder works if DB is slow.
- Copier items (`t:'copier'`) have the richest attrs — model in `attrs jsonb`.
- Tests import catalogs directly; Phase 2 needs a test seam (inject a catalog).

## First step
Phase 1 only: `products` table + UUID-preserving seed from the current catalog.
Then review before the Phase 2 read-path swap.

See also: `src/features/offers/data/catalogs.ts` (source of truth today),
`docs/sharp-mfp-offers-plan.md` (copier item shape).
