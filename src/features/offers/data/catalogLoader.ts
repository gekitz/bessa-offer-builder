// Phase 2 — DB read path for the product catalog.
//
// The hardcoded arrays in catalogs.ts stay as the INITIAL value + offline
// fallback (so synchronous consumers + the anon accept page keep working).
// In the authenticated app we hydrate from the `products` table by
// mutating those exported arrays / ALL / CATALOG_IDS in place, then bump a
// version so subscribers (OfferBuilderPage) re-render with DB data.
//
// Keeping the same `Item` shape + same exports means no consumer changes.

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Item } from '../../../lib/pricing';
import {
  ALL, CATALOG_IDS,
  BESSA, MELZER, GASTROTOUCH, RCH, HARDWARE, UNIFY, DRUCKER,
  KUECHENMONITORE, KUECHENMONITORE_SUNMI, KIOSK, ORDERMAN,
  DIENSTLEISTUNGEN, SHARP, SHARP_ZUBEHOR, BROTHER,
} from './catalogs';

// Name → the live exported array we mutate in place.
const CATALOG_ARRAYS: Record<string, Item[]> = {
  BESSA, MELZER, GASTROTOUCH, RCH, HARDWARE, UNIFY, DRUCKER,
  KUECHENMONITORE, KUECHENMONITORE_SUNMI, KIOSK, ORDERMAN,
  DIENSTLEISTUNGEN, SHARP, SHARP_ZUBEHOR, BROTHER,
};

interface ProductRow {
  id: string;
  code: string | null;
  name: string;
  catalog: string;
  category: string | null;
  kind: string;
  note: string | null;
  info: string | null;
  pricing: { price?: number; tiers?: Record<string, number>; servicePercent?: number; discount?: unknown } | null;
  attrs: Record<string, unknown> | null;
  auto_add: unknown;
  sort: number;
}

// Reverse of scripts/gen-products-seed.ts: DB row → the Item shape the app
// consumes (flat price OR tier `p`, servicePercent, discount, copier attrs).
function rowToItem(r: ProductRow): Item {
  const p = r.pricing || {};
  const item: Record<string, unknown> = {
    id: r.id,
    name: r.name,
    t: r.kind,
    ...(r.code != null ? { code: r.code } : {}),
    ...(r.category != null ? { cat: r.category } : {}),
    ...(r.note != null ? { note: r.note } : {}),
    ...(r.info != null ? { info: r.info } : {}),
    ...(p.price !== undefined ? { price: p.price } : {}),
    ...(p.tiers ? { p: p.tiers } : {}),
    ...(p.servicePercent !== undefined ? { servicePercent: p.servicePercent } : {}),
    ...(p.discount ? { discount: p.discount } : {}),
    ...(r.attrs || {}),
    ...(r.auto_add ? { autoAdd: r.auto_add } : {}),
  };
  return item as unknown as Item;
}

let version = 0;
let hydrated = false;
// True once the FIRST hydrate attempt has finished — success, failure, or
// no-supabase. Consumers gate their initial render on this so the hardcoded
// fallback is never shown: the app waits for the DB (or a definitive failure)
// before painting, then renders live DB data.
let settled = false;
let inFlight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function getCatalogVersion(): number {
  return version;
}

// Whether the first hydrate attempt has completed (see `settled`).
export function isCatalogReady(): boolean {
  return settled;
}

async function fetchAndSwap(): Promise<boolean> {
  if (!supabase) return false;
  let rows: ProductRow[];
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, code, name, catalog, category, kind, note, info, pricing, attrs, auto_add, sort')
      .eq('active', true);
    if (error) throw error;
    rows = (data ?? []) as ProductRow[];
  } catch {
    return false;
  }
  if (rows.length === 0) return false;

  const byCatalog = new Map<string, ProductRow[]>();
  for (const r of rows) {
    const arr = byCatalog.get(r.catalog) ?? [];
    arr.push(r);
    byCatalog.set(r.catalog, arr);
  }

  // Replace each known catalog array in place (preserving the export ref).
  for (const [name, arr] of Object.entries(CATALOG_ARRAYS)) {
    const items = (byCatalog.get(name) ?? [])
      .sort((a, b) => a.sort - b.sort)
      .map(rowToItem);
    arr.length = 0;
    arr.push(...items);
  }

  // Rebuild the ALL lookup + CATALOG_IDS set in place.
  for (const key of Object.keys(ALL)) delete ALL[key];
  const ids = CATALOG_IDS as Set<string>;
  ids.clear();
  for (const arr of Object.values(CATALOG_ARRAYS)) {
    for (const it of arr) {
      ALL[it.id] = it;
      ids.add(it.id);
    }
  }

  hydrated = true;
  version += 1;
  return true;
}

// Fetch active products and replace the in-memory catalog. Best-effort:
// on any failure (e.g. anon accept page, offline) the hardcoded fallback
// stays in place. Concurrent callers share one in-flight request. Always
// marks the catalog `settled` when done so gated consumers can render.
// Returns true if it actually swapped in DB data.
export async function hydrateCatalog(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = fetchAndSwap()
    .then((ok) => {
      settled = true;
      notify();
      return ok;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// Hook: hydrate once on mount and re-render when the catalog swaps in or the
// first attempt settles. Returns { version, ready } — gate initial render on
// `ready` so the hardcoded fallback is never shown in the authenticated app.
export function useHydratedCatalog(): { version: number; ready: boolean } {
  const [, tick] = useState(0);
  useEffect(() => {
    const cb = () => tick((t) => t + 1);
    listeners.add(cb);
    if (!hydrated) void hydrateCatalog();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return { version, ready: settled };
}
