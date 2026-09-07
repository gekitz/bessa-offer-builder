import { computeTotals } from './totals';
import { price, discountedPrice } from './pricing';
import { countedIds } from './optionGroups';

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Sum the labor (kind:'h') share of the counted cart — reusing the exact
// counting semantics (countedIds) + pricing helpers computeTotals uses, so
// the frozen labor € equals the labor share already folded into `once`.
// Returns { laborMinutes, laborAmount } (hours × 60 rounded; € rounded to 2).
function computeLabor(cart, catalog) {
  const counted = countedIds(cart);
  let hours = 0;
  let amount = 0;
  for (const [id, c] of Object.entries(cart)) {
    const item = catalog[id];
    if (!item || item.t !== 'h') continue;
    if (!counted.has(id)) continue;
    const p = price(item, c.tier, c.mode, c.priceOverride);
    const dp = discountedPrice(item, c.tier, c.mode, c.priceOverride);
    if (p === null) continue;
    const fullQty = c.qty ?? 0;
    const discQty = c.discountQty ?? 0;
    hours += fullQty + discQty;
    amount += p * fullQty + (dp ?? 0) * discQty;
  }
  return { laborMinutes: Math.round(hours * 60), laborAmount: round2(amount) };
}

// Compute the net accept-page totals from an offer's data + a catalog.
// Snapshotted onto the offer at save/send time — after which the accept page
// renders the frozen snapshot instead of recomputing against the (mutable)
// catalog.
//
// Delegates to computeTotals — the SAME function that renders the builder
// totals, the PDF and the persisted total_* columns — so the frozen quote
// can never diverge from what the builder showed (option groups count only
// their selected member, optional add-ons never count, copier items are
// excluded). Custom items aren't in the passed catalog, so they're merged
// in; a catalog entry wins over a stale custom copy of the same id.
//
// offerData: { cart, customItems } (offer.offer_data)
// catalog:   the product lookup (ALL)
// returns:   { monthly, once, yearly, periodTotal, maxMonths,
//              laborMinutes, laborAmount } — all NET. laborMinutes/laborAmount
//              freeze the quoted Arbeitszeit (kind:'h') for the fulfillment
//              ticket's labor-hours floor.
export function computeAcceptTotals(offerData, catalog) {
  const data = offerData || {};
  const merged = { ...(data.customItems || {}), ...catalog };
  const cart = data.cart || {};
  const { monthly, once, yearly, periodTotal, maxMonths } = computeTotals(cart, merged);
  const { laborMinutes, laborAmount } = computeLabor(cart, merged);
  return { monthly, once, yearly, periodTotal, maxMonths, laborMinutes, laborAmount };
}
