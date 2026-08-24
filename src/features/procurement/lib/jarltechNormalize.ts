// Pure normalisation of raw Jarltech API payloads → the shape the UI
// consumes. Kept separate from the edge function + client so the
// field-name/number parsing stays under unit-test coverage (mirrors the
// webfleetTrips.ts pattern).
//
// Jarltech quirks handled here:
//  - prices are STRINGS with a dot decimal ("150.13") → number
//  - list_price may be null
//  - a 404 on price or stock arrives as null (item unknown for us)

export interface JarltechItemInfo {
  jarltechItemId: string;
  unitPrice: number | null;  // your custom net price
  listPrice: number | null;
  currency: string | null;
  stock: number | null;
}

// Raw shape as returned by the jarltech-proxy `prices` action: one entry
// per requested id, each carrying the raw /price and /stock payloads
// (either the JSON object or null on 404).
export interface RawJarltechEntry {
  jarltechItemId: string;
  price: unknown;
  stock: unknown;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function normalizeJarltechEntry(entry: RawJarltechEntry): JarltechItemInfo {
  const price = (entry.price ?? null) as Record<string, unknown> | null;
  const stock = (entry.stock ?? null) as Record<string, unknown> | null;
  return {
    jarltechItemId: entry.jarltechItemId,
    unitPrice: price ? toNumber(price.unit_price) : null,
    listPrice: price ? toNumber(price.list_price) : null,
    currency: price && typeof price.currency === "string" ? price.currency : null,
    stock: stock ? toNumber(stock.stock) : null,
  };
}

// Normalise a batch and key by jarltech item id for O(1) lookup in the UI.
export function indexJarltechItems(entries: RawJarltechEntry[]): Map<string, JarltechItemInfo> {
  const m = new Map<string, JarltechItemInfo>();
  for (const e of entries) {
    const info = normalizeJarltechEntry(e);
    m.set(info.jarltechItemId, info);
  }
  return m;
}
