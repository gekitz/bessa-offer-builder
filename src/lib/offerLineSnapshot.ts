// Build the frozen per-line snapshot (offer_data.lineSnapshot) for the
// Mesonic-Angebot export (Belegart 17) from a cart + a priced item map.
//
// Single source of truth shared by two callers:
//   • OfferBuilderPage — freezes the snapshot at save (item map = hydrated ALL,
//     with the offer's custom items merged in at runtime).
//   • runOfferAngebotExport — rebuilds it on the fly for accepted offers that
//     never got a snapshot (created before the feature). Accepted offers can no
//     longer be re-saved in the builder, so the client retry runner reprices the
//     cart against the live catalog (+ the offer's customItems) instead.
//
// Only counted lines are kept: optional add-ons and non-selected option-group
// alternatives are dropped so the Beleg sum matches the offer.

import { buildLineItems } from './offerLineItems';
import { orderedCartEntries } from './cartOrder';
import type { OfferLineSnapshot } from './offerAngebot';

// Derive the parameter types from the functions we call so this file needs no
// direct Cart/Catalog type imports (and can't drift from their real shapes).
type Cart = Parameters<typeof orderedCartEntries>[0];
type Catalog = Parameters<typeof buildLineItems>[1];

export function buildLineSnapshotFrom(
  cart: Cart,
  cartOrder: readonly string[] | null | undefined,
  catalog: Catalog,
): OfferLineSnapshot[] {
  const entries = orderedCartEntries(cart, cartOrder).filter(([id]) => catalog[id]);
  const { monthlyItems, onceItems } = buildLineItems(entries, catalog);
  return [...monthlyItems, ...onceItems]
    .filter((r) => !r.optional && r.optionSelected !== false)
    .map((r) => ({
      name: r.name,
      code: r.code || '',
      qty: r.qty,
      discountQty: r.discountQty,
      unitPrice: r.unitPrice ?? 0,
      discountPrice: r.discountPrice ?? 0,
      monthly: r.monthly,
      tier: r.tier,
    }));
}
