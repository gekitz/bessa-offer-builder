import { describe, it, expect } from 'vitest';
import {
  BESSA,
  MELZER,
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
  TEAM,
  ALL,
  CATALOG_IDS,
  isCustomItem,
} from '../catalogs';

const ALL_PRODUCT_LISTS = [
  ['BESSA', BESSA],
  ['MELZER', MELZER],
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

  it('every team member id is unique', () => {
    const ids = TEAM.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
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
