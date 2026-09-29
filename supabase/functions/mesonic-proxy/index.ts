import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_PROBE_KONTO,
  isSessionError,
  needsLivenessProbe,
  parseEximXml,
  PROBE_VERIFY_TTL_MS,
} from "./session.ts";

// ═══════════════════════════════════════════════════════
// Mesonic WinLine MDP WebServices Proxy
// ═══════════════════════════════════════════════════════
//
// Routes:
//   POST /mesonic-proxy  { action: "export", type, template, key, ...opts }
//   POST /mesonic-proxy  { action: "import", type, template, xmlData, ...opts }
//   POST /mesonic-proxy  { action: "ping" }   — health check / keepalive
//
// All requests require a valid Supabase JWT in the Authorization header.
// The proxy manages a shared Mesonic session and auto-relogins on expiry.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Mesonic session ───
// Supabase Edge Functions are stateless — each invocation may run in a
// different, freshly-spawned isolate. A per-isolate cache alone means
// nearly every call cold-logs-in; under load that storms WinLine's small
// CRM_API session pool (there is NO logout endpoint, sessions only expire
// via TTL) and locks out ALL Mesonic access.
//
// Fix: a shared session cache in Postgres (table `mesonic_session`) so ALL
// isolates reuse ONE session — at most ~1 login per SESSION_MAX_AGE window.
// The per-isolate vars stay as a fast path; every DB access is best-effort
// and falls back to a plain login, so a cache hiccup can't regress behaviour.
//
// White Paper §3.1/§3.2: the WinLine session TTL is **1 hour** (sliding —
// reset on every command; configurable via MaxHTTPSessionKeepAliveTime),
// and there IS a **logout** endpoint. The old 4-min re-login (based on a
// wrong "~5 min timeout" guess) was the real leak: it abandoned a fresh
// session every 4 min, each living a FULL HOUR → pool exhaustion. We now
// keep a session ~50 min and explicitly log out the one we replace.
let mesonicSession: string | null = null;
let sessionTimestamp = 0;
const SESSION_MAX_AGE_MS = 50 * 60 * 1000; // re-login after 50 min (TTL is 1 h, sliding)

// Last time we PROVED the current session is alive against WinLine (real data
// came back, or a sentinel probe succeeded). A session can die silently well
// before the 50-min TTL — its worker crashes but the session envelope lingers,
// so exports return empty instead of 001001/001002. We use this to rate-limit
// the liveness probe (see verifySessionAlive / needsLivenessProbe).
let lastVerifiedAt = 0;

// fetch mit Timeout — verhindert, dass ein hängender WinLine-Call den
// Edge-Isolate blockiert und dadurch Sessions "in Verwendung" hält
// (häufigste Ursache für schleichende Pool-Erschöpfung beim Testen).
async function fetchTimeout(url: string, ms = 25000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Service-role client for the shared session cache (bypasses RLS).
const sessionStore = (() => {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    return createClient(url, key);
  } catch {
    return null;
  }
})();

async function loadSharedSession(): Promise<{ session: string; ageMs: number } | null> {
  if (!sessionStore) return null;
  try {
    const { data } = await sessionStore
      .from("mesonic_session").select("session, created_at").eq("id", 1).maybeSingle();
    if (data?.session) {
      return { session: data.session, ageMs: Date.now() - new Date(data.created_at).getTime() };
    }
  } catch (_e) { /* fall back to login */ }
  return null;
}

async function saveSharedSession(session: string): Promise<void> {
  if (!sessionStore) return;
  try {
    await sessionStore.from("mesonic_session")
      .upsert({ id: 1, session, created_at: new Date().toISOString() });
  } catch (_e) { /* best-effort */ }
}

function getMesonicConfig() {
  const url = Deno.env.get("MESONIC_URL"); // e.g. https://mesonic.kitz.co.at
  const user = Deno.env.get("MESONIC_USER"); // e.g. CRM_API
  const password = Deno.env.get("MESONIC_PASS");
  const company = Deno.env.get("MESONIC_COMPANY"); // e.g. 2KCO

  if (!url || !user || !password || !company) {
    throw new Error(
      "Missing Mesonic config. Set MESONIC_URL, MESONIC_USER, MESONIC_PASS, MESONIC_COMPANY as Edge Function secrets."
    );
  }
  return { url: url.replace(/\/$/, ""), user, password, company };
}

// ─── Mesonic login ───
async function mesonicLogin(): Promise<string> {
  const cfg = getMesonicConfig();
  const loginUrl = `${cfg.url}/ewlservice/login?user=${encodeURIComponent(cfg.user)}&password=${encodeURIComponent(cfg.password)}&company=${encodeURIComponent(cfg.company)}`;

  console.log("[mesonic] logging in...");
  const res = await fetchTimeout(loginUrl);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Mesonic login failed (HTTP ${res.status}): ${text}`);
  }

  // The login response can be:
  //   - "Session=<uuid>" (plain text with prefix)
  //   - "<string>SESSION_ID</string>" (XML wrapped)
  //   - just the session ID
  let session = text.trim();

  // Strip XML wrapper if present
  const xmlMatch = session.match(/<string[^>]*>([^<]+)<\/string>/i);
  if (xmlMatch) session = xmlMatch[1].trim();

  // Strip "Session=" prefix if present
  if (session.startsWith("Session=")) {
    session = session.substring("Session=".length);
  }

  if (!session || session.length < 4) {
    throw new Error(`Mesonic login returned invalid session: ${text}`);
  }

  // Check for error codes (6-digit numeric = error)
  if (/^\d{6}$/.test(session)) {
    throw new Error(`Mesonic login error code: ${session}`);
  }

  console.log("[mesonic] logged in, session:", session.substring(0, 8) + "...");
  mesonicSession = session;
  sessionTimestamp = Date.now();
  await saveSharedSession(session); // allen anderen Isolates verfügbar machen
  return session;
}

// ─── Mesonic logout (White Paper §3.2) — Session sauber beenden ───
// Best-effort: gibt den WinLine-Pool-Slot sofort frei, statt ihn bis zum
// 1-h-TTL blockieren zu lassen.
async function mesonicLogout(session: string | null | undefined): Promise<void> {
  if (!session) return;
  try {
    const cfg = getMesonicConfig();
    await fetchTimeout(`${cfg.url}/ewlservice/logout?Session=${encodeURIComponent(session)}`, 5000);
    console.log("[mesonic] logged out session:", session.substring(0, 8) + "...");
  } catch (_e) { /* best-effort */ }
}

// ─── Get or refresh session ───
// Order: fast in-isolate cache → shared DB cache (another isolate's live
// session) → fresh login. This keeps total logins to ~1 per window.
async function getSession(): Promise<string> {
  const age = Date.now() - sessionTimestamp;
  if (mesonicSession && age < SESSION_MAX_AGE_MS) {
    return mesonicSession;
  }
  const shared = await loadSharedSession();
  if (shared && shared.ageMs < SESSION_MAX_AGE_MS) {
    mesonicSession = shared.session;
    sessionTimestamp = Date.now() - shared.ageMs;
    return shared.session;
  }
  // Beide abgelaufen → die alte Session abmelden, bevor eine neue erzeugt
  // wird (sonst blockiert sie den Pool bis zu 1 h). Selten (~1× pro 50 min).
  await mesonicLogout(shared?.session ?? mesonicSession);
  return await mesonicLogin();
}

// ─── Liveness probe (dead-but-silent session detection) ───
// Exports the sentinel Konto (24998 HAUSINTERN by default), which MUST always
// return exactly one record. If the given session can't fetch it, the session
// is dead even though it may not have returned an explicit 001001/001002.
// Returns true = session is alive; false = dead / unreachable.
async function verifySessionAlive(session: string): Promise<boolean> {
  const konto = Deno.env.get("MESONIC_PROBE_KONTO") || DEFAULT_PROBE_KONTO;
  const cfg = getMesonicConfig();
  const qp = new URLSearchParams({
    Session: session,
    Type: "1",
    Vorlage: "WebKontenExport",
    Format: "1",
    byref: "1",
  });
  const url = `${cfg.url}/ewlservice/export?${qp.toString()}&Key=${encodeURIComponent(konto)}`;
  try {
    const res = await fetchTimeout(url, 10000);
    const text = await res.text();
    if (isSessionError(text)) return false;
    return parseEximXml(text).records.length > 0;
  } catch (_e) {
    return false; // timeout / network → treat as not-alive so we re-login
  }
}

// ─── Mesonic export (read data) ───
async function mesonicExport(params: {
  type: number;
  template: string;
  key: string;
  format?: number;
  byref?: number;
}): Promise<string> {
  const cfg = getMesonicConfig();

  const doExport = async (session: string) => {
    // Build URL manually — Mesonic expects Key value with raw %% for LIKE wildcards,
    // so we must NOT let URLSearchParams encode the Key parameter.
    const baseParams = new URLSearchParams({
      Session: session,
      Type: String(params.type),
      Vorlage: params.template,
      Format: String(params.format ?? 1), // 1 = UTF-8 XML
      byref: String(params.byref ?? 1),
    });
    // Append Key without encoding (spaces → %20 only, keep %% as-is)
    const keyEncoded = params.key.replace(/ /g, '%20').replace(/'/g, '%27');
    const url = `${cfg.url}/ewlservice/export?${baseParams.toString()}&Key=${keyEncoded}`;
    console.log(`[mesonic] export URL: ${url}`);
    const res = await fetchTimeout(url);
    return await res.text();
  };

  console.log(`[mesonic] export Type=${params.type} Template=${params.template} Key=${params.key}`);

  // Try with cached session first
  let session = await getSession();
  let text = await doExport(session);

  // If session error, force fresh login and retry once
  if (isSessionError(text)) {
    console.log("[mesonic] session invalid, forcing fresh login...");
    mesonicSession = null;
    session = await mesonicLogin();
    text = await doExport(session);
  }

  // Dead-but-silent session guard: a crashed WinLine session often returns an
  // EMPTY result set (or 000161 "Kein Datensatz") instead of 001001/001002.
  // That's indistinguishable from a genuine no-match, so on an empty result we
  // probe the sentinel Konto (rate-limited via lastVerifiedAt). If the probe is
  // also empty the session is dead → re-login and retry the original query.
  const count = parseEximXml(text).records.length;
  if (count > 0) {
    lastVerifiedAt = Date.now(); // real data proves the session is alive
  } else if (needsLivenessProbe(count, lastVerifiedAt, Date.now(), PROBE_VERIFY_TTL_MS)) {
    const alive = await verifySessionAlive(session);
    if (alive) {
      lastVerifiedAt = Date.now(); // session fine → the empty result is genuine
    } else {
      console.log("[mesonic] empty result + probe failed → stale session, re-login + retry");
      mesonicSession = null;
      session = await mesonicLogin();
      text = await doExport(session);
      lastVerifiedAt = Date.now();
    }
  }

  return text;
}

// ─── Mesonic LIST (named WinLine list, e.g. KundenArtikel) ───
// White Paper §3.8. Selektion über Filter / DatasourceSel1..4 / Where.
// Sel1+Sel2 = Textselektion, Sel3+Sel4 = numerische Selektion.
async function mesonicList(params: {
  name: string;
  outputFormat?: string;   // 'json' (default) | 'pdf'
  filter?: string;         // Filtername oder 'NOFILTER'
  where?: string;          // SQL-Where (braucht AllowWhereStatementInWebService=1)
  datasourceSel1?: string;
  datasourceSel2?: string;
  datasourceSel3?: string;
  datasourceSel4?: string;
  companyYear?: string;
}): Promise<string> {
  const cfg = getMesonicConfig();

  const doList = async (session: string) => {
    const qp = new URLSearchParams({
      Session: session,
      Name: params.name,
      OutputFormat: params.outputFormat ?? "json",
    });
    if (params.filter) qp.set("Filter", params.filter);
    if (params.companyYear) qp.set("CompanyYear", params.companyYear);
    if (params.datasourceSel1 != null) qp.set("DatasourceSel1", params.datasourceSel1);
    if (params.datasourceSel2 != null) qp.set("DatasourceSel2", params.datasourceSel2);
    if (params.datasourceSel3 != null) qp.set("DatasourceSel3", params.datasourceSel3);
    if (params.datasourceSel4 != null) qp.set("DatasourceSel4", params.datasourceSel4);
    let url = `${cfg.url}/ewlservice/LIST?${qp.toString()}`;
    // Where bewusst NICHT über URLSearchParams encoden — WinLine braucht
    // Klammern/Hochkommas im Ausdruck (analog zum Export-Key).
    if (params.where) {
      const w = params.where.replace(/ /g, "%20").replace(/'/g, "%27");
      url += `&Where=${w}`;
    }
    console.log(`[mesonic] list URL: ${url.replace(session, session.substring(0, 8) + "...")}`);
    const res = await fetchTimeout(url);
    return await res.text();
  };

  console.log(`[mesonic] list Name=${params.name}`);
  let session = await getSession();
  let text = await doList(session);
  if (isSessionError(text)) {
    console.log("[mesonic] session invalid, forcing fresh login...");
    mesonicSession = null;
    session = await mesonicLogin();
    text = await doList(session);
  }
  return text;
}

// ─── Wrap an import record in the MESOWebService envelope ───
// The import XSD's root element is <MESOWebService TemplateType Template>
// containing the record element(s). The export RESPONSE uses the same envelope.
// Callers send just the bare record (e.g. <WebKontenImport>…</WebKontenImport>);
// WinLine's import parser appears to expect the full document, so we wrap it here
// unless the caller already supplied the envelope.
function wrapImportEnvelope(xmlData: string, type: number, template: string): string {
  if (/<MESOWebService[\s>]/i.test(xmlData)) return xmlData; // already wrapped
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<MESOWebService TemplateType="${type}" Template="${template}">\n` +
    `${xmlData}\n` +
    `</MESOWebService>`;
}

// ─── Mesonic import (write data) ───
async function mesonicImport(params: {
  type: number;
  template: string;
  xmlData: string;
  actionCode?: number; // 0=validate only, 1=validate+import (default)
  option?: number; // Beleg option: 0=new, 1=delivery from order, etc.
}): Promise<string> {
  const cfg = getMesonicConfig();
  const body = wrapImportEnvelope(params.xmlData, params.type, params.template);

  // Compact the envelope (drop inter-tag whitespace/newlines) to keep the GET
  // request URL short — the import is sent with `data` in the query string
  // (see doImport). This only strips whitespace *between* tags, never inside
  // element text values.
  const compactBody = body.replace(/>\s+</g, "><").trim();

  const doImport = async (session: string) => {
    const queryParams = new URLSearchParams({
      Session: session,
      Type: String(params.type),
      Vorlage: params.template,
      ActionCode: String(params.actionCode ?? 1),
      Format: "1",
    });
    if (params.option !== undefined) {
      queryParams.set("option", String(params.option));
    }
    // IMPORTANT: the import is sent over GET, not POST. A network device in
    // front of the WinLine host silently DROPS POST requests from the Supabase
    // edge IPs — every POST variant (chunked, Content-Length, Connection:close,
    // browser User-Agent, string/bytes body) times out, while GET goes through
    // (exports already work over GET). A server-side probe confirmed WinLine
    // accepts the import record as the `data` query parameter on GET and
    // returns OverallSuccess=true. So we send `data` in the query string.
    // The MDP webservice normally takes `data` as a urlencoded form field on
    // POST (whitepaper) — it accepts the same value as a GET query param.
    //
    // Proper long-term fix: allow POST from the Supabase edge IP ranges on the
    // WinLine firewall/WAF; then this can go back to POST (no URL-length cap).
    const url = `${cfg.url}/ewlservice/import?${queryParams.toString()}&data=${encodeURIComponent(compactBody)}`;
    console.log(`[mesonic] import URL (GET): ${url.replace(session, session.substring(0, 8) + "...")}`);

    // GET has a URL-length ceiling. Customer records fit easily; a large Beleg
    // (many positions) could exceed it — fail loudly rather than mysteriously.
    if (url.length > 7500) {
      throw new Error(`Mesonic import: Record zu groß für den GET-Workaround (URL ${url.length} Zeichen). POST wird von der WinLine-Firewall geblockt — bitte POST von den Supabase-Edge-IPs freischalten.`);
    }

    // Timeout after 30s to avoid Supabase Edge Function 60s hard limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      return await res.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Mesonic import timeout nach 30 Sekunden — die WinLine API hat nicht geantwortet.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  };

  console.log(`[mesonic] import Type=${params.type} Template=${params.template} ActionCode=${params.actionCode ?? 1}`);

  let session = await getSession();
  let text = await doImport(session);

  if (isSessionError(text)) {
    console.log("[mesonic] session invalid during import, forcing fresh login...");
    mesonicSession = null;
    session = await mesonicLogin();
    text = await doImport(session);
  }

  return text;
}

// Constant-time string compare for the internal shared-secret path.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Auth: staff JWT OR internal service-role key ───
// Interactive callers (the logged-in SPA) present a Supabase user JWT.
// Server-to-server callers that have no user session — currently
// export-offer-angebot, fired by the offer-acceptance DB trigger — present
// the project SERVICE_ROLE key instead. That key is itself a validly-signed
// project JWT, so it clears the gateway's verify_jwt check (unlike a plain
// shared secret); we accept it here for internal calls and leave the proxy's
// gateway enforcement ON. Everything else is rejected.
async function verifyAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.replace("Bearer ", "");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && timingSafeEqual(token, serviceKey)) return true;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !!user && !error;
}

// ─── Main handler ───
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const isAuthed = await verifyAuth(req);
    if (!isAuthed) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action } = body;

    // ── Ping / health check ──
    if (action === "ping") {
      try {
        // A cached session ID is NOT proof of liveness — the WinLine worker can
        // crash while the session envelope lingers. Actually probe the sentinel
        // Konto so ping reflects reality, and self-heal if it's dead.
        let session = await getSession();
        let alive = await verifySessionAlive(session);
        if (!alive) {
          console.log("[mesonic] ping: cached session is stale, re-login...");
          mesonicSession = null;
          session = await mesonicLogin();
          alive = await verifySessionAlive(session);
        }
        if (alive) lastVerifiedAt = Date.now();
        return new Response(
          JSON.stringify({ ok: alive, session: alive ? "active" : "stale" }),
          { status: alive ? 200 : 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Debug — login + export with full trace ──
    if (action === "debug") {
      const cfg = getMesonicConfig();
      const steps: Record<string, unknown>[] = [];

      // Step 1: login
      const loginUrl = `${cfg.url}/ewlservice/login?user=${encodeURIComponent(cfg.user)}&password=${encodeURIComponent(cfg.password)}&company=${encodeURIComponent(cfg.company)}`;
      steps.push({ step: "login_url", url: loginUrl.replace(encodeURIComponent(cfg.password), "***") });

      const loginRes = await fetchTimeout(loginUrl);
      const loginText = await loginRes.text();
      steps.push({ step: "login_response", status: loginRes.status, body: loginText });

      // Extract session
      let session = loginText.trim();
      const xmlMatch = session.match(/<string[^>]*>([^<]+)<\/string>/i);
      if (xmlMatch) session = xmlMatch[1].trim();
      if (session.startsWith("Session=")) session = session.substring("Session=".length);
      steps.push({ step: "parsed_session", value: session, length: session.length });

      // Step 2: export — try both URL-encoded and raw Key
      const { type = 1, template = "WebKontenExport", key = "*" } = body;

      // Attempt 1: Key URL-encoded (via URLSearchParams)
      const encodedUrl = `${cfg.url}/ewlservice/export?Session=${session}&Type=${type}&Vorlage=${template}&Key=${encodeURIComponent(key)}&Format=1&byref=1`;
      steps.push({ step: "export_encoded_url", url: encodedUrl });
      const encodedRes = await fetch(encodedUrl);
      const encodedText = await encodedRes.text();
      steps.push({ step: "export_encoded_response", status: encodedRes.status, body: encodedText.substring(0, 2000) });

      // Attempt 2: Key NOT URL-encoded (raw in URL)
      const rawUrl = `${cfg.url}/ewlservice/export?Session=${session}&Type=${type}&Vorlage=${template}&Key=${key}&Format=1&byref=1`;
      steps.push({ step: "export_raw_url", url: rawUrl });
      const rawRes = await fetch(rawUrl);
      const rawText = await rawRes.text();
      steps.push({ step: "export_raw_response", status: rawRes.status, body: rawText.substring(0, 2000) });

      return new Response(
        JSON.stringify({ steps }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Export (read) ──
    if (action === "export") {
      const { type, template, key } = body;
      if (type === undefined || !template || key === undefined) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: type, template, key" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawXml = await mesonicExport({ type, template, key });
      const parsed = parseEximXml(rawXml);

      if (parsed.error) {
        return new Response(
          JSON.stringify({ error: parsed.error, errorCode: parsed.errorCode }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ records: parsed.records, count: parsed.records.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Export raw (read, return unparsed XML) ──
    if (action === "export_raw") {
      const { type, template, key } = body;
      if (type === undefined || !template || key === undefined) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: type, template, key" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawXml = await mesonicExport({ type, template, key });
      return new Response(rawXml, {
        headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // ── LIST (named WinLine list, e.g. KundenArtikel) ──
    if (action === "list") {
      const { name, outputFormat, filter, where,
        datasourceSel1, datasourceSel2, datasourceSel3, datasourceSel4, companyYear } = body;
      if (!name) {
        return new Response(
          JSON.stringify({ error: "Missing required field: name" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const text = await mesonicList({
        name, outputFormat, filter, where,
        datasourceSel1, datasourceSel2, datasourceSel3, datasourceSel4, companyYear,
      });

      const fmt = String(outputFormat ?? "json").toLowerCase();
      if (fmt === "json") {
        try {
          const parsed = JSON.parse(text);
          return new Response(
            JSON.stringify({ data: parsed }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch {
          // Kein valides JSON → Rohantwort durchreichen (200), damit die
          // ECHTE WinLine-Meldung sichtbar ist (Session-/Filter-/Leer-
          // Fehler, anderes Format …), statt sie hinter einem generischen
          // Fehler zu verstecken.
          return new Response(
            JSON.stringify({ raw: text, note: "Antwort war kein JSON — siehe raw." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // pdf / andere Formate → Rohtext durchreichen
      return new Response(text, {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // ── Import dry-run (debug — shows what WOULD be sent to Mesonic) ──
    if (action === "import_debug") {
      const { type, template, xmlData, actionCode, option } = body;
      const session = await getSession();
      const queryParams = new URLSearchParams({
        Session: session,
        Type: String(type),
        Vorlage: template,
        ActionCode: String(actionCode ?? 1),
        Format: "1",
      });
      if (option !== undefined) queryParams.set("option", String(option));
      const cfg = getMesonicConfig();
      const url = `${cfg.url}/ewlservice/import?${queryParams.toString()}`;

      return new Response(
        JSON.stringify({
          debug: true,
          url: url.replace(session, session.substring(0, 8) + '...'),
          method: 'POST',
          contentType: 'application/x-www-form-urlencoded',
          formField: 'data',
          body: wrapImportEnvelope(xmlData, type, template),
          note: 'Sent as form field `data` (application/x-www-form-urlencoded). This request was NOT sent to Mesonic. Use action="import" to actually send it.',
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Import (write) ──
    if (action === "import") {
      const { type, template, xmlData, actionCode, option } = body;
      if (type === undefined || !template || !xmlData) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: type, template, xmlData" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawXml = await mesonicImport({ type, template, xmlData, actionCode, option });

      return new Response(
        JSON.stringify({ result: rawXml }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Use "export", "export_raw", "import", or "ping".` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[mesonic-proxy] error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
