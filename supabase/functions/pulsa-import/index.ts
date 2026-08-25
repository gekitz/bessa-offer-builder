import { CsvParseStream } from "https://deno.land/std@0.224.0/csv/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// Pulsa price-list import (CSV → pulsa_items)
// ═══════════════════════════════════════════════════════
//
// Pulsa has no API but publishes a personalised price-list CSV. We mirror
// the columns we need into pulsa_items so orders/compare can look up the
// Bestellnummer (ARTIKELNUMMER), Einkaufspreis (EK_NET) and stock by
// EAN / manufacturer number — without re-downloading ~10 MB each time.
//
// The CSV is semicolon-delimited with quoted, multi-line description
// fields, so it MUST be parsed with a real CSV parser (streamed here to
// keep memory bounded). Prices use German decimals ("1.234,56").
//
// POST /pulsa-import  (requires a valid Supabase user JWT)
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          PULSA_PRICELIST_URL (the personalised CSV feed URL)
// Deploy:  supabase functions deploy pulsa-import

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

// German number: thousands '.', decimal ',' → JS number, or null.
function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function int(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(String(s).replace(/\./g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

interface PulsaRow {
  artikelnummer: string;
  name: string | null;
  herstellernummer: string | null;
  ean: string | null;
  ek_net: number | null;
  vk_net: number | null;
  verfuegbar: number | null;
}

function mapRow(r: Record<string, string>): PulsaRow | null {
  const artikelnummer = (r.ARTIKELNUMMER ?? "").trim();
  if (!artikelnummer) return null;
  return {
    artikelnummer,
    name: r.NAME_DE?.trim() || null,
    herstellernummer: r.HERSTELLERNUMMER?.trim() || null,
    ean: r.EAN?.trim() || null,
    ek_net: num(r.EK_NET),
    vk_net: num(r.VK_NET),
    // "available at least N" — the useful numeric stock signal in the feed.
    verfuegbar: int(r.VERFUEGBAR_GROESSERGLEICH),
  };
}

// Allowed callers: a logged-in user (from the app button) OR the nightly
// pg_cron job, which presents the shared CRON_SECRET as its bearer token.
async function verifyAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && token === cronSecret) return true;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser(token);
  return !!user && !error;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!(await verifyAuth(req))) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("PULSA_PRICELIST_URL");
    if (!url) return json({ error: "PULSA_PRICELIST_URL nicht gesetzt." }, 400);

    // Service-role client for the bulk upsert (server-to-server write).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const res = await fetch(url);
    if (!res.ok || !res.body) {
      return json({ error: `Preisliste nicht erreichbar (HTTP ${res.status}).` }, 502);
    }

    const stream = res.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new CsvParseStream({ separator: ";", skipFirstRow: true }));

    let imported = 0;
    let batch: PulsaRow[] = [];
    const seen = new Set<string>();

    async function flush() {
      if (batch.length === 0) return;
      const { error } = await admin.from("pulsa_items").upsert(batch, { onConflict: "artikelnummer" });
      if (error) throw new Error(error.message);
      imported += batch.length;
      batch = [];
    }

    for await (const row of stream) {
      const mapped = mapRow(row as Record<string, string>);
      if (!mapped || seen.has(mapped.artikelnummer)) continue;
      seen.add(mapped.artikelnummer);
      batch.push(mapped);
      if (batch.length >= 500) await flush();
    }
    await flush();

    return json({ ok: true, imported });
  } catch (err) {
    console.error("[pulsa-import] error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
