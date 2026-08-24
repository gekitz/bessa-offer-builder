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

// Invoke the jarltech-proxy edge function and return its JSON body.
//
// supabase-js reports a non-2xx as a generic "Edge Function returned a
// non-2xx status code" and hides our real message in error.context (the
// raw Response). We read that body so the UI shows the actual cause
// (e.g. "Jarltech: 403 Access denied") instead of the opaque default.
async function invokeJarltech(body: Record<string, unknown>): Promise<any> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('jarltech-proxy', { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const parsed = await (ctx as Response).json();
        if (parsed?.error) detail = parsed.error;
      } catch {
        // body already consumed or not JSON — keep the generic message
      }
    }
    throw new Error(`Jarltech: ${detail}`);
  }
  if (data?.error) throw new Error(`Jarltech: ${data.error}`);
  return data;
}

// Fetch current net price + stock for a set of Jarltech item ids. Returns
// a Map keyed by jarltech item id. An empty input short-circuits (no call).
export async function fetchJarltechPrices(
  jarltechItemIds: string[],
): Promise<Map<string, JarltechItemInfo>> {
  const ids = Array.from(new Set(jarltechItemIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const data = await invokeJarltech({ action: 'prices', ids });
  const items: RawJarltechEntry[] = data?.items ?? [];
  return indexJarltechItems(items);
}

// Connectivity/credential check: hits the `ping` action, which fetches an
// OAuth token and returns { ok: true }. Throws with the Jarltech error
// message if the client id/secret (or token placement) are wrong.
export async function pingJarltech(): Promise<boolean> {
  const data = await invokeJarltech({ action: 'ping' });
  return !!data?.ok;
}

// Resolve a manufacturer SKU to a Jarltech item identifier (helper for
// linking products in the admin UI). Returns null if no purchasable item
// with that manufacturer identifier exists (Jarltech 404).
export async function resolveJarltechId(
  manufacturerId: string,
): Promise<{ jarltechItemId: string; manufacturerId: string } | null> {
  const data = await invokeJarltech({ action: 'resolve', manufacturerId });
  const r = (data?.result ?? null) as
    | { jarltech_item_identifier?: string; manufacturer_item_identifier?: string }
    | null;
  if (r?.jarltech_item_identifier) {
    return {
      jarltechItemId: r.jarltech_item_identifier,
      manufacturerId: r.manufacturer_item_identifier ?? manufacturerId,
    };
  }
  return null;
}
