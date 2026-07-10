import { price, discountedPrice, isMonthly, yearlyServicePerUnit } from './pricing';
import { TIER_MONTHS } from '../data/tiers';

// Compute the net accept-page totals from an offer's data + a catalog.
// Extracted from AcceptPage so the SAME math can be run once at send time
// and snapshotted onto the offer — after which the accept page renders the
// frozen snapshot instead of recomputing against the (mutable) catalog.
//
// offerData: { cart, customItems, raten } (offer.offer_data)
// catalog:   the product lookup (ALL)
// returns:   { monthly, once, yearly, periodTotal, maxMonths } — all NET.
export function computeAcceptTotals(offerData, catalog) {
  const data = offerData || {};
  const cart = data.cart || {};
  const customItems = data.customItems || {};

  let monthly = 0, once = 0, yearly = 0, periodTotal = 0, maxMonths = 0;
  Object.entries(cart).forEach(([id, c]) => {
    const item = catalog[id] || customItems[id];
    if (!item) return;
    const p = price(item, c.tier, c.mode, c.priceOverride);
    const dp = discountedPrice(item, c.tier, c.mode, c.priceOverride);
    if (p === null) return;
    const line = (p * (c.qty || 0)) + (dp * (c.discountQty || 0));
    if (isMonthly(item, c.mode)) {
      monthly += line;
      const months = TIER_MONTHS[c.tier] || 12;
      periodTotal += line * months;
      if (months > maxMonths) maxMonths = months;
    } else {
      once += line;
      periodTotal += line;
      const svc = yearlyServicePerUnit(item) * ((c.qty || 0) + (c.discountQty || 0));
      if (svc > 0) { yearly += svc; periodTotal += svc; }
    }
  });
  maxMonths = maxMonths || 12;

  return { monthly, once, yearly, periodTotal, maxMonths };
}
