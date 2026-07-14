import { describe, it, expect } from 'vitest';
import {
  BESSA,
  MELZER,
  GASTROTOUCH,
  GASTROTOUCH_UPDATE_VERSION,
  RCH,
  HARDWARE,
  UNIFY,
  DRUCKER,
  KUECHENMONITORE,
  KUECHENMONITORE_SUNMI,
  KIOSK,
  ORDERMAN,
  DIENSTLEISTUNGEN,
  SHARP,
  SHARP_ZUBEHOR,
  BROTHER,
  ALL,
  CATALOG_IDS,
  isCustomItem,
} from '../catalogs';

const ALL_PRODUCT_LISTS = [
  ['BESSA', BESSA],
  ['MELZER', MELZER],
  ['GASTROTOUCH', GASTROTOUCH],
  ['RCH', RCH],
  ['HARDWARE', HARDWARE],
  ['UNIFY', UNIFY],
  ['DRUCKER', DRUCKER],
  ['KUECHENMONITORE', KUECHENMONITORE],
  ['KUECHENMONITORE_SUNMI', KUECHENMONITORE_SUNMI],
  ['KIOSK', KIOSK],
  ['ORDERMAN', ORDERMAN],
  ['DIENSTLEISTUNGEN', DIENSTLEISTUNGEN],
  ['SHARP', SHARP],
  ['SHARP_ZUBEHOR', SHARP_ZUBEHOR],
  ['BROTHER', BROTHER],
] as const;

describe('catalogs', () => {
  it('every product id is unique across the entire catalog', () => {
    const seen = new Map<string, string>();
    for (const [name, list] of ALL_PRODUCT_LISTS) {
      for (const item of list) {
        const previous = seen.get(item.id);
        if (previous) {
          throw new Error(
            `Duplicate product id "${item.id}" in ${name} (also seen in ${previous}). ` +
              `Duplicate ids silently overwrite each other in ALL.`,
          );
        }
        seen.set(item.id, name);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('ALL contains every product (count matches sum of catalogs)', () => {
    const expected = ALL_PRODUCT_LISTS.reduce((n, [, list]) => n + list.length, 0);
    expect(Object.keys(ALL)).toHaveLength(expected);
  });

  it('CATALOG_IDS mirrors ALL keys', () => {
    expect(CATALOG_IDS.size).toBe(Object.keys(ALL).length);
    for (const id of Object.keys(ALL)) {
      expect(CATALOG_IDS.has(id)).toBe(true);
    }
  });

  it('isCustomItem returns true for unknown ids and false for catalog ids', () => {
    const firstCatalogId = BESSA[0]!.id;
    expect(isCustomItem(firstCatalogId)).toBe(false);
    expect(isCustomItem('definitely-not-in-catalog')).toBe(true);
  });
});

describe('Sharp MFP catalog', () => {
  it('every Sharp device is t=copier with complete pricing data', () => {
    expect(SHARP.length).toBe(12);
    for (const d of SHARP) {
      expect(d.t).toBe('copier');
      expect(d.vk).toBeGreaterThan(0);
      expect(d.uhg).toBeGreaterThan(0);
      expect(d.install).toBeGreaterThan(0);
      expect(d.pageBw).toBeGreaterThan(0);
      expect(d.pageColor).toBeGreaterThan(0);
      expect(d.pageScan).toBe(0.0019);
      // Bundled console + inner output shown as €0 lines.
      expect(d.includedOptions?.length).toBe(2);
      expect(d.description).toContain(d.code);
    }
  });

  it('every Sharp accessory is a one-time item with a positive price', () => {
    expect(SHARP_ZUBEHOR.length).toBe(9);
    for (const a of SHARP_ZUBEHOR) {
      expect(a.t).toBe('o');
      expect(a.price).toBeGreaterThan(0);
      // Accessories carry no copier-only fields (leasing derives from VK).
      expect(a.vk).toBeUndefined();
    }
  });
});

describe('Brother catalog', () => {
  it('has all 11 devices as one-time items with a positive net price', () => {
    expect(BROTHER.length).toBe(11);
    for (const d of BROTHER) {
      expect(d.t).toBe('o');
      expect(d.price).toBeGreaterThan(0);
      // Brother devices are plain hardware — no copier-only leasing fields.
      expect(d.vk).toBeUndefined();
      expect(d.name.startsWith('Brother ')).toBe(true);
    }
  });

  it('stores the two inkjet MFPs at their net price (list gross ÷ 1,2)', () => {
    const byId = (id: string) => BROTHER.find((i) => i.id === id)!;
    // 279,- inkl. MWST → 232,50 net; 299,- inkl. MWST → ~249,17 net.
    expect(byId('brother-mfc-j4350dw').price! * 1.2).toBeCloseTo(279, 2);
    expect(byId('brother-mfc-j4550dw').price! * 1.2).toBeCloseTo(299, 2);
  });

  it('gives every device a non-empty spec description', () => {
    for (const d of BROTHER) {
      expect(d.description).toBeTruthy();
      expect(d.description!.length).toBeGreaterThan(10);
    }
  });

  it('flags every "Nur Firmenkunden" device and leaves the two consumer inkjets unflagged', () => {
    const consumer = ['brother-mfc-j4350dw', 'brother-mfc-j4550dw'];
    for (const d of BROTHER) {
      if (consumer.includes(d.id)) {
        expect(d.info).toBeUndefined();
      } else {
        expect(d.info).toBe('Nur Firmenkunden');
      }
    }
  });
});

describe('GastroTouch catalog', () => {
  it('has all 4 products across 3 update-year tiers (12 one-time SKUs)', () => {
    expect(GASTROTOUCH.length).toBe(12);
    for (const item of GASTROTOUCH) {
      expect(item.t).toBe('o');
      expect(item.price).toBeGreaterThan(0);
      expect(item.code).toMatch(/^160671\d\d$/);
    }
  });

  it('applies the correct surcharge: +0% base, +50% for 2024, +100% for 2023 and older', () => {
    // Normalpreis (letztes Update innerhalb eines Jahres) per Artikel-Nr.
    const base: Record<string, number> = {
      '16067191': 139.90, // Einzelplatz
      '16067192': 236.80, // Mehrplatz
      '16067193': 70.30, // Je weiterer Arbeitsplatz
      '16067194': 22.20, // Je Orderman
    };
    const byId = (id: string) => GASTROTOUCH.find((i) => i.id === id)!;
    for (const [code, normal] of Object.entries(base)) {
      expect(byId(`gt-${code}-2025`).price).toBeCloseTo(normal, 2);
      expect(byId(`gt-${code}-2024`).price).toBeCloseTo(normal * 1.5, 2);
      expect(byId(`gt-${code}-2023`).price).toBeCloseTo(normal * 2, 2);
    }
  });

  it('appends the target update version to every product name', () => {
    const suffix = `(Update ${GASTROTOUCH_UPDATE_VERSION})`;
    for (const item of GASTROTOUCH) {
      expect(item.name.endsWith(suffix)).toBe(true);
    }
  });

  it('groups each update-year tier into its own category', () => {
    const cats = new Set(GASTROTOUCH.map((i) => i.cat));
    expect(cats).toEqual(
      new Set([
        'Update – Letztes Update 2025',
        'Update – Letztes Update 2024 (+50%)',
        'Update – 2023 und älter (+100%)',
      ]),
    );
  });
});
