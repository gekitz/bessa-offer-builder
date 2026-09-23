import { describe, it, expect } from 'vitest';
import { buildLineSnapshotFrom } from '../offerLineSnapshot';
import type { Catalog } from '../pricing';

// Monthly software (tiered), one-time hardware, a non-selected option-group
// alternative, and an optional add-on — the mix that must be filtered down to
// only the counted lines.
const CATALOG: Catalog = {
  sw: { id: 'sw', name: 'Kleiner Gastrobetrieb', t: 'm', p: { y: 45 }, code: 'KS' },
  hw: { id: 'hw', name: 'Sunmi D3 Pro', t: 'o', price: 949 },
  pcA: { id: 'pcA', name: 'PC Option A', t: 'o', price: 999 },
  pcB: { id: 'pcB', name: 'PC Option B', t: 'o', price: 1299 },
  addon: { id: 'addon', name: 'Optionaler Drucker', t: 'o', price: 200 },
  bon: { id: 'bon', name: 'Bonrolle', t: 'o', price: 100, discount: { type: 'fixed', value: 40 } },
};

describe('buildLineSnapshotFrom', () => {
  it('keeps counted lines, drops optional + non-selected alternatives, monthly first', () => {
    const cart = {
      hw: { qty: 1, discountQty: 0 },
      sw: { qty: 1, discountQty: 0, tier: '12mo' as const },
      pcB: { qty: 1, discountQty: 0, optionGroup: 'pc', optionSelected: false },
      pcA: { qty: 1, discountQty: 0, optionGroup: 'pc', optionSelected: true },
      addon: { qty: 1, discountQty: 0, optional: true },
    };
    const snap = buildLineSnapshotFrom(cart, ['sw', 'hw', 'pcA', 'pcB', 'addon'], CATALOG);

    // Monthly line first, then once lines; pcB (unselected) + addon (optional) gone.
    expect(snap.map((l) => l.name)).toEqual([
      'Kleiner Gastrobetrieb',
      'Sunmi D3 Pro',
      'PC Option A',
    ]);
    expect(snap[0]).toMatchObject({ monthly: true, tier: '12mo', unitPrice: 45, code: 'KS', qty: 1 });
    expect(snap[1]).toMatchObject({ monthly: false, unitPrice: 949, qty: 1 });
    expect(snap[2]).toMatchObject({ monthly: false, unitPrice: 999 });
  });

  it('carries a discount split (qty + discountQty, full + Aktionspreis) through', () => {
    const cart = {
      bon: { qty: 3, discountQty: 2 }, // bon has a fixed 40 discount → 100 / 60
    };
    const snap = buildLineSnapshotFrom(cart, null, CATALOG);
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ qty: 3, discountQty: 2, unitPrice: 100, discountPrice: 60 });
  });

  it('drops cart ids that are not in the catalog', () => {
    const cart = {
      hw: { qty: 1, discountQty: 0 },
      ghost: { qty: 1, discountQty: 0 }, // not in CATALOG
    };
    const snap = buildLineSnapshotFrom(cart, null, CATALOG);
    expect(snap.map((l) => l.name)).toEqual(['Sunmi D3 Pro']);
  });

  it('returns [] for an empty cart', () => {
    expect(buildLineSnapshotFrom({}, null, CATALOG)).toEqual([]);
  });
});
