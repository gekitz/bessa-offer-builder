import { describe, it, expect } from 'vitest';
import { normaliseArticle } from '../mesonicArticles';

describe('normaliseArticle', () => {
  it('reads the tidy field names', () => {
    expect(normaliseArticle({ Artikelnummer: '16030051', Artikelbezeichnung: 'Sunmi L3', Artikelgruppe: 'Hardware' }))
      .toMatchObject({ number: '16030051', name: 'Sunmi L3', group: 'Hardware' });
  });

  it('falls back through the raw T024 aliases (underscore + dotted)', () => {
    expect(normaliseArticle({ 'T024_C001': '17008108', 'T024.C003': 'Switch 8-Port' }))
      .toMatchObject({ number: '17008108', name: 'Switch 8-Port' });
  });

  it('returns null when there is no article number', () => {
    expect(normaliseArticle({ Bezeichnung: 'Nur Text' })).toBeNull();
  });

  it('uses the number as the name when no description is present', () => {
    expect(normaliseArticle({ Artikelnummer: '99' })).toMatchObject({ number: '99', name: '99' });
  });

  it('parses a hinted price with comma decimals', () => {
    expect(normaliseArticle({ Artikelnummer: '1', Preis: '12,50' })?.hintedPrice).toBe(12.5);
  });
});
