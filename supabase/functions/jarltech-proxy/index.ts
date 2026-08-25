import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// Jarltech API Proxy
// ═══════════════════════════════════════════════════════
//
// Thin proxy over the Jarltech reseller REST API (OpenAPI v1.0.3). Keeps
// the OAuth client-credentials server-side and normalises transport
// concerns (CORS, JWT, error shape, token caching). Number/field parsing
// happens in the tested app layer (src/features/procurement/lib/
// jarltechNormalize.ts), NOT here.
//
// READ-ONLY: only price/stock/item-data/id-resolution. Order creation
// (/shop-order/create) is intentionally NOT exposed — Jarltech orders are
// binding; that belongs behind an explicit confirm in a later phase.
//
// Jarltech guidance: the item endpoints are for on-demand lookups, NOT
// bulk catalog sync (use their price lists for that). Callers must only
// request the handful of items in an open aggregation.
//
// Routes (POST /jarltech-proxy):
//   { action: "ping" }                              — token + health check
//   { action: "prices", ids: string[] }             — price + stock per
//                                                      jarltech_item_identifier
//   { action: "resolve", manufacturerId: string }   — manufacturer SKU →
//                                                      jarltech_item_identifier
//
// All requests require a valid Supabase JWT in the Authorization header.
//
// Secrets (set as Edge Function secrets):
//   JARLTECH_CLIENT_ID, JARLTECH_CLIENT_SECRET, JARLTECH_CUSTOMER_ID (7 digits)
//   JARLTECH_BASE_URL (optional, default https://shop.preview.jarltech.de — the
//                      test server; set to https://www.jarltech.com for live)
//   JARLTECH_LANG (optional, default 'de')

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getConfig() {
  const clientId = Deno.env.get("JARLTECH_CLIENT_ID");
  const clientSecret = Deno.env.get("JARLTECH_CLIENT_SECRET");
  const customerId = Deno.env.get("JARLTECH_CUSTOMER_ID");
  const baseUrl = Deno.env.get("JARLTECH_BASE_URL") ?? "https://shop.preview.jarltech.de";
  const lang = Deno.env.get("JARLTECH_LANG") ?? "de";

  if (!clientId || !clientSecret || !customerId) {
    throw new Error(
      "Missing Jarltech config. Set JARLTECH_CLIENT_ID, JARLTECH_CLIENT_SECRET, " +
        "JARLTECH_CUSTOMER_ID as Edge Function secrets.",
    );
  }
  return { clientId, clientSecret, customerId, baseUrl: baseUrl.replace(/\/$/, ""), lang };
}

type Config = ReturnType<typeof getConfig>;

// Jarltech errors (400/403/404/503) come back as GenericErrorMessage:
// { message: string, code?: number }. Turn that into a readable string;
// fall back to a truncated raw body if it isn't the documented shape.
function jarltechErrorMessage(status: number, text: string): string {
  try {
    const obj = JSON.parse(text) as { message?: string; code?: number };
    if (obj && typeof obj.message === "string") {
      return obj.code ? `${obj.message} (code ${obj.code})` : obj.message;
    }
  } catch {
    // not JSON — fall through
  }
  return `HTTP ${status}: ${text.slice(0, 300)}`;
}

// ─── OAuth2 client-credentials token, cached in module memory ───
// The token is reused across invocations while the isolate stays warm.
// We refresh 60s before expiry to avoid using an about-to-expire token.
let cachedToken: { value: string; expiresAt: number } | null = null;

// One token request with the client credentials placed either in the
// form body ("body") or an HTTP Basic header ("basic"). OAuth2 servers
// accept one or the other; the spec doesn't say which, so getToken tries
// body first and falls back to basic. Returns the raw Response + body text.
async function requestToken(
  cfg: Config,
  placement: "body" | "basic",
): Promise<{ res: Response; text: string }> {
  const params = new URLSearchParams({ grant_type: "client_credentials" });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (placement === "body") {
    params.set("client_id", cfg.clientId);
    params.set("client_secret", cfg.clientSecret);
  } else {
    headers.Authorization = `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`;
  }
  const res = await fetch(`${cfg.baseUrl}/oauth/token`, {
    method: "POST",
    headers,
    body: params,
  });
  return { res, text: await res.text() };
}

async function getToken(cfg: Config): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }

  // Try body-placed credentials first; on an auth rejection (400/401 — the
  // typical OAuth2 responses for a credential/placement mismatch) retry
  // with HTTP Basic before giving up.
  let { res, text } = await requestToken(cfg, "body");
  if (res.status === 400 || res.status === 401) {
    ({ res, text } = await requestToken(cfg, "basic"));
  }
  if (!res.ok) {
    throw new Error(`Jarltech OAuth HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  let parsed: { access_token?: string; expires_in?: number };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Jarltech OAuth: Antwort ist kein JSON.");
  }
  if (!parsed.access_token) {
    throw new Error("Jarltech OAuth: kein access_token in der Antwort.");
  }
  const ttlMs = (parsed.expires_in ?? 3600) * 1000;
  cachedToken = { value: parsed.access_token, expiresAt: now + ttlMs };
  return cachedToken.value;
}

// GET a Jarltech API path (relative to the customer-scoped v1 base) and
// return the parsed JSON. 404 → null (item not found for this customer),
// which callers treat as "no data" rather than an error.
async function apiGet(cfg: Config, token: string, path: string): Promise<unknown | null> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${cfg.baseUrl}/${cfg.lang}/api/v1/${cfg.customerId}${path}${sep}_format=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 404) return null;
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Jarltech: ${jarltechErrorMessage(res.status, text)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Jarltech: Antwort ist kein JSON.");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Jarltech timeout nach 15 Sekunden.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// POST a Jarltech API path with a JSON body and return the parsed JSON.
// Unlike apiGet, a 404 here is a real error (not "no data").
async function apiPost(
  cfg: Config,
  token: string,
  path: string,
  payload: unknown,
): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${cfg.baseUrl}/${cfg.lang}/api/v1/${cfg.customerId}${path}${sep}_format=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Jarltech: ${jarltechErrorMessage(res.status, text)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Jarltech: Antwort ist kein JSON.");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Jarltech timeout nach 20 Sekunden.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Price + stock for one item. Both are independent lookups; a missing
// price or stock (404) degrades to null so one gap doesn't sink the row.
async function priceAndStock(
  cfg: Config,
  token: string,
  id: string,
): Promise<{ jarltechItemId: string; price: unknown; stock: unknown }> {
  const enc = encodeURIComponent(id);
  const [price, stock] = await Promise.all([
    apiGet(cfg, token, `/item/${enc}/price`),
    apiGet(cfg, token, `/item/${enc}/stock`),
  ]);
  return { jarltechItemId: id, price, stock };
}

// ─── Caller identity (same JWT approach as webfleet-proxy/mesonic-proxy) ───
// Returns the caller's (lowercased) email, or null if unauthenticated.
async function getCaller(req: Request): Promise<{ email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { email: (user.email ?? "").toLowerCase() };
}

// Placing a binding Jarltech order is restricted to a small allowlist of
// people, set via the JARLTECH_ORDER_ALLOWLIST secret (comma-separated,
// case-insensitive emails). Enforced server-side — the UI gate is only UX.
function isOrderAllowed(email: string): boolean {
  const raw = Deno.env.get("JARLTECH_ORDER_ALLOWLIST") ?? "";
  const allow = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && allow.includes(email);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const caller = await getCaller(req);
    if (!caller) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    // ── Order-permission check (no Jarltech call needed) ──
    // Lets the UI show/hide the "place order" button. The real gate is on
    // the create-order action below.
    if (action === "order-permission") {
      return json({ allowed: isOrderAllowed(caller.email) });
    }

    const cfg = getConfig();

    // ── Health check (validates OAuth credentials) ──
    if (action === "ping") {
      await getToken(cfg);
      return json({ ok: true });
    }

    // ── Batch price + stock lookup ──
    // Bounded to protect against accidental catalog-wide calls (Jarltech
    // asks that the item API not be used for bulk sync).
    if (action === "prices") {
      const { ids } = body as { ids?: unknown };
      if (!Array.isArray(ids) || ids.length === 0) {
        return json({ error: "Missing required field: ids (non-empty string[])" }, 400);
      }
      if (ids.length > 100) {
        return json({ error: "Too many ids (max 100 per request)." }, 400);
      }
      const token = await getToken(cfg);
      const unique = Array.from(new Set(ids.map((x) => String(x))));
      const results = await Promise.all(
        unique.map((id) => priceAndStock(cfg, token, id)),
      );
      return json({ items: results });
    }

    // ── Resolve a manufacturer SKU to a Jarltech item identifier ──
    if (action === "resolve") {
      const { manufacturerId } = body as { manufacturerId?: string };
      if (!manufacturerId) {
        return json({ error: "Missing required field: manufacturerId" }, 400);
      }
      const token = await getToken(cfg);
      const data = await apiGet(
        cfg,
        token,
        `/jarltech-item-identifier?manufacturer_item_identifier=${encodeURIComponent(manufacturerId)}`,
      );
      return json({ result: data });
    }

    // ── List available price lists (metadata; read-only probe) ──
    if (action === "price-lists") {
      const token = await getToken(cfg);
      const data = await apiGet(cfg, token, `/price-list`);
      return json({ priceLists: data });
    }

    // ── Place a BINDING shop order (allowlist-gated) ──
    if (action === "create-order") {
      if (!isOrderAllowed(caller.email)) {
        return json(
          { error: "Nicht berechtigt, verbindlich bei Jarltech zu bestellen." },
          403,
        );
      }
      const {
        items,
        shippingAddress,
        internalReference,
        note,
        allowSplitting,
        shippingType,
      } = body as {
        items?: Array<{ jarltechItemId?: string; quantity?: number }>;
        shippingAddress?: {
          countryCode?: string;
          companyName?: string;
          street?: string;
          zip?: string;
          city?: string;
          contactName?: string;
          phone?: string;
        };
        internalReference?: string;
        note?: string;
        allowSplitting?: boolean;
        shippingType?: string;
      };

      if (!Array.isArray(items) || items.length === 0) {
        return json({ error: "Missing order items." }, 400);
      }
      for (const it of items) {
        if (!it.jarltechItemId || !it.quantity || it.quantity < 1) {
          return json({ error: "Each item needs a jarltechItemId and quantity >= 1." }, 400);
        }
      }
      const addr = shippingAddress ?? {};
      if (!addr.countryCode || !addr.companyName || !addr.street) {
        return json(
          { error: "Shipping address needs countryCode, companyName and street." },
          400,
        );
      }

      const token = await getToken(cfg);
      const orderBody: Record<string, unknown> = {
        customer_id: Number(cfg.customerId),
        order_items: items.map((i) => ({
          quantity: i.quantity,
          jarltech_item_identifier: i.jarltechItemId,
        })),
        shipping_address: {
          country_code: addr.countryCode,
          company_name: addr.companyName,
          street: addr.street,
          ...(addr.zip ? { zip: addr.zip } : {}),
          ...(addr.city ? { city: addr.city } : {}),
          ...(addr.contactName ? { contact_name: addr.contactName } : {}),
          ...(addr.phone ? { phone: addr.phone } : {}),
        },
        // Default OFF: keep the order as a single shipment (one delivery
        // fee) rather than splitting on partial availability.
        allow_order_splitting: !!allowSplitting,
        desired_shipping_type: shippingType || "standard",
        ...(internalReference ? { internal_customer_reference: String(internalReference).slice(0, 50) } : {}),
        ...(note ? { customer_order_note: String(note).slice(0, 500) } : {}),
      };

      const result = await apiPost(cfg, token, `/shop-order/create`, orderBody);
      return json({ order: result });
    }

    return json(
      { error: `Unknown action: ${action}. Use ping|prices|resolve|order-permission|create-order|price-lists.` },
      400,
    );
  } catch (err) {
    console.error("[jarltech-proxy] error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
