// Seed a fresh Lieferschein from an accepted offer's cart.
//
// Pure transform: offer_data (cart + customItems + cartOrder) + the hydrated
// product catalog → DeliveryNoteItemInput[]. The technician then curates the
// result (a Lieferschein shows what was ACTUALLY delivered, which routinely
// differs from what was quoted). See docs/ticket-lieferschein.md.
//
// Rule (fixed 2026-09-09): everything comes in EXCEPT Arbeitszeit — labor is
// tracked separately via the Reparaturschein + labor-floor. Everything else is
// editable and removable in the UI.

import type { Cart, CartItem } from '../../../lib/totals';
import type { Catalog, Item } from '../../../lib/pricing';
import { price } from '../../../lib/pricing';
import { orderedCartEntries } from '../../../lib/cartOrder';
import type { DeliveryNoteItemInput } from '../types';

// The single "Arbeitszeit" product (see catalogSeed.ts). Labor, never on a
// Lieferschein — it flows through the Reparaturschein instead.
export const ARBEITSZEIT_PRODUCT_ID = 'b01429e1-672e-44ae-ae79-1d08c4f7f918';

export interface OfferDataForSeed {
  cart?: Cart | null;
  // Freetext / user-added items, keyed by their (custom) id — same shape the
  // offer builder persists into offer_data.customItems.
  customItems?: Record<string, Item> | null;
  cartOrder?: readonly string[] | null;
}

// Net unit price for a delivered line. Copier devices don't price via the
// generic price() path — their delivered good is the device at its net VK.
function unitPriceFor(item: Item, c: CartItem): number {
  if (item.t === 'copier') return item.vk ?? 0;
  return price(item, c.tier, c.mode, c.priceOverride) ?? 0;
}

export function buildDeliveryItemsFromOffer(
  offerData: OfferDataForSeed | null | undefined,
  catalog: Catalog,
): DeliveryNoteItemInput[] {
  const cart = offerData?.cart;
  if (!cart) return [];
  const custom = offerData?.customItems ?? {};
  const lookup: Catalog = { ...catalog, ...custom };

  const out: DeliveryNoteItemInput[] = [];
  let sort = 0;
  for (const [id, c] of orderedCartEntries(cart, offerData?.cartOrder)) {
    if (id === ARBEITSZEIT_PRODUCT_ID) continue; // labor → Reparaturschein
    const item = lookup[id];
    if (!item) continue; // stale/unresolved id — skip rather than emit a blank line

    // Delivered units = full-price + discounted units (both are physically
    // handed over). unit_price is the full net price; the tech adjusts if needed.
    const qty = (c.qty ?? 0) + (c.discountQty ?? 0);
    if (qty <= 0) continue;

    const isFreetext = Object.prototype.hasOwnProperty.call(custom, id);
    out.push({
      productId: isFreetext ? null : id,
      // Snapshot the Mesonic BASE article number (KL/WO suffix is applied at
      // Beleg-build time from the ticket Standort). NOT item.code — that's the
      // internal catalog code, which Mesonic can't resolve. Unmapped → null →
      // the line falls back to freetext (Datentyp 3).
      mesonicArtikelNr: isFreetext ? null : item.mesonicArtikelNr ?? null,
      bezeichnung: item.name,
      quantity: qty,
      unitPrice: unitPriceFor(item, c),
      isFreetext,
      serialNumbers: [],
      sort: sort++,
    });
  }
  return out;
}
