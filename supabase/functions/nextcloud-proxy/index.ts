import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findCustomerFolders, type CustomerFolder } from "../_shared/nextcloudDav.ts";

// ═══════════════════════════════════════════════════════
// Nextcloud WebDAV Proxy
// ═══════════════════════════════════════════════════════
//
// Routes:
//   POST /nextcloud-proxy  { action: "findDocs", customerNumber }  → { matches }
//   POST /nextcloud-proxy  { action: "ping" }                      → { ok }
//
// All requests require a valid Supabase JWT. The proxy holds a single
// service-account credential (app-password) and runs the WebDAV PROPFIND
// server-side — WebDAV can't be reached from the browser (CORS + credentials).
//
// Customer folders carry the Kundennummer as a suffix ("Zum Alois - 233679").
// For each configured base path we PROPFIND (Depth: 1) and keep the child
// folders whose name ends with the number. The parsing/matching is shared with
// the frontend (../_shared/nextcloudDav.ts) so vitest covers it.

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

function getNextcloudConfig() {
  const url = Deno.env.get("NEXTCLOUD_URL"); // e.g. https://cloud.kitz.at
  const user = Deno.env.get("NEXTCLOUD_USER"); // service account login
  const password = Deno.env.get("NEXTCLOUD_APP_PASSWORD"); // Nextcloud app-password
  // Comma-separated list of directories the service account sees, e.g.
  //   "/Kunden,/Archiv/Kunden"
  const basePathsRaw = Deno.env.get("NEXTCLOUD_BASE_PATHS") ?? "/";

  if (!url || !user || !password) {
    throw new Error(
      "Missing Nextcloud config. Set NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_APP_PASSWORD (and optionally NEXTCLOUD_BASE_PATHS) as Edge Function secrets.",
    );
  }

  const basePaths = basePathsRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : "/" + p))
    .map((p) => (p === "/" ? "" : p.replace(/\/+$/, ""))); // normalise; root → ""

  return {
    baseUrl: url.replace(/\/+$/, ""),
    user,
    password,
    basePaths: basePaths.length ? basePaths : [""],
  };
}

// fetch with a timeout so a hung Nextcloud can't block the isolate past the
// Edge Function limit.
async function fetchTimeout(url: string, init: RequestInit, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

// ─── PROPFIND one base path, return the matching customer folders ───
async function propfindMatches(
  cfg: ReturnType<typeof getNextcloudConfig>,
  basePath: string,
  customerNumber: string,
): Promise<CustomerFolder[]> {
  const davUserPrefix = `/remote.php/dav/files/${encodeURIComponent(cfg.user)}`;
  const encodedBase = basePath.split("/").map(encodeURIComponent).join("/");
  const url = `${cfg.baseUrl}${davUserPrefix}${encodedBase}/`;
  const auth = "Basic " + btoa(`${cfg.user}:${cfg.password}`);

  const res = await fetchTimeout(url, {
    method: "PROPFIND",
    headers: {
      "Authorization": auth,
      "Depth": "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: PROPFIND_BODY,
  });

  const text = await res.text();
  if (res.status === 404) return []; // base path missing for this account → skip
  if (!res.ok) {
    throw new Error(`Nextcloud PROPFIND ${basePath || "/"} fehlgeschlagen (HTTP ${res.status})`);
  }

  return findCustomerFolders(text, {
    customerNumber,
    davUserPrefix: `/remote.php/dav/files/${cfg.user}`, // decoded prefix for matching hrefs
    baseUrl: cfg.baseUrl,
    basePath: basePath || undefined,
  });
}

// ─── JWT verification (same contract as mesonic-proxy) ───
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
      const cfg = getNextcloudConfig();
      const davUserPrefix = `/remote.php/dav/files/${encodeURIComponent(cfg.user)}`;
      const res = await fetchTimeout(`${cfg.baseUrl}${davUserPrefix}/`, {
        method: "PROPFIND",
        headers: {
          "Authorization": "Basic " + btoa(`${cfg.user}:${cfg.password}`),
          "Depth": "0",
        },
      });
      return json({ ok: res.ok, status: res.status });
    }

    if (action === "findDocs") {
      const customerNumber = String(body.customerNumber ?? "").trim();
      if (!customerNumber) {
        return json({ error: "Missing required field: customerNumber" }, 400);
      }

      const cfg = getNextcloudConfig();
      const perPath = await Promise.all(
        cfg.basePaths.map((p) => propfindMatches(cfg, p, customerNumber)),
      );

      // Flatten + dedupe by relPath (in case base paths overlap).
      const seen = new Set<string>();
      const matches: CustomerFolder[] = [];
      for (const m of perPath.flat()) {
        if (seen.has(m.relPath)) continue;
        seen.add(m.relPath);
        matches.push(m);
      }

      return json({ matches, count: matches.length });
    }

    return json({ error: `Unknown action: ${action}. Use "findDocs" or "ping".` }, 400);
  } catch (err) {
    console.error("[nextcloud-proxy] error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
