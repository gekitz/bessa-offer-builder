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
  /** Contract length in months (Miete divisor, fixed-term cancel horizon). */
  months: number;
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
    monthlyBrutto: number;
  };
}

/**
 * All gross amounts for the three payment plans. The Rabatt only reduces the
 * financing base (Ratenzahlung/Miete) — the Standard plan bills the plain
 * monthly/once/yearly amounts, exactly as the offer lists them.
 */
export function computePlanPricing(basis: PlanBasis): PlanPricing {
  const financedNet = basis.periodNet * (basis.rabattActive ? 1 - RABATT_PCT : 1);
  const financedBrutto = financedNet * VAT;
  const ratenTotal = financedBrutto * FIN_SURCHARGE;
  const months = basis.months > 0 ? basis.months : 12;
  const raten = basis.raten > 0 ? basis.raten : 12;

  return {
    standard: {
      onceBrutto: basis.onceNet * VAT,
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
      monthlyBrutto: (financedBrutto / months) * FIN_SURCHARGE,
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
    rabattActive?: boolean;
    acceptSnapshot?: {
      monthly?: number;
      once?: number;
      yearly?: number;
      periodTotal?: number;
      maxMonths?: number;
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

  const snap = data.acceptSnapshot;
  if (snap) {
    return {
      monthlyNet: num(snap.monthly),
      onceNet: num(snap.once),
      yearlyNet: num(snap.yearly),
      periodNet: num(snap.periodTotal),
      months: num(snap.maxMonths) || 12,
      raten,
      rabattActive,
    };
  }

  const months = TIER_MONTHS[data.globalTier || '12mo'] || 12;
  const monthlyNet = num(offer.total_monthly);
  const onceNet = num(offer.total_once);
  const periodNet = num(offer.total_period);
  const yearlyNet = Math.max(0, periodNet - monthlyNet * months - onceNet);
  return { monthlyNet, onceNet, yearlyNet, periodNet, months, raten, rabattActive };
}

/** Euro → integer cents, the amount Stripe is given. */
export function toCents(euro: number): number {
  return Math.round(euro * 100);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
