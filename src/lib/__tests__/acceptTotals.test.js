import { describe, it, expect } from 'vitest';
import { computeAcceptTotals } from '../acceptTotals';

// Minimal catalog: one monthly item (12-month tier) + one once item with
// a yearly service percent.
const CATALOG = {
  mon: { id: 'mon', name: 'Monthly', t: 'm', p: { y: 100 } },
  hw: { id: 'hw', name: 'Hardware', t: 'o', price: 1000, servicePercent: 10 },
};

describe('computeAcceptTotals', () => {
  it('sums monthly, once, yearly service and the period total', () => {
    const offerData = {
      cart: {
        mon: { qty: 2, discountQty: 0, tier: 'y' }, // 2 × 100 = 200/mo
        hw: { qty: 1, discountQty: 0 },             // 1000 once, +100 yearly service
      },
    };
    const t = computeAcceptTotals(offerData, CATALOG);
    expect(t.monthly).toBe(200);
    expect(t.once).toBe(1000);
    expect(t.yearly).toBe(100); // 10% of 1000
    expect(t.maxMonths).toBe(12);
    // period = 200×12 (monthly) + 1000 (once) + 100 (service) = 3500
    expect(t.periodTotal).toBe(3500);
  });

  it('falls back to customItems and skips unknown ids', () => {
    const offerData = {
      cart: { custom1: { qty: 1, tier: 'y' }, ghost: { qty: 5 } },
      customItems: { custom1: { id: 'custom1', name: 'X', t: 'm', p: { y: 50 } } },
    };
    const t = computeAcceptTotals(offerData, CATALOG);
    expect(t.monthly).toBe(50); // custom item counted, ghost ignored
  });

  it('never charges for optional add-ons', () => {
    const offerData = {
      cart: {
        mon: { qty: 1, tier: 'y' },              // 100/mo counted
        hw: { qty: 1, optional: true },          // optional once → not charged
        extra: { qty: 1, tier: 'y', optional: true }, // optional monthly → not charged
      },
      customItems: { extra: { id: 'extra', name: 'Extra', t: 'm', p: { y: 999 } } },
    };
    const t = computeAcceptTotals(offerData, CATALOG);
    expect(t.monthly).toBe(100); // only mon
    expect(t.once).toBe(0);      // hw excluded
    expect(t.yearly).toBe(0);    // hw's service excluded too
  });

  it('returns zeros for an empty cart', () => {
    expect(computeAcceptTotals({ cart: {} }, CATALOG)).toEqual({
      monthly: 0, once: 0, yearly: 0, periodTotal: 0, maxMonths: 12,
    });
  });
});
