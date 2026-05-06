import { describe, expect, it } from 'vitest';
import {
  filterOffersBySearch,
  offerMatchesSearch,
  type SearchableOffer,
} from '../offerSearch';

function offer(p: Partial<SearchableOffer>): SearchableOffer {
  return {
    customer_name: null,
    customer_company: null,
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    creator_name: null,
    briefing: null,
    mesonic_customer_id: null,
    ...p,
  };
}

describe('filterOffersBySearch', () => {
  it('returns the input unchanged when the query is empty', () => {
    const list = [offer({ customer_company: 'Acme' }), offer({ customer_company: 'Beta' })];
    expect(filterOffersBySearch(list, '')).toBe(list);
    expect(filterOffersBySearch(list, '   ')).toBe(list);
  });

  it('matches on customer_company case-insensitively', () => {
    const list = [
      offer({ customer_company: 'Acme GmbH' }),
      offer({ customer_company: 'Beta AG' }),
    ];
    expect(filterOffersBySearch(list, 'acme').map((o) => o.customer_company)).toEqual(['Acme GmbH']);
    expect(filterOffersBySearch(list, 'ACME').map((o) => o.customer_company)).toEqual(['Acme GmbH']);
  });

  it('matches on customer_name', () => {
    const list = [
      offer({ customer_name: 'Maria Müller' }),
      offer({ customer_name: 'Hans Bauer' }),
    ];
    expect(filterOffersBySearch(list, 'müller')).toHaveLength(1);
  });

  it('matches on customer_email', () => {
    const list = [offer({ customer_email: 'office@acme.at' })];
    expect(filterOffersBySearch(list, 'acme.at')).toHaveLength(1);
  });

  it('matches on customer_address (handy for "Kunde aus Klagenfurt")', () => {
    const list = [
      offer({ customer_company: 'Praxis Dr. Müller', customer_address: 'Hauptplatz 1, 9020 Klagenfurt' }),
      offer({ customer_company: 'Bäckerei Anna', customer_address: 'Marktstr. 5, 9400 Wolfsberg' }),
    ];
    expect(filterOffersBySearch(list, 'klagenfurt').map((o) => o.customer_company))
      .toEqual(['Praxis Dr. Müller']);
  });

  it('matches on briefing (the "what the customer wanted" memory anchor)', () => {
    const list = [
      offer({ customer_company: 'Acme', briefing: 'Eröffnung Juli, 3 Kassen' }),
      offer({ customer_company: 'Beta', briefing: 'Bestandsupgrade auf RCH' }),
    ];
    expect(filterOffersBySearch(list, 'eröffnung').map((o) => o.customer_company)).toEqual(['Acme']);
    expect(filterOffersBySearch(list, 'rch').map((o) => o.customer_company)).toEqual(['Beta']);
  });

  it('matches on creator_name', () => {
    const list = [
      offer({ customer_company: 'Acme', creator_name: 'Georg Kitz' }),
      offer({ customer_company: 'Beta', creator_name: 'Helmut Bauer' }),
    ];
    expect(filterOffersBySearch(list, 'helmut').map((o) => o.customer_company)).toEqual(['Beta']);
  });

  it('matches on mesonic_customer_id (string or number)', () => {
    const list = [
      offer({ customer_company: 'Acme', mesonic_customer_id: 12345 }),
      offer({ customer_company: 'Beta', mesonic_customer_id: '67890' }),
    ];
    expect(filterOffersBySearch(list, '12345').map((o) => o.customer_company)).toEqual(['Acme']);
    expect(filterOffersBySearch(list, '67890').map((o) => o.customer_company)).toEqual(['Beta']);
  });

  it('multi-word queries AND across fields ("müller klagenfurt")', () => {
    const list = [
      offer({ customer_name: 'Maria Müller', customer_address: '9020 Klagenfurt' }),
      offer({ customer_name: 'Hans Müller',  customer_address: '9400 Wolfsberg' }),
      offer({ customer_name: 'Anna Bauer',   customer_address: '9020 Klagenfurt' }),
    ];
    const r = filterOffersBySearch(list, 'müller klagenfurt');
    expect(r).toHaveLength(1);
    expect(r[0].customer_name).toBe('Maria Müller');
  });

  it('returns an empty array when nothing matches', () => {
    const list = [offer({ customer_company: 'Acme' })];
    expect(filterOffersBySearch(list, 'nichts hier')).toEqual([]);
  });

  it('ignores null fields cleanly (no crashes on sparse rows)', () => {
    const list = [offer({ customer_company: null, customer_name: 'Just A Name' })];
    expect(filterOffersBySearch(list, 'just')).toHaveLength(1);
  });

  it('normalizes extra whitespace in the query', () => {
    const list = [
      offer({ customer_name: 'Maria Müller', customer_address: '9020 Klagenfurt' }),
    ];
    expect(filterOffersBySearch(list, '  müller   klagenfurt  ')).toHaveLength(1);
  });
});

describe('offerMatchesSearch', () => {
  it('returns true on empty query', () => {
    expect(offerMatchesSearch(offer({ customer_company: 'Acme' }), '')).toBe(true);
  });

  it('returns true when all tokens match across fields', () => {
    const o = offer({ customer_company: 'Praxis Müller', customer_address: '9020 Klagenfurt' });
    expect(offerMatchesSearch(o, 'müller klagenfurt')).toBe(true);
    expect(offerMatchesSearch(o, 'praxis müller')).toBe(true);
  });

  it('returns false if any token fails to match', () => {
    const o = offer({ customer_company: 'Praxis Müller', customer_address: '9020 Klagenfurt' });
    expect(offerMatchesSearch(o, 'müller wolfsberg')).toBe(false);
  });
});
