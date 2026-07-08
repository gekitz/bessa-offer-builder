import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// WEBFLEET.connect Proxy
// ═══════════════════════════════════════════════════════
//
// Thin proxy over TomTom's WEBFLEET.connect HTTP API. Keeps the
// credentials server-side and normalises transport concerns (CORS,
// JWT, error shape). Parsing/normalisation of the trip records happens
// in the tested app layer (src/features/tickets/lib/webfleetTrips.ts),
// NOT here — so the field-name mapping stays under unit-test coverage.
//
// Routes (POST /webfleet-proxy):
//   { action: "ping" }                         — credential/health check
//   { action: "objects" }                      — list vehicles (objectno, plate, ...)
//   { action: "trips", objectno, from, to }    — trips for one vehicle in an ISO range
//   { action: "debug", ... }                   — return the RAW Webfleet response
//                                                 (use once to confirm field names)
//
// All requests require a valid Supabase JWT in the Authorization header.
//
// Secrets (set as Edge Function secrets):
//   WEBFLEET_ACCOUNT, WEBFLEET_USER, WEBFLEET_PASS, WEBFLEET_APIKEY
//   WEBFLEET_URL (optional, default https://csv.webfleet.com/extern)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getConfig() {
  const account = Deno.env.get("WEBFLEET_ACCOUNT");
  const username = Deno.env.get("WEBFLEET_USER");
  const password = Deno.env.get("WEBFLEET_PASS");
  const apikey = Deno.env.get("WEBFLEET_APIKEY");
  const url = Deno.env.get("WEBFLEET_URL") ?? "https://csv.webfleet.com/extern";

  if (!account || !username || !password || !apikey) {
    throw new Error(
      "Missing Webfleet config. Set WEBFLEET_ACCOUNT, WEBFLEET_USER, " +
        "WEBFLEET_PASS, WEBFLEET_APIKEY as Edge Function secrets.",
    );
  }
  return { account, username, password, apikey, url: url.replace(/\/$/, "") };
}

// Build the base query shared by every WEBFLEET.connect action.
// Only account + apikey go in the URL — username/password are sent via
// HTTP Basic Auth (Webfleet rejects URL credentials, errorCode 1180).
// outputformat=json + useISO8601=true → JSON records with ISO 8601
// timestamps, which the app layer parses. lang=de keeps address/label
// strings in German.
function baseParams(cfg: ReturnType<typeof getConfig>): URLSearchParams {
  return new URLSearchParams({
    account: cfg.account,
    apikey: cfg.apikey,
    outputformat: "json",
    useISO8601: "true",
    lang: "de",
  });
}

// WEBFLEET.connect signals errors either as a plain-text line beginning
// with a numeric code, or (with outputformat=json) as a JSON object
// carrying errorCode/errorMsg. A *successful* data response is a JSON
// array. Detect both error shapes.
function webfleetError(text: string, parsed: unknown): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Non-JSON body → the whole line is the error.
  if (trimmed[0] !== "[" && trimmed[0] !== "{") return trimmed;
  // JSON object with an errorCode → error payload.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (obj.errorCode !== undefined) {
      return `${obj.errorCode}: ${obj.errorMsg ?? "unbekannter Fehler"}`;
    }
  }
  return null;
}

async function callWebfleet(
  cfg: ReturnType<typeof getConfig>,
  action: string,
  extra: Record<string, string>,
): Promise<{ raw: string; records: unknown }> {
  const params = baseParams(cfg);
  params.set("action", action);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);

  const url = `${cfg.url}?${params.toString()}`;
  // Never log the full URL — it carries the apikey.
  console.log(`[webfleet] action=${action} ${JSON.stringify(extra)}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let text: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Username/password via Basic Auth (Webfleet requirement).
        Authorization: `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`,
      },
    });
    text = await res.text();
    if (!res.ok) {
      throw new Error(`Webfleet HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Webfleet timeout nach 30 Sekunden.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const err = webfleetError(text, parsed);
  if (err) {
    throw new Error(`Webfleet-Fehler: ${err}`);
  }

  return { raw: text, records: parsed };
}

// ─── JWT verification (same approach as mesonic-proxy) ───
async function verifyAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !!user && !error;
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
    if (!(await verifyAuth(req))) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };
    const cfg = getConfig();

    // ── Health check: list objects is the cheapest authenticated call ──
    if (action === "ping") {
      try {
        await callWebfleet(cfg, "showObjectReportExtern", {});
        return json({ ok: true });
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 502);
      }
    }

    // ── List vehicles — populates the assignment UI / discovers objectnos ──
    if (action === "objects") {
      const { records } = await callWebfleet(cfg, "showObjectReportExtern", {});
      return json({ objects: records });
    }

    // ── Trips for one vehicle in a range ──
    if (action === "trips") {
      const { objectno, from, to } = body as {
        objectno?: string;
        from?: string;
        to?: string;
      };
      if (!objectno || !from || !to) {
        return json(
          { error: "Missing required fields: objectno, from, to (ISO 8601)" },
          400,
        );
      }
      const { records } = await callWebfleet(cfg, "showTripReportExtern", {
        objectno,
        rangefrom_string: from,
        rangeto_string: to,
      });
      return json({ trips: records });
    }

    // ── Debug: return the RAW Webfleet response for field discovery ──
    // One-time use to confirm the live record shape, then lock the
    // normaliser in webfleetTrips.ts against it.
    if (action === "debug") {
      const { wfAction = "showTripReportExtern", params = {} } = body as {
        wfAction?: string;
        params?: Record<string, string>;
      };
      const { raw } = await callWebfleet(cfg, wfAction, params);
      return new Response(raw, {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return json(
      { error: `Unknown action: ${action}. Use ping|objects|trips|debug.` },
      400,
    );
  } catch (err) {
    console.error("[webfleet-proxy] error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
