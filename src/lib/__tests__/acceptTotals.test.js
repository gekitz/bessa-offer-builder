import { describe, it, expect } from 'vitest';
import { computeAcceptTotals } from '../acceptTotals';

// Minimal catalog: one monthly item (12-month tier) + one once item with
// a yearly service percent.
const CATALOG = {
  mon: { id: 'mon', name: 'Monthly', t: 'm', p: { y: 100 } },
  hw: { id: 'hw', name: 'Hardware', t: 'o', price: 1000, servicePercent: 10 },
  arb: { id: 'arb', name: 'Arbeitszeit', t: 'h', p: { o: 118 } },
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
      takeBack: 0, laborMinutes: 0, laborAmount: 0,
    });
  });

  it('freezes the Hardware-Rücknahme net credit (0 when absent/non-positive)', () => {
    const cart = { hw: { qty: 1 } };
    expect(computeAcceptTotals({ cart }, CATALOG).takeBack).toBe(0);
    expect(computeAcceptTotals({ cart, takeBack: { name: 'Alt', value: 300 } }, CATALOG).takeBack).toBe(300);
    expect(computeAcceptTotals({ cart, takeBack: { value: 0 } }, CATALOG).takeBack).toBe(0);
    expect(computeAcceptTotals({ cart, takeBack: { value: -5 } }, CATALOG).takeBack).toBe(0);
  });

  it('freezes the quoted labor hours + amount (kind:h)', () => {
    const offerData = {
      cart: { arb: { qty: 10, discountQty: 0 } }, // 10h × €118 = 1180
    };
    const t = computeAcceptTotals(offerData, CATALOG);
    expect(t.laborMinutes).toBe(600);
    expect(t.laborAmount).toBe(1180);
    // labor € also lives in the `once` bucket (kind:'h' flows into once).
    expect(t.once).toBe(1180);
  });

  it('reports zero labor when there are no hourly items', () => {
    const offerData = { cart: { mon: { qty: 1, tier: 'y' }, hw: { qty: 1 } } };
    const t = computeAcceptTotals(offerData, CATALOG);
    expect(t.laborMinutes).toBe(0);
    expect(t.laborAmount).toBe(0);
  });

  it('excludes labor on an unselected option-group alternative', () => {
    const offerData = {
      cart: {
        arb: { qty: 10, optionGroup: 'g1', optionSelected: true }, // counted
        arb2: { qty: 5, optionGroup: 'g1', optionSelected: false }, // alternative
      },
      customItems: { arb2: { id: 'arb2', name: 'Arbeitszeit B', t: 'h', p: { o: 118 } } },
    };
    const t = computeAcceptTotals(offerData, CATALOG);
    expect(t.laborMinutes).toBe(600); // only the selected 10h
    expect(t.laborAmount).toBe(1180);
  });
});
