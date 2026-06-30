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
  /** Per-line net unit price override set via the edit dialog. For copier
   *  devices (t='copier') this overrides the device's net VK. */
  priceOverride?: number;

  // --- Copier / MFP cart fields (t === 'copier'), read by copierOffer.ts.
  /** Whole-offer sale mode; read off the (first) copier device entry. */
  saleMode?: 'kauf' | 'leasing';
  /** Trade-in unit credited against this device (Eintauschgerät). */
  tradeIn?: { name: string; value: number };
  /** Manual override of the computed Grenke leasing rate (per-deal re-quote). */
  leasingRateOverride?: number;
  /** Down payment that reduces the financed base (Mietsonderzahlung). */
  mietsonderzahlung?: number;
  /** Lease term in months (default 60); selects the known leasing factor. */
  leasingTermMonths?: number;
  /** Override the leasing factor (decimal, e.g. 0.0198) for non-standard terms. */
  leasingFactorOverride?: number;
  /** Override the residual-value percent (default 5) — drives the printed Restwert. */
  restwertPercentOverride?: number;
  /** Override the one-time Bearbeitungsgebühr (default €75, printed term). */
  bearbeitungsgebuehrOverride?: number;
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
    // Copier/MFP devices are priced by copierOffer.ts (leasing, UHG,
    // per-page maintenance) — never folded into the PoS buckets here.
    if (item.t === 'copier') continue;
    if (!counted.has(id)) continue;
    const p = price(item, c.tier, c.mode, c.priceOverride);
    const dp = discountedPrice(item, c.tier, c.mode, c.priceOverride);
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
