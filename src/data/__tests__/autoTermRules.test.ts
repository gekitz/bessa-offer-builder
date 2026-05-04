import { describe, it, expect } from 'vitest';
import { AUTO_TERM_RULES, computeAutoTerms } from '../autoTermRules';

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

  it('preserves insertion order from AUTO_TERM_RULES', () => {
    const cart = { 'unify-switch-8': { qty: 1 } };
    expect(computeAutoTerms(cart)).toEqual([
      'Lieferzeit: 2 Wochen',
      'Zahlungsziel: 10 Tage netto Kassa',
      'Kabel müssen vom Kunden eigenständig verlegt werden',
    ]);
  });
});
