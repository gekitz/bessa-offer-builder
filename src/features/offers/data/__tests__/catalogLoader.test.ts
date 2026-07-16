import { describe, it, expect, vi } from 'vitest';

// Minimal supabase mock: products query resolves one HARDWARE row so we can
// assert the loader swaps DB data into the in-memory catalog and flips ready.
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              {
                id: 'hw-test-1',
                code: null,
                name: 'Test HW',
                catalog: 'HARDWARE',
                category: null,
                kind: 'o',
                note: null,
                info: 'DB description',
                pricing: { price: 42 },
                attrs: {},
                auto_add: null,
                sort: 0,
              },
            ],
            error: null,
          }),
      }),
    }),
  },
}));

import { hydrateCatalog, isCatalogReady, getCatalogVersion } from '../catalogLoader';
import { ALL, HARDWARE } from '../catalogs';

describe('catalogLoader readiness', () => {
  it('is not ready until the first hydrate attempt settles', () => {
    expect(isCatalogReady()).toBe(false);
  });

  it('hydrates the catalog from the DB, swaps it in, and marks it ready', async () => {
    const before = getCatalogVersion();

    const ok = await hydrateCatalog();

    expect(ok).toBe(true);
    expect(isCatalogReady()).toBe(true);
    expect(getCatalogVersion()).toBe(before + 1);
    // DB row is now in the flat lookup, with the DB `info`...
    expect(ALL['hw-test-1']?.info).toBe('DB description');
    // ...and the exported catalog array was replaced in place (same ref).
    expect(HARDWARE.some((i) => i.id === 'hw-test-1')).toBe(true);
  });
});
