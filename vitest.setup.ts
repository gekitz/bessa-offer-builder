import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { SEED_CATALOGS } from './src/features/offers/data/catalogSeed';
import * as catalog from './src/features/offers/data/catalogs';

// The app ships an EMPTY product catalog and hydrates it from the DB at
// runtime (catalogLoader). Tests import the live arrays (ALL, SHARP, …) as
// fixtures, so seed them from the test-only catalogSeed before any test runs —
// mirroring a completed hydrate. catalogLoader.test.ts still overwrites this by
// hydrating from its mocked DB.
const catalogIds = catalog.CATALOG_IDS as Set<string>;
for (const [name, items] of Object.entries(SEED_CATALOGS)) {
  const arr = (catalog as unknown as Record<string, unknown[]>)[name];
  arr.length = 0;
  arr.push(...items);
}
for (const key of Object.keys(catalog.ALL)) delete catalog.ALL[key];
catalogIds.clear();
for (const items of Object.values(SEED_CATALOGS)) {
  for (const it of items) {
    catalog.ALL[it.id] = it;
    catalogIds.add(it.id);
  }
}

// Unmount all React components and clear DOM after every test
afterEach(() => {
  cleanup();
});
