import { computeTotals } from './totals';

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
// returns:   { monthly, once, yearly, periodTotal, maxMonths } — all NET.
export function computeAcceptTotals(offerData, catalog) {
  const data = offerData || {};
  const merged = { ...(data.customItems || {}), ...catalog };
  const { monthly, once, yearly, periodTotal, maxMonths } = computeTotals(data.cart || {}, merged);
  return { monthly, once, yearly, periodTotal, maxMonths };
}
