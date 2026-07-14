import { describe, it, expect } from 'vitest';
import { decorateLineItems, buildLineItems } from '../offerLineItems';
import { computeTotals } from '../totals';
import type { Catalog } from '../pricing';

// Minimal catalog: software (ungrouped) + two alternative PCs.
const CATALOG: Catalog = {
  sw: { id: 'sw', name: 'Kassensoftware', t: 'o', price: 450 },
  pcA: { id: 'pcA', name: 'PC Option A', t: 'o', price: 999 },
  pcB: { id: 'pcB', name: 'PC Option B', t: 'o', price: 1299 },
};

const cart = {
  sw: { qty: 1, discountQty: 0 },
  pcB: { qty: 1, discountQty: 0, optionGroup: 'pc', optionSelected: false },
  pcA: { qty: 1, discountQty: 0, optionGroup: 'pc', optionSelected: true },
};
// cartOrder puts the alternative first to prove ordering is by selection, not input.
const entries: [string, (typeof cart)[keyof typeof cart]][] = [
  ['pcB', cart.pcB],
  ['sw', cart.sw],
  ['pcA', cart.pcA],
];

describe('decorateLineItems', () => {
  it('flags the selected member and computes a +/- delta for the alternative', () => {
    const rows = decorateLineItems(entries, CATALOG);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId.sw.optionGroup).toBeUndefined();
    expect(byId.sw.optionDelta).toBeUndefined();

    expect(byId.pcA.optionSelected).toBe(true);
    expect(byId.pcA.optionDelta).toBe(0);

    expect(byId.pcB.optionSelected).toBe(false);
    expect(byId.pcB.optionDelta).toBe(300); // 1299 - 999
  });

  it('carries the optional flag through and keeps it out of the total', () => {
    const optCart = {
      sw: { qty: 1, discountQty: 0 },
      pcA: { qty: 1, discountQty: 0, optional: true },
    };
    const rows = decorateLineItems(Object.entries(optCart), CATALOG);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.pcA.optional).toBe(true);
    expect(byId.sw.optional).toBeUndefined();
    // The optional line is still built (listed) with its own lineTotal…
    expect(byId.pcA.lineTotal).toBe(999);
    // …but computeTotals ignores it.
    expect(computeTotals(optCart, CATALOG).once).toBe(450);
  });

  it('computes a negative delta when the alternative is cheaper than the recommended one', () => {
    const cheaperFirst = {
      pcA: { qty: 1, discountQty: 0, optionGroup: 'pc', optionSelected: false },
      pcB: { qty: 1, discountQty: 0, optionGroup: 'pc', optionSelected: true },
    };
    const rows = decorateLineItems(Object.entries(cheaperFirst), CATALOG);
    const a = rows.find((r) => r.id === 'pcA')!;
    expect(a.optionDelta).toBe(-300); // 999 - 1299
  });
});

describe('buildLineItems', () => {
  it('orders an option group as selected-first within its section', () => {
    const { onceItems, monthlyItems } = buildLineItems(entries, CATALOG);
    expect(monthlyItems).toHaveLength(0);
    // sw kept its position; the pc group block sits at pcB's first occurrence,
    // selected (pcA) ahead of the alternative (pcB).
    expect(onceItems.map((r) => r.id)).toEqual(['pcA', 'pcB', 'sw']);
  });
});

describe('computeTotals with option groups', () => {
  it('counts only the selected member of a group', () => {
    const totals = computeTotals(cart, CATALOG);
    expect(totals.once).toBe(450 + 999); // pcB (1299) excluded
  });

  it('switching the selected member changes the total accordingly', () => {
    const swapped = {
      ...cart,
      pcA: { ...cart.pcA, optionSelected: false },
      pcB: { ...cart.pcB, optionSelected: true },
    };
    expect(computeTotals(swapped, CATALOG).once).toBe(450 + 1299);
  });

  it('falls back to one member when none is flagged (never double-counts a group)', () => {
    const unflagged = {
      pcA: { qty: 1, discountQty: 0, optionGroup: 'pc' },
      pcB: { qty: 1, discountQty: 0, optionGroup: 'pc' },
    };
    // exactly one of the two counts — total is one PC, not both
    expect(computeTotals(unflagged, CATALOG).once).toBe(999);
  });
});
