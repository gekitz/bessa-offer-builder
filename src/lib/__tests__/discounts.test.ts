import { describe, it, expect } from 'vitest';
import {
  computeDiscounts,
  RABATT_PCT,
  SKONTO_PCT,
} from '../discounts';

describe('computeDiscounts', () => {
  it('returns the base untouched when nothing is active', () => {
    const r = computeDiscounts(1000);
    expect(r.rabattAmount).toBe(0);
    expect(r.netto).toBe(1000);
    expect(r.brutto).toBeCloseTo(1200);
    expect(r.skontoAmount).toBe(0);
    expect(r.skontoBrutto).toBeCloseTo(1200);
    expect(r.rabattActive).toBe(false);
    expect(r.skontoActive).toBe(false);
  });

  it('applies 2% Rabatt to the net first-year total', () => {
    const r = computeDiscounts(1000, { rabattActive: true });
    expect(r.rabattPct).toBe(RABATT_PCT);
    expect(r.rabattAmount).toBeCloseTo(20); // 2% of 1000
    expect(r.netto).toBeCloseTo(980);
    expect(r.brutto).toBeCloseTo(1176); // 980 * 1.2
  });

  it('computes 3% Skonto on the gross (after Rabatt) without changing netto', () => {
    const r = computeDiscounts(1000, { rabattActive: true, skontoActive: true });
    expect(r.skontoPct).toBe(SKONTO_PCT);
    expect(r.netto).toBeCloseTo(980); // Skonto does not touch the net price
    expect(r.brutto).toBeCloseTo(1176);
    expect(r.skontoAmount).toBeCloseTo(35.28); // 3% of 1176
    expect(r.skontoBrutto).toBeCloseTo(1140.72);
  });

  it('applies Skonto on the un-discounted gross when only Skonto is active', () => {
    const r = computeDiscounts(1000, { skontoActive: true });
    expect(r.rabattAmount).toBe(0);
    expect(r.brutto).toBeCloseTo(1200);
    expect(r.skontoAmount).toBeCloseTo(36); // 3% of 1200
    expect(r.skontoBrutto).toBeCloseTo(1164);
  });

  it('handles a zero / non-finite base gracefully', () => {
    expect(computeDiscounts(0, { rabattActive: true, skontoActive: true }).skontoBrutto).toBe(0);
    expect(computeDiscounts(NaN as unknown as number).netto).toBe(0);
  });
});
