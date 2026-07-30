import { describe, it, expect } from 'vitest';

import {
  ANZAHLUNG_SHARE,
  FIN_SURCHARGE,
  MIETE_DEPOSIT_BRUTTO,
  RABATT_PCT,
  TIER_MONTHS,
  VAT,
  computePlanPricing,
  planBasisFromOffer,
  toCents,
  type PlanBasis,
} from '../planPricing';
import { TIER_MONTHS as APP_TIER_MONTHS } from '../../data/tiers';
import { RABATT_PCT as DISCOUNTS_RABATT_PCT, UST } from '../discounts';

const BASIS: PlanBasis = {
  monthlyNet: 100,
  onceNet: 500,
  yearlyNet: 50,
  periodNet: 100 * 12 + 500 + 50, // 1750
  rabattActive: false,
  months: 12,
  raten: 12,
};

describe('computePlanPricing', () => {
  it('standard plan bills the plain amounts gross', () => {
    const p = computePlanPricing(BASIS).standard;
    expect(p.onceBrutto).toBeCloseTo(600, 10);
    expect(p.monthlyBrutto).toBeCloseTo(120, 10);
    expect(p.yearlyBrutto).toBeCloseTo(60, 10);
  });

  it('ratenzahlung: +8% on the gross period, 30% down, rest over the installments', () => {
    const p = computePlanPricing(BASIS).ratenzahlung;
    const total = 1750 * VAT * FIN_SURCHARGE;
    expect(p.totalBrutto).toBeCloseTo(total, 10);
    expect(p.anzahlungBrutto).toBeCloseTo(total * 0.3, 10);
    expect(p.ratePerMonthBrutto).toBeCloseTo((total * 0.7) / 12, 10);
    // Anzahlung + all Raten must re-add to the financed total (no money lost).
    expect(p.anzahlungBrutto + p.ratePerMonthBrutto * 12).toBeCloseTo(total, 8);
  });

  it('miete: fixed deposit + gross period spread over the term with +8%', () => {
    const p = computePlanPricing(BASIS).miete;
    expect(p.depositBrutto).toBe(MIETE_DEPOSIT_BRUTTO);
    expect(p.monthlyBrutto).toBeCloseTo(((1750 * VAT) / 12) * FIN_SURCHARGE, 10);
  });

  it('Rabatt reduces the financing base but never the standard amounts', () => {
    const plain = computePlanPricing(BASIS);
    const discounted = computePlanPricing({ ...BASIS, rabattActive: true });

    expect(discounted.standard).toEqual(plain.standard);
    expect(discounted.ratenzahlung.totalBrutto).toBeCloseTo(
      plain.ratenzahlung.totalBrutto * (1 - RABATT_PCT),
      10,
    );
    expect(discounted.miete.monthlyBrutto).toBeCloseTo(
      plain.miete.monthlyBrutto * (1 - RABATT_PCT),
      10,
    );
    expect(discounted.miete.depositBrutto).toBe(MIETE_DEPOSIT_BRUTTO);
  });

  it('guards against zero months/raten instead of dividing by zero', () => {
    const p = computePlanPricing({ ...BASIS, months: 0, raten: 0 });
    expect(Number.isFinite(p.miete.monthlyBrutto)).toBe(true);
    expect(Number.isFinite(p.ratenzahlung.ratePerMonthBrutto)).toBe(true);
  });
});

describe('planBasisFromOffer', () => {
  const snapshot = { monthly: 100, once: 500, yearly: 50, periodTotal: 1750, maxMonths: 12 };

  it('prefers the frozen acceptSnapshot', () => {
    const basis = planBasisFromOffer({
      total_monthly: 999, // stale columns must NOT win over the quoted snapshot
      total_once: 999,
      total_period: 9999,
      offer_data: { globalTier: '6mo', raten: 6, rabattActive: true, acceptSnapshot: snapshot },
    });
    expect(basis).toEqual({
      monthlyNet: 100,
      onceNet: 500,
      yearlyNet: 50,
      periodNet: 1750,
      months: 12,
      raten: 6,
      rabattActive: true,
    });
  });

  it('falls back to the total_* columns with the backfill identity for legacy rows', () => {
    const basis = planBasisFromOffer({
      total_monthly: 100,
      total_once: 500,
      total_period: 1750,
      offer_data: { globalTier: '12mo', raten: 12 },
    });
    // yearly = period - monthly×months - once = 1750 - 1200 - 500 = 50
    expect(basis.yearlyNet).toBeCloseTo(50, 10);
    expect(basis.months).toBe(12);
    expect(basis.rabattActive).toBe(false);
  });

  it('uses the tier for the legacy months fallback', () => {
    const basis = planBasisFromOffer({
      total_monthly: 100,
      total_once: 0,
      total_period: 600,
      offer_data: { globalTier: '6mo', raten: 12 },
    });
    expect(basis.months).toBe(6);
    expect(basis.yearlyNet).toBe(0);
  });

  it('survives a completely empty row with sane defaults', () => {
    const basis = planBasisFromOffer({});
    expect(basis).toEqual({
      monthlyNet: 0,
      onceNet: 0,
      yearlyNet: 0,
      periodNet: 0,
      months: 12,
      raten: 12,
      rabattActive: false,
    });
  });
});

describe('constants stay in sync with the app-side modules', () => {
  it('TIER_MONTHS mirrors src/data/tiers.ts', () => {
    expect(TIER_MONTHS).toEqual(APP_TIER_MONTHS);
  });

  it('RABATT_PCT and VAT mirror src/lib/discounts.ts', () => {
    expect(RABATT_PCT).toBe(DISCOUNTS_RABATT_PCT);
    expect(VAT).toBeCloseTo(1 + UST, 10);
  });
});

describe('toCents', () => {
  it('rounds euros to integer cents like Stripe expects', () => {
    expect(toCents(120)).toBe(12000);
    expect(toCents(37.005)).toBe(3701);
    expect(toCents(0)).toBe(0);
  });

  it('the sum of anzahlung + raten in cents never overshoots the total by more than rounding', () => {
    const p = computePlanPricing(BASIS).ratenzahlung;
    const drift = Math.abs(
      toCents(p.anzahlungBrutto) + toCents(p.ratePerMonthBrutto) * 12 - toCents(p.totalBrutto),
    );
    expect(drift).toBeLessThanOrEqual(12); // ≤1 cent per installment
  });

  it('the down-payment share is the advertised 30%', () => {
    expect(ANZAHLUNG_SHARE).toBe(0.3);
  });
});
