import { describe, it, expect } from 'vitest';

import {
  ANZAHLUNG_SHARE,
  FIN_SURCHARGE,
  MIETE_DEPOSIT_BRUTTO,
  MIETE_DEPOSIT_HARDWARE_PCT,
  defaultMieteKaution,
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

  it('Hardware-Rücknahme reduces the financing base and the standard once amount', () => {
    const plain = computePlanPricing(BASIS);
    const withTakeBack = computePlanPricing({ ...BASIS, takeBack: 300 });

    // Standard: the one-time credit lands on the once bucket only.
    expect(withTakeBack.standard.onceBrutto).toBeCloseTo((500 - 300) * VAT, 10);
    expect(withTakeBack.standard.monthlyBrutto).toBeCloseTo(plain.standard.monthlyBrutto, 10);
    expect(withTakeBack.standard.yearlyBrutto).toBeCloseTo(plain.standard.yearlyBrutto, 10);

    // Financed plans price off (periodNet − takeBack).
    expect(withTakeBack.ratenzahlung.totalBrutto).toBeCloseTo((1750 - 300) * VAT * FIN_SURCHARGE, 10);
    expect(withTakeBack.miete.monthlyBrutto).toBeCloseTo((((1750 - 300) * VAT) / 12) * FIN_SURCHARGE, 10);
  });

  it('stacks Rabatt (on goods) then Hardware-Rücknahme on the financing base', () => {
    const p = computePlanPricing({ ...BASIS, rabattActive: true, takeBack: 300 });
    // financedNet = 1750 × (1 − 2%) − 300 = 1415
    expect(p.ratenzahlung.totalBrutto).toBeCloseTo(1415 * VAT * FIN_SURCHARGE, 10);
  });

  it('treats a non-positive take-back as a no-op', () => {
    const plain = computePlanPricing(BASIS);
    expect(computePlanPricing({ ...BASIS, takeBack: 0 })).toEqual(plain);
    expect(computePlanPricing({ ...BASIS, takeBack: -50 })).toEqual(plain);
  });

  it('guards against zero months/raten instead of dividing by zero', () => {
    const p = computePlanPricing({ ...BASIS, months: 0, raten: 0 });
    expect(Number.isFinite(p.miete.monthlyBrutto)).toBe(true);
    expect(Number.isFinite(p.ratenzahlung.ratePerMonthBrutto)).toBe(true);
  });

  it('amortMonths defaults to the contract months → rent unchanged', () => {
    const base = computePlanPricing(BASIS).miete.monthlyBrutto;
    // Unset, explicitly equal to months, and ≤0 all collapse to the default.
    expect(computePlanPricing({ ...BASIS, amortMonths: 12 }).miete.monthlyBrutto).toBeCloseTo(base, 10);
    expect(computePlanPricing({ ...BASIS, amortMonths: 0 }).miete.monthlyBrutto).toBeCloseTo(base, 10);
    expect(computePlanPricing({ ...BASIS, amortMonths: -4 }).miete.monthlyBrutto).toBeCloseTo(base, 10);
  });

  it('amortMonths spreads the one-time bucket over its own horizon; recurring stays tied to months', () => {
    // onceFinancedNet = 500, recurring = 1750 − 500 = 1250 (monthly×12 + yearly).
    // Rent = recurring/months + once/amort, gross with VAT and the 8% surcharge.
    const rent = (amort: number) => (1250 / 12 + 500 / amort) * VAT * FIN_SURCHARGE;
    expect(computePlanPricing({ ...BASIS, amortMonths: 8 }).miete.monthlyBrutto).toBeCloseTo(rent(8), 10);
    expect(computePlanPricing({ ...BASIS, amortMonths: 16 }).miete.monthlyBrutto).toBeCloseTo(rent(16), 10);
    expect(computePlanPricing({ ...BASIS, amortMonths: 24 }).miete.monthlyBrutto).toBeCloseTo(rent(24), 10);
    // Shorter horizon → higher rent; longer → lower.
    const r8 = computePlanPricing({ ...BASIS, amortMonths: 8 }).miete.monthlyBrutto;
    const r16 = computePlanPricing({ ...BASIS, amortMonths: 16 }).miete.monthlyBrutto;
    expect(r8).toBeGreaterThan(r16);
  });

  it('amortMonths changes only the Miete rent, never Standard or Ratenzahlung', () => {
    const base = computePlanPricing(BASIS);
    const amort = computePlanPricing({ ...BASIS, amortMonths: 24 });
    expect(amort.standard).toEqual(base.standard);
    expect(amort.ratenzahlung).toEqual(base.ratenzahlung);
    expect(amort.miete.depositBrutto).toBe(base.miete.depositBrutto);
    expect(amort.miete.monthlyBrutto).not.toBeCloseTo(base.miete.monthlyBrutto, 2);
  });

  it('defaults the Kaution to scale with the one-time bucket, floored at the minimum', () => {
    // BASIS.onceNet = 500 → default = max(500, 500) = the floor (unchanged).
    expect(computePlanPricing(BASIS).miete.depositBrutto).toBe(MIETE_DEPOSIT_BRUTTO);
    // A €10k installation → the deposit secures the hardware, not a flat €500.
    const big = computePlanPricing({ ...BASIS, onceNet: 10000, periodNet: 100 * 12 + 10000 + 50 });
    expect(big.miete.depositBrutto).toBe(Math.round(10000 * MIETE_DEPOSIT_HARDWARE_PCT));
    expect(big.miete.depositBrutto).toBeGreaterThan(MIETE_DEPOSIT_BRUTTO);
  });

  it('a manual Kaution overrides the scaled default (0 allowed)', () => {
    const big = { ...BASIS, onceNet: 10000, periodNet: 100 * 12 + 10000 + 50 };
    expect(computePlanPricing({ ...big, kaution: 3000 }).miete.depositBrutto).toBe(3000);
    expect(computePlanPricing({ ...big, kaution: 0 }).miete.depositBrutto).toBe(0);
    // A negative/garbage override is ignored → back to the scaled default.
    expect(computePlanPricing({ ...big, kaution: -100 }).miete.depositBrutto).toBe(
      defaultMieteKaution(10000),
    );
  });

  it('defaultMieteKaution floors small/zero hardware at the minimum', () => {
    expect(defaultMieteKaution(0)).toBe(MIETE_DEPOSIT_BRUTTO);
    expect(defaultMieteKaution(100)).toBe(MIETE_DEPOSIT_BRUTTO);
    expect(defaultMieteKaution(8333)).toBe(Math.round(8333 * MIETE_DEPOSIT_HARDWARE_PCT));
  });

  it('steps the rent down once the one-time bucket is amortised (amort < months)', () => {
    const p = computePlanPricing({ ...BASIS, amortMonths: 8 }).miete;
    expect(p.stepMonths).toBe(8);
    // Phase 1 = recurring + once/8; phase 2 = recurring only.
    expect(p.monthlyBrutto).toBeCloseTo((1250 / 12 + 500 / 8) * VAT * FIN_SURCHARGE, 10);
    expect(p.monthlyAfterBrutto).toBeCloseTo((1250 / 12) * VAT * FIN_SURCHARGE, 10);
    expect(p.monthlyAfterBrutto).toBeLessThan(p.monthlyBrutto);
  });

  it('does not step when amort ≥ months or there is no one-time bucket (flat rent)', () => {
    // Default (amort = months): flat, after === monthly, no step.
    const flat = computePlanPricing(BASIS).miete;
    expect(flat.stepMonths).toBeNull();
    expect(flat.monthlyAfterBrutto).toBeCloseTo(flat.monthlyBrutto, 10);

    // amort beyond the term: lower flat rent, still no step (hardware not fully
    // recovered within the term — the caller/owner accepts that trade-off).
    const long = computePlanPricing({ ...BASIS, amortMonths: 24 }).miete;
    expect(long.stepMonths).toBeNull();
    expect(long.monthlyAfterBrutto).toBeCloseTo(long.monthlyBrutto, 10);
    expect(long.monthlyBrutto).toBeLessThan(flat.monthlyBrutto);

    // No one-time bucket → nothing to amortise → flat even with a short horizon.
    const noOnce = computePlanPricing({ ...BASIS, onceNet: 0, periodNet: 1250, amortMonths: 6 }).miete;
    expect(noOnce.stepMonths).toBeNull();
  });

  it('amortMonths composes with Rabatt and Hardware-Rücknahme on the once bucket', () => {
    // onceFinancedNet = 500×0.98 − 300 = 190; the take-back cancels out of the
    // recurring part: recurring = (1750 − 500)×0.98 = 1225.
    const p = computePlanPricing({ ...BASIS, rabattActive: true, takeBack: 300, amortMonths: 20 });
    expect(p.miete.monthlyBrutto).toBeCloseTo((1225 / 12 + 190 / 20) * VAT * FIN_SURCHARGE, 10);
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
      takeBack: 0,
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

  it('prefers an explicit laufzeitMonths over the tier for legacy months', () => {
    const basis = planBasisFromOffer({
      total_monthly: 100,
      total_once: 500,
      total_period: 100 * 24 + 500, // period built over the 24-month term
      offer_data: { globalTier: '12mo', laufzeitMonths: 24 },
    });
    expect(basis.months).toBe(24);
    // yearly = period − monthly×24 − once = 0 (back-calc uses the same term)
    expect(basis.yearlyNet).toBe(0);
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
      takeBack: 0,
      months: 12,
      raten: 12,
      rabattActive: false,
    });
  });

  it('reads the frozen take-back from the acceptSnapshot', () => {
    const basis = planBasisFromOffer({
      offer_data: { acceptSnapshot: { ...snapshot, takeBack: 300 } },
    });
    expect(basis.takeBack).toBe(300);
  });

  it('reads an explicit amortMonths from offer_data (snapshot + legacy paths)', () => {
    const snap = planBasisFromOffer({
      offer_data: { amortMonths: 16, acceptSnapshot: snapshot },
    });
    expect(snap.amortMonths).toBe(16);

    const legacy = planBasisFromOffer({
      total_monthly: 100,
      total_once: 500,
      total_period: 1750,
      offer_data: { globalTier: '12mo', amortMonths: 24 },
    });
    expect(legacy.amortMonths).toBe(24);
  });

  it('reads a manual Kaution from offer_data (snapshot + legacy paths)', () => {
    const withSnap = planBasisFromOffer({ offer_data: { kaution: 3000, acceptSnapshot: snapshot } });
    expect(withSnap.kaution).toBe(3000);
    const legacy = planBasisFromOffer({
      total_monthly: 100,
      total_once: 500,
      total_period: 1750,
      offer_data: { globalTier: '12mo', kaution: 0 },
    });
    expect(legacy.kaution).toBe(0); // 0 is a valid "no deposit" override
    expect(planBasisFromOffer({ offer_data: { acceptSnapshot: snapshot } }).kaution).toBeUndefined();
  });

  it('leaves amortMonths unset when offer_data has none → default rent', () => {
    expect(planBasisFromOffer({ offer_data: { acceptSnapshot: snapshot } }).amortMonths).toBeUndefined();
    expect(planBasisFromOffer({}).amortMonths).toBeUndefined();
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
