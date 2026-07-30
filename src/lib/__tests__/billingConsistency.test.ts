import { describe, it, expect } from 'vitest';

import { computeTotals, type Cart } from '../totals';
import { computeAcceptTotals } from '../acceptTotals';
import { computeDiscounts } from '../discounts';
import { fmt } from '../format';
import type { Catalog } from '../pricing';
import {
  computePlanPricing,
  planBasisFromOffer,
  toCents,
  type PlanPricing,
} from '../planPricing';

// End-to-end money-consistency suite: the amounts a customer sees in the
// builder (OfferView), the PDF, and the accept page MUST be the amounts
// stripe-complete-acceptance charges. Each layer draws from one of two
// sources — computeTotals (builder, PDF, total_* columns) and
// computeAcceptTotals (the frozen acceptSnapshot) — and prices plans through
// the shared computePlanPricing module. These tests pin the whole chain:
//
//   cart ──computeTotals──▶ builder UI / PDF / offers.total_*
//        ──computeAcceptTotals──▶ offer_data.acceptSnapshot
//   offer row ──planBasisFromOffer──▶ computePlanPricing ──▶ Stripe cents
//
// If any two layers ever disagree, a customer is quoted one number and
// charged another — the exact failure this file exists to prevent.

const CATALOG: Catalog = {
  kasse: {
    id: 'kasse',
    name: 'Kassa Software',
    t: 'm',
    p: { y: 89, s: 109, m: 129, e: 149 },
    discount: { type: 'percent', value: 50, label: '2. Kasse -50%' },
  },
  modul: { id: 'modul', name: 'Gutschein Modul', t: 'm', p: { y: 19 } },
  saison: { id: 'saison', name: 'Saison Modul', t: 'm', p: { s: 39 } },
  drucker: { id: 'drucker', name: 'Bondrucker', t: 'o', price: 390, servicePercent: 10 },
  display: { id: 'display', name: 'Kundendisplay', t: 'o', price: 250 },
  arbeit: { id: 'arbeit', name: 'Arbeitszeit', t: 'h', price: 120 },
};

const CUSTOM_ITEMS: Catalog = {
  custom_1: { id: 'custom_1', name: 'Sonderposten', t: 'o', price: 111 },
};

// The builder holds custom items merged into its ALL lookup; reproduce that.
const BUILDER_CATALOG = { ...CATALOG, ...CUSTOM_ITEMS };

interface RowOpts {
  globalTier?: string;
  raten?: number;
  rabattActive?: boolean;
}

/** Build the offer row exactly like the app: computeTotals → total_* columns
 *  (OfferBuilderPage persistTotals), computeAcceptTotals → acceptSnapshot
 *  (buildAcceptSnapshot on every save path). */
function offerRowFromCart(cart: Cart, { globalTier = '12mo', raten = 12, rabattActive = false }: RowOpts = {}) {
  const totals = computeTotals(cart, BUILDER_CATALOG);
  const snapshot = computeAcceptTotals({ cart, customItems: CUSTOM_ITEMS }, CATALOG);
  const row = {
    total_monthly: totals.monthly,
    total_once: totals.once,
    total_period: totals.periodTotal,
    offer_data: { globalTier, raten, rabattActive, acceptSnapshot: snapshot },
  };
  return { totals, snapshot, row };
}

const CARTS: Record<string, Cart> = {
  'plain cart': {
    kasse: { qty: 1, tier: '12mo' },
    drucker: { qty: 1 },
    arbeit: { qty: 3 },
  },
  'discounted second unit': {
    kasse: { qty: 1, discountQty: 1, tier: '12mo' },
    drucker: { qty: 2 },
  },
  'option group — only the selected alternative counts': {
    kasse: { qty: 1, tier: '12mo' },
    drucker: { qty: 1, optionGroup: 'Drucker', optionSelected: true },
    display: { qty: 1, optionGroup: 'Drucker', optionSelected: false },
  },
  'optional add-on is listed but never charged': {
    kasse: { qty: 1, tier: '12mo' },
    modul: { qty: 1, tier: '12mo', optional: true },
    drucker: { qty: 1, optional: true },
  },
  'custom item': {
    kasse: { qty: 1, tier: '12mo' },
    custom_1: { qty: 2 },
  },
  'mixed tiers': {
    kasse: { qty: 1, tier: '12mo' },
    saison: { qty: 1, tier: '6mo' },
    drucker: { qty: 1 },
  },
};

describe('acceptSnapshot equals the builder/PDF totals (same cart, same numbers)', () => {
  for (const [name, cart] of Object.entries(CARTS)) {
    it(name, () => {
      const { totals, snapshot } = offerRowFromCart(cart);
      expect(snapshot.monthly).toBeCloseTo(totals.monthly, 10);
      expect(snapshot.once).toBeCloseTo(totals.once, 10);
      expect(snapshot.yearly).toBeCloseTo(totals.yearly, 10);
      expect(snapshot.periodTotal).toBeCloseTo(totals.periodTotal, 10);
      expect(snapshot.maxMonths).toBe(totals.maxMonths);
    });
  }
});

describe('what the builder/PDF show is what Stripe charges (cents-exact)', () => {
  for (const rabattActive of [false, true]) {
    for (const [name, cart] of Object.entries(CARTS)) {
      it(`${name}${rabattActive ? ' + 2% Rabatt' : ''}`, () => {
        const { totals, row } = offerRowFromCart(cart, { rabattActive });

        // What OfferView + the PDF FinancingSection render:
        const shown = computePlanPricing({
          monthlyNet: totals.monthly,
          onceNet: totals.once,
          yearlyNet: totals.yearly,
          periodNet: totals.periodTotal,
          rabattActive,
          months: totals.maxMonths,
          raten: 12,
        });

        // What the edge function charges (accept page renders the same call):
        const charged = computePlanPricing(planBasisFromOffer(row));

        const asRecords = (p: PlanPricing) =>
          p as unknown as Record<string, Record<string, number>>;
        for (const [plan, fields] of Object.entries(asRecords(shown))) {
          for (const [field, euro] of Object.entries(fields)) {
            expect(
              toCents(asRecords(charged)[plan][field]),
              `${plan}.${field} shown vs charged`,
            ).toBe(toCents(euro));
          }
        }
      });
    }
  }
});

describe('legacy offers without a snapshot (column fallback)', () => {
  it('charges the same as the snapshot path when the cart uses the global tier', () => {
    const cart: Cart = { kasse: { qty: 2, tier: '6mo' }, drucker: { qty: 1 } };
    const { row } = offerRowFromCart(cart, { globalTier: '6mo', raten: 6 });
    const legacyRow = {
      ...row,
      offer_data: { ...row.offer_data, acceptSnapshot: undefined },
    };

    const fromSnapshot = computePlanPricing(planBasisFromOffer(row));
    const fromColumns = computePlanPricing(planBasisFromOffer(legacyRow));
    expect(fromColumns).toEqual(fromSnapshot);
  });
});

describe('the PDF GESAMTÜBERSICHT figure matches the financed total', () => {
  it('discount.brutto × 1.08 is exactly the charged Ratenzahlung total', () => {
    const { totals, row } = offerRowFromCart(CARTS['plain cart'], { rabattActive: true });
    // OfferPdfDocument / OfferView derive the financing base via computeDiscounts.
    const discount = computeDiscounts(totals.periodTotal, { rabattActive: true });
    const charged = computePlanPricing(planBasisFromOffer(row));
    expect(toCents(discount.brutto * 1.08)).toBe(toCents(charged.ratenzahlung.totalBrutto));
  });
});

describe('displayed euro strings round to the exact charged cents', () => {
  it('fmt() of every plan amount re-parses to the Stripe unit_amount', () => {
    const { row } = offerRowFromCart(CARTS['discounted second unit'], { rabattActive: true });
    const pricing = computePlanPricing(planBasisFromOffer(row));

    // de-AT groups thousands with U+00A0 — strip everything but digits and
    // the decimal comma, then normalise the comma.
    const parseFmt = (s: string) => Number(s.replace(/[^\d,]/g, '').replace(',', '.'));
    const fieldGroups = pricing as unknown as Record<string, Record<string, number>>;
    for (const fields of Object.values(fieldGroups)) {
      for (const euro of Object.values(fields)) {
        expect(Math.round(parseFmt(fmt(euro)) * 100)).toBe(toCents(euro));
      }
    }
  });
});
