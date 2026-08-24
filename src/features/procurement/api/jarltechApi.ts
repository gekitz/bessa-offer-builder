// Jarltech client — price/stock lookups via the jarltech-proxy Edge
// Function. Raw-payload parsing lives in ../lib/jarltechNormalize (pure +
// tested); this module only handles I/O.
//
// READ-ONLY: price + stock + manufacturer-SKU resolution. Order creation
// is deliberately not wired here (Jarltech orders are binding).

import { supabase } from '../../../lib/supabase';
import {
  indexJarltechItems,
  type JarltechItemInfo,
  type RawJarltechEntry,
} from '../lib/jarltechNormalize';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// Fetch current net price + stock for a set of Jarltech item ids. Returns
// a Map keyed by jarltech item id. An empty input short-circuits (no call).
export async function fetchJarltechPrices(
  jarltechItemIds: string[],
): Promise<Map<string, JarltechItemInfo>> {
  const ids = Array.from(new Set(jarltechItemIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('jarltech-proxy', {
    body: { action: 'prices', ids },
  });
  if (error) throw new Error(`Jarltech: ${error.message}`);
  if (data?.error) throw new Error(`Jarltech: ${data.error}`);

  const items: RawJarltechEntry[] = data?.items ?? [];
  return indexJarltechItems(items);
}

// Connectivity/credential check: hits the `ping` action, which fetches an
// OAuth token and returns { ok: true }. Throws with the Jarltech error
// message if the client id/secret (or token placement) are wrong.
export async function pingJarltech(): Promise<boolean> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('jarltech-proxy', {
    body: { action: 'ping' },
  });
  if (error) throw new Error(`Jarltech: ${error.message}`);
  if (data?.error) throw new Error(`Jarltech: ${data.error}`);
  return !!data?.ok;
}

// Resolve a manufacturer SKU to a Jarltech item identifier (helper for
// linking products in the admin UI). Returns the raw result object.
export async function resolveJarltechId(manufacturerId: string): Promise<unknown> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('jarltech-proxy', {
    body: { action: 'resolve', manufacturerId },
  });
  if (error) throw new Error(`Jarltech: ${error.message}`);
  if (data?.error) throw new Error(`Jarltech: ${data.error}`);
  return data?.result ?? null;
}
