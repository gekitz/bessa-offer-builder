import { TIER_MONTHS, type TierKey } from '../data/tiers';
import {
  price,
  discountedPrice,
  isMonthly,
  yearlyServicePerUnit,
  type Catalog,
  type ItemMode,
} from './pricing';
import { countedIds, type OptionCartItem } from './optionGroups';

export interface CartItem extends OptionCartItem {
  qty?: number;
  discountQty?: number;
  tier?: TierKey;
  mode?: ItemMode;
}

export type Cart = Record<string, CartItem>;

export interface OfferTotals {
  monthly: number;
  once: number;
  yearly: number;
  periodTotal: number;
  periodMonthly: number;
  maxMonths: number;
}

// Pure totals calculation. Items not present in `catalog` are skipped silently
// (matches the original App.jsx behavior where ALL[id] could be undefined for
// custom items added by the user).
export function computeTotals(cart: Cart, catalog: Catalog): OfferTotals {
  let monthly = 0;
  let once = 0;
  let yearly = 0;
  let periodTotal = 0;
  let periodMonthly = 0;
  let maxMonths = 0;

  // For option groups ("pick one of A/B"), only the selected member's price
  // counts — the alternatives are shown but not summed.
  const counted = countedIds(cart);

  for (const [id, c] of Object.entries(cart)) {
    const item = catalog[id];
    if (!item) continue;
    if (!counted.has(id)) continue;
    const p = price(item, c.tier, c.mode);
    const dp = discountedPrice(item, c.tier, c.mode);
    if (p === null) continue;
    const fullQty = c.qty ?? 0;
    const discQty = c.discountQty ?? 0;
    const line = p * fullQty + (dp ?? 0) * discQty;

    if (isMonthly(item, c.mode)) {
      monthly += line;
      const months = (c.tier && TIER_MONTHS[c.tier]) || 12;
      periodMonthly += line * months;
      periodTotal += line * months;
      if (months > maxMonths) maxMonths = months;
    } else {
      once += line;
      periodTotal += line;
      const svc = yearlyServicePerUnit(item) * (fullQty + discQty);
      if (svc > 0) {
        yearly += svc;
        periodTotal += svc;
      }
    }
  }

  return { monthly, once, yearly, periodTotal, periodMonthly, maxMonths: maxMonths || 12 };
}
