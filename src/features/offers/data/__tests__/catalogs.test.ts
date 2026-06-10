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
