import { describe, expect, it } from 'vitest';
import { isHardwareProduct, searchHardwareProducts } from './hardwareCatalogs';

const p = (name: string, catalog: string, category: string | null = null, active = true) => ({ name, catalog, category, active });

const catalog = [
  p('BESSA Kassa Handel', 'BESSA', 'Kassa – Handel'),
  p('Melzer X3000 Arbeitsplatz', 'MELZER', 'Arbeitsplätze'),
  p('Gastrotouch Modul', 'GASTROTOUCH', 'Module'),
  p('Fiskalisierung Jahrespauschale', 'DIENSTLEISTUNGEN'),
  p('Sunmi L3 Terminal', 'HARDWARE'),
  p('Addimat Schloss', 'HARDWARE', 'Addimat'),
  p('Orderman Sol', 'ORDERMAN'),
  p('RCH Kasse', 'RCH', 'Kassensysteme'),
  p('Sharp MFP BP-51', 'SHARP', 'Sharp MFP'),
  p('Brother Laserdrucker', 'BROTHER', 'Laserdrucker Mono'),
  p('Küchenmonitor 15"', 'KUECHENMONITORE'),
  p('Altes Gerät', 'HARDWARE', null, false), // inactive
];

describe('isHardwareProduct', () => {
  it('accepts hardware catalogs, rejects software/service catalogs', () => {
    expect(isHardwareProduct({ catalog: 'HARDWARE' })).toBe(true);
    expect(isHardwareProduct({ catalog: 'RCH' })).toBe(true);
    expect(isHardwareProduct({ catalog: 'SHARP_ZUBEHOR' })).toBe(true);
    expect(isHardwareProduct({ catalog: 'BESSA' })).toBe(false);
    expect(isHardwareProduct({ catalog: 'MELZER' })).toBe(false);
    expect(isHardwareProduct({ catalog: 'GASTROTOUCH' })).toBe(false);
    expect(isHardwareProduct({ catalog: 'DIENSTLEISTUNGEN' })).toBe(false);
  });
});

describe('searchHardwareProducts', () => {
  it('returns only active hardware when the query is empty', () => {
    const res = searchHardwareProducts(catalog, '');
    const catalogs = new Set(res.map((r) => r.catalog));
    expect(catalogs.has('BESSA')).toBe(false);
    expect(catalogs.has('MELZER')).toBe(false);
    expect(catalogs.has('GASTROTOUCH')).toBe(false);
    expect(catalogs.has('DIENSTLEISTUNGEN')).toBe(false);
    expect(res.some((r) => r.name === 'Altes Gerät')).toBe(false); // inactive dropped
    expect(res.some((r) => r.catalog === 'HARDWARE')).toBe(true);
  });

  it('never surfaces the excluded X3000/Fiskalisierung/Gastrotouch even if the name matches', () => {
    expect(searchHardwareProducts(catalog, 'x3000')).toHaveLength(0);
    expect(searchHardwareProducts(catalog, 'fiskalisierung')).toHaveLength(0);
    expect(searchHardwareProducts(catalog, 'gastrotouch')).toHaveLength(0);
  });

  it('matches on name, catalog and category, sorted by name', () => {
    expect(searchHardwareProducts(catalog, 'sunmi').map((r) => r.name)).toEqual(['Sunmi L3 Terminal']);
    expect(searchHardwareProducts(catalog, 'addimat').map((r) => r.name)).toEqual(['Addimat Schloss']);
    expect(searchHardwareProducts(catalog, 'kassensysteme').map((r) => r.name)).toEqual(['RCH Kasse']);
    const orderman = searchHardwareProducts(catalog, 'orderman');
    expect(orderman).toHaveLength(1);
  });

  it('honours the limit', () => {
    expect(searchHardwareProducts(catalog, '', 2)).toHaveLength(2);
  });
});
