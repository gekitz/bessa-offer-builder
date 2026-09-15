import { describe, it, expect } from 'vitest';
import { AUTO_TERM_RULES, computeAutoTerms } from '../autoTermRules';
import { formatKmRate } from '../../lib/rates';
import { RENTAL_LINE_ID } from '../../lib/rentalOffer';

const CLEANING_TERM =
  'Die Geräte sind vollständig inkl Netzteilen gesäubert zu retounieren. ' +
  'Sollten wir nachträglich eine Reinigung durchführen müssen wird die Reinigungspauschale verrechnet.';

// Derived from the single km-rate source so this test never drifts from the
// actual figure printed on offers.
const TRAVEL_TERM = `Arbeitszeit, Wegzeit und KM-Geld (à ${formatKmRate()}) werden nach tatsächlichem Aufwand verrechnet.`;

describe('AUTO_TERM_RULES', () => {
  it('exposes unique ids', () => {
    const ids = AUTO_TERM_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('always includes Lieferzeit and Zahlungsziel', () => {
    const always = AUTO_TERM_RULES.filter((r) => r.condition({}));
    const texts = always.map((r) => r.text);
    expect(texts).toEqual(
      expect.arrayContaining(['Lieferzeit: 2 Wochen', 'Zahlungsziel: 10 Tage netto Kassa']),
    );
  });
});

describe('computeAutoTerms', () => {
  it('returns the always-on terms for an empty cart', () => {
    expect(computeAutoTerms({})).toEqual([
      'Lieferzeit: 2 Wochen',
      'Zahlungsziel: 10 Tage netto Kassa',
      TRAVEL_TERM,
    ]);
  });

  it('appends the cabling note when a unify-* item is in the cart', () => {
    const cart = { 'unify-switch-8': { qty: 1 } };
    expect(computeAutoTerms(cart)).toContain('Kabel müssen vom Kunden eigenständig verlegt werden');
  });

  it('does not append the cabling note for non-unify items', () => {
    const cart = { 'kassa-pro': { qty: 1 }, '040': { qty: 2 } };
    expect(computeAutoTerms(cart)).not.toContain(
      'Kabel müssen vom Kunden eigenständig verlegt werden',
    );
  });

  it('appends the cleaning condition when the rental line is in the cart', () => {
    const cart = { [RENTAL_LINE_ID]: { qty: 1 } };
    expect(computeAutoTerms(cart)).toContain(CLEANING_TERM);
  });

  it('does not append the cleaning condition for a non-rental cart', () => {
    expect(computeAutoTerms({ 'kassa-pro': { qty: 1 } })).not.toContain(CLEANING_TERM);
  });

  it('preserves insertion order from AUTO_TERM_RULES', () => {
    const cart = { 'unify-switch-8': { qty: 1 } };
    expect(computeAutoTerms(cart)).toEqual([
      'Lieferzeit: 2 Wochen',
      'Zahlungsziel: 10 Tage netto Kassa',
      TRAVEL_TERM,
      'Kabel müssen vom Kunden eigenständig verlegt werden',
    ]);
  });

  it('keeps the PoS defaults when offerType is not brother even if lieferung/zahlungsziel are passed', () => {
    expect(
      computeAutoTerms({}, { offerType: 'pos', lieferung: 'ruecksprache', zahlungsziel: 'wie vereinbart' }),
    ).toEqual([
      'Lieferzeit: 2 Wochen',
      'Zahlungsziel: 10 Tage netto Kassa',
      TRAVEL_TERM,
    ]);
  });

  describe('Brother offers', () => {
    it('defaults to lagernd + netto Kassa when no picks are provided', () => {
      expect(computeAutoTerms({}, { offerType: 'brother' })).toEqual([
        'Lieferzeit: lagernd',
        'Zahlungsziel: netto Kassa',
        TRAVEL_TERM,
      ]);
    });

    it('reflects "nach Rücksprache" when lieferung is ruecksprache', () => {
      const terms = computeAutoTerms({}, { offerType: 'brother', lieferung: 'ruecksprache' });
      expect(terms).toContain('Lieferzeit: nach Rücksprache');
    });

    it('uses the edited Zahlungsziel verbatim', () => {
      const terms = computeAutoTerms({}, { offerType: 'brother', zahlungsziel: 'wie vereinbart' });
      expect(terms).toContain('Zahlungsziel: wie vereinbart');
    });

    it('falls back to the default Zahlungsziel when the field is blank', () => {
      const terms = computeAutoTerms({}, { offerType: 'brother', zahlungsziel: '   ' });
      expect(terms).toContain('Zahlungsziel: netto Kassa');
    });
  });
});
