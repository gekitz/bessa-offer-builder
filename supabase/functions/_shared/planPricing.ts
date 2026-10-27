// Single source of truth for the customer-facing payment-plan money math.
//
// Imported by BOTH worlds:
//   - the stripe-complete-acceptance edge function (Deno) — the amounts that
//     are actually charged, and
//   - the React app (builder Finanzierungsoptionen, PDF FinancingSection,
//     accept page plan cards, acceptance confirmation) via src/lib/planPricing.
//
// Whatever a customer was shown in the offer/PDF must be exactly what Stripe
// collects, so every formula lives here and nowhere else. Keep this file
// dependency-free: Deno resolves it by relative path with no import map, and
// the frontend bundles it from outside src/.

export const VAT = 1.2;
/** Financing upcharge on Ratenzahlung and Miete. */
export const FIN_SURCHARGE = 1.08;
/** Optional sales discount on the whole first-year total (see src/lib/discounts.ts). */
export const RABATT_PCT = 0.02;
/** Share of the financed total due upfront on Ratenzahlung. */
export const ANZAHLUNG_SHARE = 0.3;
/** Fixed rental deposit, gross. */
export const MIETE_DEPOSIT_BRUTTO = 500;

// Mirrors src/data/tiers.ts (pinned by a consistency test) — needed here for
// legacy offers whose rows predate the acceptSnapshot and only carry a tier.
export const TIER_MONTHS: Record<string, number> = {
  '12mo': 12,
  '6mo': 6,
  '2mo': 2,
  event: 1,
};

/** The net quoted numbers a plan is priced from. */
export interface PlanBasis {
  monthlyNet: number;
  onceNet: number;
  /** Yearly Wartung (service) net. */
  yearlyNet: number;
  /** First-year net total (monthly×months + once + yearly), BEFORE Rabatt. */
  periodNet: number;
  /** 2% Rabatt granted on this offer — reduces the financing base. */
  rabattActive: boolean;
  /** Net credit for hardware taken back from the customer (Hardware-Rücknahme).
   *  Reduces the financing base after the Rabatt. Optional (legacy = 0). */
  takeBack?: number;
  /** Contract length in months (Miete divisor, fixed-term cancel horizon). */
  months: number;
  /**
   * Horizon (months) over which the one-time bucket (hardware + setup) is
   * amortised into the monthly Miete. Lets a longer rental spread the upfront
   * cost thinner — a smaller value recovers it faster (safer against early
   * drop-out), a larger value lowers the monthly. Defaults to `months`, which
   * recovers the one-time cost over the first year exactly as before, so an
   * unset value leaves the rent unchanged. Internal pricing lever; the
   * recurring part (software + Wartung) always stays tied to `months`.
   */
  amortMonths?: number;
  /** Number of Ratenzahlung installments. */
  raten: number;
}

export interface PlanPricing {
  standard: {
    onceBrutto: number;
    monthlyBrutto: number;
    yearlyBrutto: number;
  };
  ratenzahlung: {
    /** First-year total incl. Rabatt, VAT and the 8% surcharge. */
    totalBrutto: number;
    anzahlungBrutto: number;
    ratePerMonthBrutto: number;
  };
  miete: {
    depositBrutto: number;
    /** Monthly rent while the one-time bucket is still being amortised (phase 1). */
    monthlyBrutto: number;
    /**
     * Monthly rent after the one-time bucket is paid off — recurring only
     * (software + Wartung), phase 2. Equals monthlyBrutto when nothing steps.
     */
    monthlyAfterBrutto: number;
    /**
     * Length of phase 1 in months when the rent steps down (the one-time bucket
     * finishes amortising before the term ends). null = flat rent for the whole
     * term, i.e. monthlyBrutto every month and no phase 2.
     */
    stepMonths: number | null;
  };
}

/**
 * All gross amounts for the three payment plans. The Rabatt only reduces the
 * financing base (Ratenzahlung/Miete) — the Standard plan bills the plain
 * monthly/once/yearly amounts. A Hardware-Rücknahme, however, is a real credit
 * for goods handed back and applies on every plan: it reduces the financing
 * base AND the Standard plan's one-time (once) amount.
 */
export function computePlanPricing(basis: PlanBasis): PlanPricing {
  const takeBack = Number.isFinite(basis.takeBack) && (basis.takeBack as number) > 0 ? (basis.takeBack as number) : 0;
  const financedNet = basis.periodNet * (basis.rabattActive ? 1 - RABATT_PCT : 1) - takeBack;
  const financedBrutto = financedNet * VAT;
  const ratenTotal = financedBrutto * FIN_SURCHARGE;
  const months = basis.months > 0 ? basis.months : 12;
  const raten = basis.raten > 0 ? basis.raten : 12;
  // The one-time bucket amortises over its own horizon; default = months, i.e.
  // unchanged. Split financedNet into its recurring part (software + Wartung,
  // tied to the contract months) and its one-time part (onceNet less take-back).
  // The two re-add to financedNet, so when amortMonths === months the rent is
  // bit-for-bit the previous (financedBrutto / months) × surcharge.
  const amortMonths = basis.amortMonths && basis.amortMonths > 0 ? basis.amortMonths : months;
  const onceFinancedNet = basis.onceNet * (basis.rabattActive ? 1 - RABATT_PCT : 1) - takeBack;
  const recurringFinancedNet = financedNet - onceFinancedNet;
  // Phase 1: recurring + the one-time bucket amortised over amortMonths.
  const mieteMonthlyNet = recurringFinancedNet / months + onceFinancedNet / amortMonths;
  // Phase 2: recurring only, once the hardware/setup is paid off.
  const mieteAfterNet = recurringFinancedNet / months;
  // The rent steps down only when the one-time bucket finishes amortising
  // strictly before the term ends (and there is something to amortise). When it
  // doesn't — amortMonths ≥ months, or no one-time cost — the rent is flat and
  // phase 2 never happens, so stepMonths is null and the two monthlies match.
  const stepsDown = onceFinancedNet > 0 && amortMonths < months;

  return {
    standard: {
      // The one-time take-back credit lands on the one-time bucket.
      onceBrutto: (basis.onceNet - takeBack) * VAT,
      monthlyBrutto: basis.monthlyNet * VAT,
      yearlyBrutto: basis.yearlyNet * VAT,
    },
    ratenzahlung: {
      totalBrutto: ratenTotal,
      anzahlungBrutto: ratenTotal * ANZAHLUNG_SHARE,
      ratePerMonthBrutto: (ratenTotal * (1 - ANZAHLUNG_SHARE)) / raten,
    },
    miete: {
      depositBrutto: MIETE_DEPOSIT_BRUTTO,
      monthlyBrutto: mieteMonthlyNet * VAT * FIN_SURCHARGE,
      monthlyAfterBrutto: (stepsDown ? mieteAfterNet : mieteMonthlyNet) * VAT * FIN_SURCHARGE,
      stepMonths: stepsDown ? amortMonths : null,
    },
  };
}

/** Minimal shape of an `offers` row (+ offer_data) the pricing needs. */
export interface OfferRowLike {
  total_monthly?: number | string | null;
  total_once?: number | string | null;
  total_period?: number | string | null;
  offer_data?: {
    globalTier?: string;
    raten?: number;
    amortMonths?: number;
    laufzeitMonths?: number;
    rabattActive?: boolean;
    acceptSnapshot?: {
      monthly?: number;
      once?: number;
      yearly?: number;
      periodTotal?: number;
      maxMonths?: number;
      takeBack?: number;
    };
  } | null;
}

/**
 * The plan basis for an offer row: the frozen acceptSnapshot when present
 * (the numbers the customer was quoted), else — for legacy rows — the same
 * identity the snapshot backfill migration used, derived from the stored
 * total_* columns and the offer's global tier.
 */
export function planBasisFromOffer(offer: OfferRowLike): PlanBasis {
  const data = offer.offer_data || {};
  const raten = Number(data.raten) || 12;
  const rabattActive = !!data.rabattActive;

  // Optional internal pricing lever; absent on legacy/most offers → falls back
  // to the contract months in computePlanPricing, i.e. the unchanged rent.
  const amortMonths = num(data.amortMonths) || undefined;

  const snap = data.acceptSnapshot;
  if (snap) {
    return {
      monthlyNet: num(snap.monthly),
      onceNet: num(snap.once),
      yearlyNet: num(snap.yearly),
      periodNet: num(snap.periodTotal),
      takeBack: num(snap.takeBack),
      months: num(snap.maxMonths) || 12,
      amortMonths,
      raten,
      rabattActive,
    };
  }

  // The editable contract-term override wins over the tier default when present,
  // so the yearly back-calc below uses the same horizon the totals were built on.
  const months = num(data.laufzeitMonths) || TIER_MONTHS[data.globalTier || '12mo'] || 12;
  const monthlyNet = num(offer.total_monthly);
  const onceNet = num(offer.total_once);
  const periodNet = num(offer.total_period);
  const yearlyNet = Math.max(0, periodNet - monthlyNet * months - onceNet);
  return { monthlyNet, onceNet, yearlyNet, periodNet, takeBack: 0, months, amortMonths, raten, rabattActive };
}

/** Euro → integer cents, the amount Stripe is given. */
export function toCents(euro: number): number {
  return Math.round(euro * 100);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
