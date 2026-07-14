import { describe, it, expect } from 'vitest';
import { computeTotals, type Cart } from '../totals';
import type { Catalog } from '../pricing';

const catalog: Catalog = {
  kassa: { id: 'kassa', name: 'Kassa', t: 'm', p: { y: 30, s: 40, m: 50, e: 60 } },
  webkassa: { id: 'webkassa', name: 'Web Kassa', t: 'm', p: { y: 19, s: 25, m: 30 } }, // no event
  install: { id: 'install', name: 'Installation', t: 'o', p: { o: 250 } },
  hardware: { id: 'hardware', name: 'Hardware', t: 'h', price: 800 },
  melzer: {
    id: 'melzer',
    name: 'Melzer',
    t: 'o',
    price: 1000,
    servicePercent: 10,
  },
  bessa: {
    id: 'bessa',
    name: 'bessa Handel',
    t: 'm',
    p: { y: 160 },
    discount: { type: 'fixed', value: 50 },
  },
  orderman: { id: 'orderman', name: 'Orderman', t: 'term', buy: 1200, rent: 40 },
};

describe('computeTotals', () => {
  it('returns zero-everything for an empty cart, with maxMonths defaulted to 12', () => {
    expect(computeTotals({}, catalog)).toEqual({
      monthly: 0,
      once: 0,
      yearly: 0,
      periodTotal: 0,
      periodMonthly: 0,
      maxMonths: 12,
    });
  });

  it('skips ids that are not in the catalog (custom items)', () => {
    const cart: Cart = { 'custom-1': { qty: 1 }, kassa: { qty: 1, tier: '12mo' } };
    const t = computeTotals(cart, catalog);
    expect(t.monthly).toBe(30);
  });

  it('excludes optional add-ons from every total', () => {
    const cart: Cart = {
      kassa: { qty: 1, tier: '12mo' },
      install: { qty: 1, optional: true },                // optional one-time
      webkassa: { qty: 1, tier: '12mo', optional: true }, // optional monthly
    };
    const t = computeTotals(cart, catalog);
    expect(t.monthly).toBe(30); // only kassa counts
    expect(t.once).toBe(0);     // install excluded
  });

  it('sums monthly items with their tier and reflects the longest period in maxMonths', () => {
    const cart: Cart = {
      kassa: { qty: 2, tier: '12mo' },
      webkassa: { qty: 1, tier: '6mo' },
    };
    const t = computeTotals(cart, catalog);
    // kassa@12mo (y=30) * 2 + webkassa@6mo (s=25) * 1
    expect(t.monthly).toBe(2 * 30 + 1 * 25);
    // periodMonthly = 60 * 12 + 25 * 6 = 720 + 150 = 870
    expect(t.periodMonthly).toBe(870);
    expect(t.periodTotal).toBe(870);
    expect(t.maxMonths).toBe(12);
    expect(t.once).toBe(0);
    expect(t.yearly).toBe(0);
  });

  it('uses 12 months when tier is missing', () => {
    const cart: Cart = { kassa: { qty: 1 } }; // no tier
    const t = computeTotals(cart, catalog);
    // price() falls back to first available tier => 30 (y/12mo)
    expect(t.monthly).toBe(30);
    expect(t.periodMonthly).toBe(30 * 12);
    expect(t.maxMonths).toBe(12);
  });

  it('sums one-time and hardware items into once', () => {
    const cart: Cart = {
      install: { qty: 1 },
      hardware: { qty: 2 },
    };
    const t = computeTotals(cart, catalog);
    expect(t.once).toBe(250 + 800 * 2);
    expect(t.periodTotal).toBe(250 + 800 * 2);
    expect(t.monthly).toBe(0);
    expect(t.yearly).toBe(0);
  });

  it('honours a per-line priceOverride instead of the catalog price', () => {
    const cart: Cart = {
      install: { qty: 2, priceOverride: 199 }, // catalog is 250
      hardware: { qty: 1 },
    };
    const t = computeTotals(cart, catalog);
    expect(t.once).toBe(199 * 2 + 800);
  });

  it('treats a priceOverride of 0 as a free line', () => {
    const cart: Cart = { install: { qty: 3, priceOverride: 0 } };
    expect(computeTotals(cart, catalog).once).toBe(0);
  });

  it('adds yearly Wartung for items with servicePercent and folds it into periodTotal', () => {
    const cart: Cart = { melzer: { qty: 3 } };
    const t = computeTotals(cart, catalog);
    expect(t.once).toBe(3000);
    // 1000 * 10% = 100 per unit, x3 = 300
    expect(t.yearly).toBe(300);
    expect(t.periodTotal).toBe(3000 + 300);
  });

  it('applies discountQty using the discountedPrice', () => {
    // bessa: y=160, discount fixed 50 -> 110 per discounted unit
    const cart: Cart = {
      bessa: { qty: 1, discountQty: 2, tier: '12mo' },
    };
    const t = computeTotals(cart, catalog);
    expect(t.monthly).toBe(160 + 2 * 110);
    expect(t.periodMonthly).toBe((160 + 2 * 110) * 12);
  });

  it('treats term items as monthly only when rented', () => {
    const rentCart: Cart = { orderman: { qty: 1, mode: 'rent' } };
    const buyCart: Cart = { orderman: { qty: 1, mode: 'buy' } };

    const rented = computeTotals(rentCart, catalog);
    expect(rented.monthly).toBe(40);
    expect(rented.once).toBe(0);

    const bought = computeTotals(buyCart, catalog);
    expect(bought.monthly).toBe(0);
    expect(bought.once).toBe(1200);
  });

  it('combines monthly + one-time + service into periodTotal', () => {
    const cart: Cart = {
      kassa: { qty: 1, tier: '12mo' }, // 30/mo * 12 = 360
      install: { qty: 1 }, // 250
      melzer: { qty: 1 }, // 1000 + 100 service
    };
    const t = computeTotals(cart, catalog);
    expect(t.monthly).toBe(30);
    expect(t.once).toBe(1250);
    expect(t.yearly).toBe(100);
    expect(t.periodMonthly).toBe(360);
    expect(t.periodTotal).toBe(360 + 1250 + 100);
    expect(t.maxMonths).toBe(12);
  });
});
