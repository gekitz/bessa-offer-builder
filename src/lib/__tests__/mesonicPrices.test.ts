import { describe, it, expect, vi } from 'vitest';

// mesonicApi.js imports ./supabase at module load; stub it so the import graph
// resolves. baseArticleNumber/pickPreis are pure.
vi.mock('../supabase', () => ({ supabase: {} }));

import { baseArticleNumber, pickPreis, STANDARD_PREISLISTE } from '../mesonicApi';

describe('baseArticleNumber', () => {
  it('strips the KL/WO Ausprägung — Preise hängen am Basis-Artikel', () => {
    expect(baseArticleNumber('16030051KL')).toBe('16030051');
    expect(baseArticleNumber('16030051WO')).toBe('16030051');
    expect(baseArticleNumber('16030051kl')).toBe('16030051'); // case-insensitiv
    expect(baseArticleNumber('  16030051WO ')).toBe('16030051'); // trim
  });
  it('lässt eine reine Basis-Artikelnummer unverändert', () => {
    expect(baseArticleNumber('16030051')).toBe('16030051');
    expect(baseArticleNumber('300000')).toBe('300000');
  });
});

describe('pickPreis', () => {
  // Echte WEBArtikelPreise-Antwort für Artikel 16030051 (live verifiziert).
  const records = [
    { ArtikelnummerUntergruppe: '16030051', Preisart: '11', Preisliste: '1', Preis: '445.00' },
    { ArtikelnummerUntergruppe: '16030051', Preisart: '1', Preisliste: '1', Preis: '890.00' },
    { ArtikelnummerUntergruppe: '16030051', Preisart: '1', Preisliste: '5', Preis: '1068.00' },
    { ArtikelnummerUntergruppe: '16030051', Preisart: '1', Preisliste: '13', Preis: '890.00' },
    { ArtikelnummerUntergruppe: '16030051', Preisart: '1', Preisliste: '14', Preis: '1068.00' },
    { ArtikelnummerUntergruppe: '16030051', Preisart: '13', Preisliste: '13', Preis: '445.00' },
  ];

  it('nimmt Preisliste 13 als Standard-VK (Default)', () => {
    expect(STANDARD_PREISLISTE).toBe('13');
    expect(pickPreis(records)).toBe(890); // Preisart 1 aus Preisliste 13, nicht 445
  });

  it('bevorzugt Preisart 1 wenn die Preisliste mehrere Preisarten hat', () => {
    expect(pickPreis(records, { preisliste: '13', preisart: '1' })).toBe(890);
    expect(pickPreis(records, { preisliste: '13', preisart: '13' })).toBe(445);
  });

  it('fällt auf die erste Zeile der Liste zurück wenn Preisart fehlt', () => {
    expect(pickPreis(records, { preisliste: '5', preisart: '999' })).toBe(1068);
  });

  it('liefert null wenn die Preisliste nicht existiert', () => {
    expect(pickPreis(records, { preisliste: '99' })).toBeNull();
    expect(pickPreis([])).toBeNull();
    expect(pickPreis(undefined)).toBeNull();
  });

  it('parst Komma-Dezimalzahlen', () => {
    expect(pickPreis([{ Preisart: '1', Preisliste: '13', Preis: '12,50' }])).toBe(12.5);
  });
});
