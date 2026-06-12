// Builds the per-line objects consumed by both the PDF (OfferPdfDocument) and
// the on-screen builder (OfferView), so the two render identical numbers. The
// option-group decoration lives here: each grouped row learns whether it's the
// selected (counted) member and, if not, its price delta vs the selected one
// ("+300,00" / "-200,00") — the "Default + Mehrpreis" model.

import {
  price,
  discountedPrice,
  isMonthly,
  hasDiscount,
  type Catalog,
  type ItemKind,
  type ItemMode,
} from './pricing';
import type { TierKey } from '../data/tiers';
import type { Cart, CartItem } from './totals';
import { selectedByGroup, orderWithGroups } from './optionGroups';

export interface OfferLineItem {
  id: string;
  qty: number;
  discountQty: number;
  code: string;
  name: string;
  info?: string;
  description?: string;
  tier?: TierKey;
  mode?: ItemMode;
  type: ItemKind;
  unitPrice: number | null;
  discountPrice: number | null;
  hasDiscount: boolean;
  discountLabel?: string;
  lineTotal: number;
  monthly: boolean;
  /** Option-group label, if this line is one of several alternatives. */
  optionGroup?: string;
  /** True for the recommended member counted in the total; false for an
   *  alternative; undefined for an ungrouped line. */
  optionSelected?: boolean;
  /** Price difference vs the selected member of the same group (alternatives
   *  only; 0 for the selected member, undefined when ungrouped). */
  optionDelta?: number;
}

export type CartEntry = [string, CartItem];

/**
 * Map ordered cart entries to decorated line items (in the given order). Both
 * sections (monthly + once) are returned in one flat array tagged with
 * `monthly`. Group deltas are computed across the whole offer so they're
 * consistent regardless of section.
 */
export function decorateLineItems(entries: CartEntry[], catalog: Catalog): OfferLineItem[] {
  const rows: OfferLineItem[] = entries
    .filter(([id]) => catalog[id])
    .map(([id, c]) => {
      const item = catalog[id];
      const p = price(item, c.tier, c.mode);
      const dp = discountedPrice(item, c.tier, c.mode);
      const fullQty = c.qty || 0;
      const discQty = c.discountQty || 0;
      const lineTotal = (p ?? 0) * fullQty + (dp ?? 0) * discQty;
      return {
        id,
        qty: fullQty,
        discountQty: discQty,
        code: item.code || '',
        name: item.name,
        info: item.info,
        description: item.description,
        tier: c.tier,
        mode: c.mode,
        type: item.t,
        unitPrice: p,
        discountPrice: dp,
        hasDiscount: hasDiscount(item),
        discountLabel: item.discount?.label,
        lineTotal,
        monthly: isMonthly(item, c.mode),
        optionGroup: c.optionGroup,
      };
    });

  // Resolve which member counts per group, then stamp selected flag + delta.
  const cart: Cart = Object.fromEntries(entries);
  const selected = selectedByGroup(cart);
  const lineById: Record<string, number> = {};
  for (const r of rows) lineById[r.id] = r.lineTotal;

  for (const r of rows) {
    if (!r.optionGroup) continue;
    const selId = selected[r.optionGroup];
    const isSel = selId === r.id;
    r.optionSelected = isSel;
    r.optionDelta = isSel ? 0 : r.lineTotal - (lineById[selId] ?? 0);
  }

  return rows;
}

/**
 * PDF-facing split: monthly and once arrays, each reordered so an option
 * group's members sit together with the selected one first.
 */
export function buildLineItems(
  entries: CartEntry[],
  catalog: Catalog,
): { monthlyItems: OfferLineItem[]; onceItems: OfferLineItem[] } {
  const rows = decorateLineItems(entries, catalog);
  return {
    monthlyItems: orderWithGroups(rows.filter((r) => r.monthly)),
    onceItems: orderWithGroups(rows.filter((r) => !r.monthly)),
  };
}
