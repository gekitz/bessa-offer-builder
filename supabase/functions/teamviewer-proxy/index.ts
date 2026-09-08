import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  findCustomerDevices,
  normalizeSnapshot,
  type TvDevice,
} from "../_shared/teamviewer.ts";

// ═══════════════════════════════════════════════════════
// TeamViewer Web API Proxy
// ═══════════════════════════════════════════════════════
//
// Routes:
//   POST /teamviewer-proxy  { action: "findDevices", customerNumber }  → { devices }
//   POST /teamviewer-proxy  { action: "ping" }                         → { ok }
//
// All requests require a valid Supabase JWT. The proxy holds a TeamViewer
// Script token (secret) and does the Kundennummer matching server-side.
//
// The TeamViewer API has no server-side name/number search — you must load ALL
// groups + devices and filter yourself. Doing that on every customer-open would
// be slow and hammer the API rate limit, so we cache a normalised snapshot in
// Postgres (table `teamviewer_cache`) and only refresh it when it's older than
// the TTL. Same shared-cache idea as mesonic_session.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TV_API = "https://webapi.teamviewer.com/api/v1";
const SNAPSHOT_TTL_MS = 10 * 60 * 1000; // refresh groups+devices at most every 10 min

function getToken(): string {
  const token = Deno.env.get("TEAMVIEWER_TOKEN");
  if (!token) {
    throw new Error(
      "Missing TeamViewer config. Set TEAMVIEWER_TOKEN (a Script token with Computers & Contacts read scope) as an Edge Function secret.",
    );
  }
  return token;
}

// Service-role client for the shared snapshot cache (bypasses RLS).
const cacheStore = (() => {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    return createClient(url, key);
  } catch {
    return null;
  }
})();

// Fast per-isolate cache in front of the DB cache.
let memSnapshot: TvDevice[] | null = null;
let memTimestamp = 0;

async function fetchTimeout(url: string, init: RequestInit, ms = 25000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function tvGet(path: string): Promise<Response> {
  return fetchTimeout(`${TV_API}${path}`, {
    headers: { "Authorization": `Bearer ${getToken()}`, "Accept": "application/json" },
  });
}

// ─── Build a fresh snapshot from the TeamViewer API ───
async function buildSnapshot(): Promise<TvDevice[]> {
  const [groupsRes, devicesRes] = await Promise.all([tvGet("/groups"), tvGet("/devices")]);
  const groupsText = await groupsRes.text();
  const devicesText = await devicesRes.text();

  if (!groupsRes.ok) throw new Error(`TeamViewer /groups fehlgeschlagen (HTTP ${groupsRes.status}): ${groupsText.substring(0, 200)}`);
  if (!devicesRes.ok) throw new Error(`TeamViewer /devices fehlgeschlagen (HTTP ${devicesRes.status}): ${devicesText.substring(0, 200)}`);

  return normalizeSnapshot(JSON.parse(groupsText), JSON.parse(devicesText));
}

async function loadDbSnapshot(): Promise<{ snapshot: TvDevice[]; ageMs: number } | null> {
  if (!cacheStore) return null;
  try {
    const { data } = await cacheStore
      .from("teamviewer_cache").select("snapshot, created_at").eq("id", 1).maybeSingle();
    if (data?.snapshot) {
      return { snapshot: data.snapshot as TvDevice[], ageMs: Date.now() - new Date(data.created_at).getTime() };
    }
  } catch (_e) { /* fall back to a live fetch */ }
  return null;
}

async function saveDbSnapshot(snapshot: TvDevice[]): Promise<void> {
  if (!cacheStore) return;
  try {
    await cacheStore.from("teamviewer_cache")
      .upsert({ id: 1, snapshot, created_at: new Date().toISOString() });
  } catch (_e) { /* best-effort */ }
}

// ─── Get a snapshot: isolate cache → DB cache → live fetch ───
async function getSnapshot(): Promise<TvDevice[]> {
  if (memSnapshot && Date.now() - memTimestamp < SNAPSHOT_TTL_MS) {
    return memSnapshot;
  }
  const db = await loadDbSnapshot();
  if (db && db.ageMs < SNAPSHOT_TTL_MS) {
    memSnapshot = db.snapshot;
    memTimestamp = Date.now() - db.ageMs;
    return db.snapshot;
  }
  const fresh = await buildSnapshot();
  memSnapshot = fresh;
  memTimestamp = Date.now();
  await saveDbSnapshot(fresh);
  return fresh;
}

async function verifyAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !!user && !error;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!(await verifyAuth(req))) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { action } = body;

    if (action === "ping") {
      const res = await tvGet("/ping");
      const text = await res.text();
      let valid = false;
      try { valid = JSON.parse(text)?.token_valid === true; } catch { /* ignore */ }
      return json({ ok: res.ok && valid, status: res.status });
    }

    if (action === "findDevices") {
      const customerNumber = String(body.customerNumber ?? "").trim();
      if (!customerNumber) {
        return json({ error: "Missing required field: customerNumber" }, 400);
      }
      const snapshot = await getSnapshot();
      const devices = findCustomerDevices(snapshot, customerNumber);
      return json({ devices, count: devices.length });
    }

    return json({ error: `Unknown action: ${action}. Use "findDevices" or "ping".` }, 400);
  } catch (err) {
    console.error("[teamviewer-proxy] error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
