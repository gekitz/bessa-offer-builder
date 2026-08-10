import type { Item, Catalog } from '../../../lib/pricing';

export const COMPANY_DEFAULT = {
  name: 'KITZ Computer + Office GmbH',
  address1: 'Rosentaler Straße 1, A-9020 Klagenfurt',
  address2: 'Johann-Offner-Straße 17, A-9400 Wolfsberg',
  phone1: '+43 (0) 463 504454',
  phone2: '+43 (0) 4352 4176',
  email: 'officekl@kitz.co.at',
  website: 'www.kitz.co.at',
  logo: 'https://www.kitz.co.at/wp-content/uploads/2019/12/kitz-logo-2020-300x138.png',
} as const;

// The product catalog lives in the `products` table — the DB is the single
// source of truth. These arrays and the `ALL` lookup ship EMPTY and are filled
// in place from the DB by catalogLoader.hydrateCatalog() on app start (it
// mutates these exact references so consumers need no changes). If the DB can't
// be loaded the app surfaces an error instead of falling back to stale data, so
// there is intentionally no hardcoded product data here.
//
// Edit products via the Produkte admin UI or a migration against `products`.
// A hardcoded copy of the catalog is kept in catalogSeed.ts for TESTS and the
// seed generator only — it is never imported by runtime code.
export const BESSA: Item[] = [];
export const MELZER: Item[] = [];
export const GASTROTOUCH: Item[] = [];
export const RCH: Item[] = [];
export const HARDWARE: Item[] = [];
export const UNIFY: Item[] = [];
export const DRUCKER: Item[] = [];
export const KUECHENMONITORE: Item[] = [];
export const KUECHENMONITORE_SUNMI: Item[] = [];
export const KIOSK: Item[] = [];
export const ORDERMAN: Item[] = [];
export const DIENSTLEISTUNGEN: Item[] = [];
export const SHARP: Item[] = [];
export const SHARP_ZUBEHOR: Item[] = [];
export const BROTHER: Item[] = [];

// Combined id → Item lookup. Rebuilt in place by catalogLoader on hydrate.
// Empty until the DB has loaded; custom (user-added) items are never here.
export const ALL: Catalog = {};

export const CATALOG_IDS: ReadonlySet<string> = new Set<string>();

export function isCustomItem(id: string): boolean {
  return !CATALOG_IDS.has(id);
}
