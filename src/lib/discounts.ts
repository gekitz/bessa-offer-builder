// Offer-level Rabatt (discount) and Skonto (cash discount) calculations.
//
// Both incentives are offered at fixed rates by the sales team:
//   - Rabatt: 2% off the whole first-year total (periodTotal), a real price
//     reduction that also flows into the financing figures.
//   - Skonto: 3% off the (post-Rabatt) gross total IF the customer pays in
//     full within the payment term. This is conditional, so it is shown as a
//     note and never affects financing (which is not "paid in full"). The
//     deadline matches the "Zahlungsziel: 10 Tage netto Kassa" auto-term.

export const RABATT_PCT = 0.02;
export const SKONTO_PCT = 0.03;
export const SKONTO_DAYS = 10;
export const UST = 0.2;

export interface DiscountInput {
  rabattActive?: boolean;
  skontoActive?: boolean;
}

export interface DiscountResult {
  rabattActive: boolean;
  skontoActive: boolean;
  rabattPct: number; // 0 or RABATT_PCT
  skontoPct: number; // 0 or SKONTO_PCT
  /** First-year net before Rabatt (the raw periodTotal). */
  baseNetto: number;
  /** Net amount of the Rabatt reduction. */
  rabattAmount: number;
  /** First-year net after Rabatt. */
  netto: number;
  /** First-year gross after Rabatt (= netto * 1.2). Used for financing. */
  brutto: number;
  /** Gross amount saved by paying within SKONTO_DAYS. */
  skontoAmount: number;
  /** Gross actually owed when Skonto is taken (= brutto - skontoAmount). */
  skontoBrutto: number;
}

// Pure: given the first-year net total and which incentives are active,
// returns every figure the UI / PDF / email need to render.
export function computeDiscounts(
  periodTotal: number,
  { rabattActive = false, skontoActive = false }: DiscountInput = {},
): DiscountResult {
  const base = Number.isFinite(periodTotal) ? periodTotal : 0;
  const rabattPct = rabattActive ? RABATT_PCT : 0;
  const rabattAmount = base * rabattPct;
  const netto = base - rabattAmount;
  const brutto = netto * (1 + UST);
  const skontoPct = skontoActive ? SKONTO_PCT : 0;
  const skontoAmount = brutto * skontoPct;
  const skontoBrutto = brutto - skontoAmount;

  return {
    rabattActive,
    skontoActive,
    rabattPct,
    skontoPct,
    baseNetto: base,
    rabattAmount,
    netto,
    brutto,
    skontoAmount,
    skontoBrutto,
  };
}
