import { describe, it, expect, vi } from 'vitest';

// Supabase mock whose products query returns an error, so we can assert the
// loader records a load error (no hardcoded fallback) and still marks itself
// ready so the UI can show the error screen instead of hanging.
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: null,
            error: { message: 'network down' },
          }),
      }),
    }),
  },
}));

import { hydrateCatalog, isCatalogReady, getCatalogError } from '../catalogLoader';

describe('catalogLoader error handling', () => {
  it('records the DB error, returns false, and still flips ready', async () => {
    const ok = await hydrateCatalog();

    expect(ok).toBe(false);
    expect(isCatalogReady()).toBe(true);
    expect(getCatalogError()).toBe('network down');
  });
});
