// DB read path for the product catalog — the `products` table is the single
// source of truth. The arrays / ALL / CATALOG_IDS in catalogs.ts ship EMPTY;
// we hydrate from the DB by mutating those exported references in place, then
// bump a version so subscribers (OfferBuilderPage) re-render with DB data.
//
// There is no hardcoded fallback: if the DB can't be loaded (no Supabase,
// query error, or zero rows) we record a load error and leave the catalog
// empty so the UI can show a proper error instead of a stale/blank catalog.
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
// True once the FIRST hydrate attempt has finished — success or failure.
// Consumers gate their initial render on this: the app waits for the DB (or a
// definitive failure) before painting, then renders live DB data or an error.
let settled = false;
// Non-null when the last hydrate attempt failed (no Supabase, query error, or
// zero rows). Consumers show a proper error instead of an empty catalog.
let loadError: string | null = null;
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

// The last hydrate error message, or null if the catalog loaded successfully.
export function getCatalogError(): string | null {
  return loadError;
}

async function fetchAndSwap(): Promise<boolean> {
  if (!supabase) {
    loadError = 'Keine Verbindung zur Datenbank (Supabase ist nicht konfiguriert).';
    return false;
  }
  let rows: ProductRow[];
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, code, name, catalog, category, kind, note, info, pricing, attrs, auto_add, sort')
      .eq('active', true);
    if (error) throw new Error(error.message || 'Unbekannter Datenbankfehler');
    rows = (data ?? []) as ProductRow[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
    return false;
  }
  if (rows.length === 0) {
    loadError = 'Es wurden keine Produkte in der Datenbank gefunden.';
    return false;
  }

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

  loadError = null;
  hydrated = true;
  version += 1;
  return true;
}

// Fetch active products and replace the in-memory catalog. On any failure
// (no Supabase, query error, or zero rows) it records a load error and leaves
// the catalog empty — there is no hardcoded fallback. Concurrent callers share
// one in-flight request. Always marks the catalog `settled` when done so gated
// consumers can render (either the catalog or the error). Returns true if it
// actually swapped in DB data.
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

// Reset readiness and re-run hydration — used by the error screen's retry.
// Flips consumers back to the loading state, then re-fetches from the DB.
export async function reloadCatalog(): Promise<boolean> {
  settled = false;
  hydrated = false;
  loadError = null;
  notify();
  return hydrateCatalog();
}

// Hook: hydrate once on mount and re-render when the catalog swaps in or an
// attempt settles. Returns { version, ready, error, reload } — gate initial
// render on `ready`, then show `error` (with `reload` to retry) if set.
export function useHydratedCatalog(): {
  version: number;
  ready: boolean;
  error: string | null;
  reload: () => Promise<boolean>;
} {
  const [, tick] = useState(0);
  useEffect(() => {
    const cb = () => tick((t) => t + 1);
    listeners.add(cb);
    if (!hydrated) void hydrateCatalog();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return { version, ready: settled, error: loadError, reload: reloadCatalog };
}
