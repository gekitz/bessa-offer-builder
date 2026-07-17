import { describe, it, expect } from 'vitest';
import {
  buildRentalOffer,
  softwareUnitPrice,
  rentalTerm,
  rentalLineFields,
  emptyRentalState,
  RENTAL_TERMS,
  RENTAL_HARDWARE,
  RENTAL_SERVICES,
  RENTAL_SOFTWARE_IDS,
  RENTAL_LINE_ID,
  type RentalState,
  type RentalTermKey,
} from './rentalOffer';
import { ALL } from '../features/offers/data/catalogs';
import { computeTotals, type Cart } from './totals';
import { buildCopierOffer } from './copierOffer';

// bessa ids used across the tests (see RENTAL_SOFTWARE_IDS).
const MOBILE_KASSA = '3942f638-1abb-4be9-85a5-d3bf442aa3d8'; // code 100, p:{y:19,s:25,m:30,e:38}
const KARTENZAHLUNG = '65e7e1a8-23b3-444f-8b18-c5ca7312cf28'; // code 040, p:{y:12,s:15,m:18,e:24}
const STANDALONE_MOBILE = 'standalone-mobile'; // Einstand 259

// The scenario captured in the source spreadsheet:
//   Hardware:  Standalone Mobile Kasse ×2 (Einstand 259) → Summe Hardware 518
//   Services:  Fiskalisierung ×2 (190), Arbeitszeit ×2 (120) → 620
//   Software:  Mobile Kasse ×2, Kreditkartenmodul ×2
function sheetState(term: RentalTermKey): RentalState {
  return {
    term,
    hardware: { [STANDALONE_MOBILE]: 2 },
    services: { fiskalisierung: 2, arbeitszeit: 2 },
    software: { [MOBILE_KASSA]: 2, [KARTENZAHLUNG]: 2 },
  };
}

describe('rental catalog integrity', () => {
  it('every software id resolves to a known bessa item', () => {
    for (const id of RENTAL_SOFTWARE_IDS) {
      expect(ALL[id], `software id ${id}`).toBeDefined();
    }
  });

  it('has the three spreadsheet timespans with the documented break-even factors', () => {
    expect(RENTAL_TERMS.map((t) => t.key)).toEqual(['1-3d', '2mo', '6mo']);
    expect(RENTAL_TERMS.map((t) => t.breakEven)).toEqual([5, 2, 1]);
    expect(RENTAL_TERMS.map((t) => t.months)).toEqual([1, 2, 6]);
  });

  it('hardware Einstand table matches the sheet', () => {
    const byId = Object.fromEntries(RENTAL_HARDWARE.map((h) => [h.id, h.einstand]));
    expect(byId['hauptkasse']).toBe(470);
    expect(byId['standalone-mobile']).toBe(259);
    expect(byId['kuechenmonitor']).toBe(1190);
  });

  it('services are fixed prices', () => {
    const byId = Object.fromEntries(RENTAL_SERVICES.map((s) => [s.id, s.price]));
    expect(byId['fiskalisierung']).toBe(190);
    expect(byId['arbeitszeit']).toBe(120);
  });
});

describe('software pricing derives from the bessa tiers', () => {
  it('1–3 Tage uses the flat event price (×1)', () => {
    const term = rentalTerm('1-3d');
    expect(softwareUnitPrice(MOBILE_KASSA, term)).toBe(38); // p.e
    expect(softwareUnitPrice(KARTENZAHLUNG, term)).toBe(24); // p.e
  });

  it('2 Monate uses the 2-Monats price × 2', () => {
    const term = rentalTerm('2mo');
    expect(softwareUnitPrice(MOBILE_KASSA, term)).toBe(60); // 30 × 2
    expect(softwareUnitPrice(KARTENZAHLUNG, term)).toBe(36); // 18 × 2
  });

  it('6 Monate uses the 6-Monats price × 6', () => {
    const term = rentalTerm('6mo');
    expect(softwareUnitPrice(MOBILE_KASSA, term)).toBe(150); // 25 × 6
    expect(softwareUnitPrice(KARTENZAHLUNG, term)).toBe(90); // 15 × 6
  });

  it('tracks the live catalog price rather than a hard-coded number', () => {
    // Sanity: the unit price is exactly the catalog tier price × months.
    const item = ALL[MOBILE_KASSA]!;
    expect(softwareUnitPrice(MOBILE_KASSA, rentalTerm('6mo'))).toBe(item.p!.s! * 6);
  });
});

describe('buildRentalOffer reproduces the spreadsheet totals', () => {
  const cases: Array<{ term: RentalTermKey; netto: number; brutto: number }> = [
    { term: '1-3d', netto: 847.6, brutto: 1017.12 },
    { term: '2mo', netto: 1071, brutto: 1285.2 },
    { term: '6mo', netto: 1618, brutto: 1941.6 },
  ];

  for (const c of cases) {
    it(`${c.term} → Netto ${c.netto} / Brutto ${c.brutto}`, () => {
      const r = buildRentalOffer(sheetState(c.term));
      expect(r.netto).toBeCloseTo(c.netto, 2);
      expect(r.brutto).toBeCloseTo(c.brutto, 2);
    });
  }

  it('pools hardware then divides by the break-even factor', () => {
    expect(buildRentalOffer(sheetState('1-3d')).hardwareSum).toBe(518);
    expect(buildRentalOffer(sheetState('1-3d')).hardwareRental).toBeCloseTo(103.6, 2); // 518 / 5
    expect(buildRentalOffer(sheetState('2mo')).hardwareRental).toBe(259); // 518 / 2
    expect(buildRentalOffer(sheetState('6mo')).hardwareRental).toBe(518); // 518 / 1
  });

  it('services are the same across every timespan', () => {
    expect(buildRentalOffer(sheetState('1-3d')).servicesSum).toBe(620);
    expect(buildRentalOffer(sheetState('2mo')).servicesSum).toBe(620);
    expect(buildRentalOffer(sheetState('6mo')).servicesSum).toBe(620);
  });

  it('software totals scale with the timespan', () => {
    expect(buildRentalOffer(sheetState('1-3d')).softwareSum).toBe(124); // 76 + 48
    expect(buildRentalOffer(sheetState('2mo')).softwareSum).toBe(192); // 120 + 72
    expect(buildRentalOffer(sheetState('6mo')).softwareSum).toBe(480); // 300 + 180
  });

  it('only includes lines with a quantity', () => {
    const r = buildRentalOffer(sheetState('6mo'));
    expect(r.hardwareLines).toHaveLength(1);
    expect(r.serviceLines).toHaveLength(2);
    expect(r.softwareLines).toHaveLength(2);
    expect(r.hardwareLines[0]!.id).toBe(STANDALONE_MOBILE);
  });
});

describe('rentalLineFields — the single offer line', () => {
  it('returns null for an empty rental', () => {
    expect(rentalLineFields(emptyRentalState())).toBeNull();
  });

  it('names the line with the timespan and prices it at the netto', () => {
    const line = rentalLineFields(sheetState('6mo'))!;
    expect(line.id).toBe(RENTAL_LINE_ID);
    expect(line.name).toBe('Leihstellung POS, Laufzeit 6 Monate');
    expect(line.price).toBeCloseTo(1618, 2);
  });

  it('enumerates every item grouped by bucket in the description', () => {
    const line = rentalLineFields(sheetState('6mo'))!;
    expect(line.description).toBe(
      [
        'Hardware:',
        '2× Standalone Mobile Kasse',
        'Dienstleistung:',
        '2× Fiskalisierung pro Hauptkasse',
        '2× Arbeitszeit',
        'Software:',
        '2× Mobile Kassa',
        '2× Anbindung Kartenzahlungsterminal',
      ].join('\n'),
    );
  });
});

describe('rental line drives the offer totals (regression)', () => {
  // Bug: the "Leihstellung POS" line showed one price while the EINMALIGE
  // KOSTEN summary showed another. Cause: the net was stashed only on the
  // mutable ALL entry, but the totals memo is keyed on `cart`, so it never
  // recomputed when the calculator changed. The fix carries the net on the
  // cart line (priceOverride) so line + totals stay in sync. Here we set a
  // deliberately WRONG price on the ALL entry so the test fails if the totals
  // ever read it instead of the price carried on the cart line.
  const terms: RentalTermKey[] = ['1-3d', '2mo', '6mo'];
  for (const term of terms) {
    it(`${term}: summary once-total equals the rental line price`, () => {
      const fields = rentalLineFields(sheetState(term))!;
      ALL[RENTAL_LINE_ID] = { id: RENTAL_LINE_ID, name: fields.name, price: 999999, t: 'o' } as never;
      const cart: Cart = {
        [RENTAL_LINE_ID]: { qty: 1, discountQty: 0, priceOverride: fields.price },
      };
      try {
        expect(computeTotals(cart, ALL).once).toBeCloseTo(fields.price, 2);
      } finally {
        delete ALL[RENTAL_LINE_ID];
      }
    });
  }
});

describe('email total matches the PDF total (regression)', () => {
  // The PDF renders `totals.once`; the email's summary box shows the DB column
  // `total_once`, which is saved as `persistTotals.once`. For a rental (never a
  // copier offer) persistTotals === totals, so both must be the same number.
  // This models both sources — the real persistTotals branch + copier
  // detection — so it fails if a rental ever diverges the two.
  const terms: RentalTermKey[] = ['1-3d', '2mo', '6mo'];
  for (const term of terms) {
    it(`${term}: email total_once equals PDF totals.once equals the line net`, () => {
      const fields = rentalLineFields(sheetState(term))!;
      ALL[RENTAL_LINE_ID] = { id: RENTAL_LINE_ID, name: fields.name, price: fields.price, t: 'o' } as never;
      const cart: Cart = {
        [RENTAL_LINE_ID]: { qty: 1, discountQty: 0, priceOverride: fields.price },
      };
      try {
        const totals = computeTotals(cart, ALL); // → the PDF's totals prop
        const copierOffer = buildCopierOffer(cart, ALL);
        // Mirrors OfferBuilderPage.persistTotals, whose `.once` is saved as the
        // DB total_once that the send-offer email summary renders.
        const persistTotals = copierOffer.isCopierOffer ? { ...totals } : totals;
        const emailTotalOnce = persistTotals.once;

        expect(copierOffer.isCopierOffer).toBe(false);
        expect(emailTotalOnce).toBeCloseTo(totals.once, 2); // email == PDF
        expect(emailTotalOnce).toBeCloseTo(fields.price, 2); // == shown line net
      } finally {
        delete ALL[RENTAL_LINE_ID];
      }
    });
  }
});

describe('edge cases', () => {
  it('an empty rental is all zeros', () => {
    const r = buildRentalOffer(emptyRentalState());
    expect(r.hardwareSum).toBe(0);
    expect(r.hardwareRental).toBe(0);
    expect(r.netto).toBe(0);
    expect(r.brutto).toBe(0);
    expect(r.hardwareLines).toHaveLength(0);
  });

  it('brutto is always netto × 1.2', () => {
    const r = buildRentalOffer(sheetState('6mo'));
    expect(r.brutto).toBeCloseTo(r.netto * 1.2, 2);
  });
});
