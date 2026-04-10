import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
// Note: Supabase Edge Functions are stateless — each invocation may run
// in a different isolate. We keep a session cache that works within a
// single isolate's lifetime, but always fall back to fresh login.
let mesonicSession: string | null = null;
let sessionTimestamp = 0;
const SESSION_MAX_AGE_MS = 4 * 60 * 1000; // re-login after 4 min (WinLine timeout is ~5 min)

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
  const res = await fetch(loginUrl);
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
  return session;
}

// ─── Get or refresh session ───
async function getSession(): Promise<string> {
  const age = Date.now() - sessionTimestamp;
  if (mesonicSession && age < SESSION_MAX_AGE_MS) {
    return mesonicSession;
  }
  return await mesonicLogin();
}

// ─── Check if response indicates a session error ───
function isSessionError(text: string): boolean {
  return text.includes("001001") || text.includes("001002") ||
    text.toLowerCase().includes("session was not found") ||
    text.toLowerCase().includes("no webservice session");
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
    const res = await fetch(url);
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

  return text;
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
    const url = `${cfg.url}/ewlservice/import?${queryParams.toString()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: params.xmlData,
    });
    return await res.text();
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

// ─── Parse Mesonic XML response to JSON ───
// Mesonic XML formats:
//   Success: <MESOWebService TemplateType="1" Template="X"><X><Field>val</Field>...</X><X>...</X></MESOWebService>
//   Error:   <MESOWebServiceResult><OverallSuccess>false</OverallSuccess><ResultDetails><ErrorCode>000161</ErrorCode><ErrorText>...</ErrorText></ResultDetails></MESOWebServiceResult>
function parseEximXml(xml: string): { error?: string; errorCode?: string; records: Record<string, string>[] } {
  // Check for error responses
  const successMatch = xml.match(/<OverallSuccess>(\w+)<\/OverallSuccess>/i);
  if (successMatch && successMatch[1].toLowerCase() === "false") {
    const codeMatch = xml.match(/<ErrorCode>(\d+)<\/ErrorCode>/i);
    const textMatch = xml.match(/<ErrorText>([^<]*)<\/ErrorText>/i);
    return {
      error: textMatch ? textMatch[1] : "Unknown Mesonic error",
      errorCode: codeMatch ? codeMatch[1] : undefined,
      records: [],
    };
  }

  // Also check if the entire response is just an error code
  const trimmed = xml.trim();
  if (/^\d{6}$/.test(trimmed)) {
    return { error: `Mesonic error code: ${trimmed}`, errorCode: trimmed, records: [] };
  }

  const records: Record<string, string>[] = [];

  // Extract template name from wrapper: <MESOWebService Template="WebKontenExport">
  // Records are direct children of MESOWebService, tagged with the template name
  const templateMatch = xml.match(/<MESOWebService[^>]*Template="([^"]+)"[^>]*>/i);
  const templateTag = templateMatch ? templateMatch[1] : null;

  if (templateTag) {
    // Match all <TemplateName>...</TemplateName> record blocks
    const recordRegex = new RegExp(
      `<${templateTag}>([\\s\\S]*?)<\\/${templateTag}>`,
      "gi"
    );
    let recordMatch;
    while ((recordMatch = recordRegex.exec(xml)) !== null) {
      const recordXml = recordMatch[1];
      const fields: Record<string, string> = {};
      const fieldRegex = /<([A-Za-z0-9_.\-]+)>([\s\S]*?)<\/\1>/g;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(recordXml)) !== null) {
        fields[fieldMatch[1]] = fieldMatch[2].trim();
      }
      if (Object.keys(fields).length > 0) {
        records.push(fields);
      }
    }
  }

  // Fallback: try generic Record/Datensatz tags
  if (records.length === 0) {
    const recordRegex = /<(?:Record|Datensatz)\b[^>]*>([\s\S]*?)<\/(?:Record|Datensatz)>/gi;
    let recordMatch;
    while ((recordMatch = recordRegex.exec(xml)) !== null) {
      const recordXml = recordMatch[1];
      const fields: Record<string, string> = {};
      const fieldRegex = /<([A-Za-z0-9_.\-]+)>([\s\S]*?)<\/\1>/g;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(recordXml)) !== null) {
        fields[fieldMatch[1]] = fieldMatch[2].trim();
      }
      if (Object.keys(fields).length > 0) {
        records.push(fields);
      }
    }
  }

  // Fallback: parse as flat fields (skip known wrappers)
  if (records.length === 0 && xml.includes("<")) {
    const fields: Record<string, string> = {};
    const fieldRegex = /<([A-Za-z0-9_.\-]+)>([^<]*)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(xml)) !== null) {
      const tag = fieldMatch[1];
      if (!["MESOWebService", "MESOWebServiceResult", "OverallSuccess", "ResultDetails", "string", "xml"].includes(tag)) {
        fields[tag] = fieldMatch[2].trim();
      }
    }
    if (Object.keys(fields).length > 0) {
      records.push(fields);
    }
  }

  return { records };
}

// ─── JWT verification ───
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
        await getSession();
        return new Response(
          JSON.stringify({ ok: true, session: "active" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      const loginRes = await fetch(loginUrl);
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
