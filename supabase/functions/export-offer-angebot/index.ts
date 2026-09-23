// Accepted offer → WinLine-Angebot (Belegart 17).
//
// Fired asynchronously by the offer-acceptance DB trigger (migration
// 20260922120000_offer_mesonic_angebot.sql) via pg_net, for BOTH acceptance
// paths (signature + Stripe), exactly like notify-offer-accepted. Builds
// freetext Beleg positions from the offer's frozen lineSnapshot and imports
// them through the mesonic-proxy so the accounting team find the offer in
// WinLine.
//
// Inputs (POST JSON body):
//   offerId: string   — offers.id (required)
//
// Auth: shared-secret (CRON_SECRET), same scheme as notify-offer-accepted.
// The caller (the DB trigger via pg_net) presents `Authorization: Bearer
// <CRON_SECRET>`. verify_jwt is disabled in config.toml. Calls ONWARD to the
// mesonic-proxy present the SERVICE_ROLE key (a valid project JWT that clears
// the proxy's gateway), which the proxy accepts for internal calls.
//
// Idempotent: skips offers that already carry a mesonic_beleg_key. Offers
// without a linked WinLine customer are flagged 'skipped_no_customer' (no
// export) so staff can link the customer and retry from the offer detail.
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (required)
//
// Deploy:
//   supabase functions deploy export-offer-angebot

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildOfferAngebotImport,
  offerBelegKey,
  standortFromId,
  type MesonicStandort,
  type OfferLineSnapshot,
  type OfferBelegSummary,
} from '../_shared/offerAngebot.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BELEGE_TYPE = 30;
const BELEGE_TEMPLATE = 'WEBBelege';
const BELEGE_BATCH_SIZE = 25;
const MAX_LAUFNUMMER_SCAN = 400; // safety cap for the max-laufnummer scan

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// YYYY-MM-DD from an ISO timestamp (acceptance date).
function isoDate(ts: string | null | undefined): string | undefined {
  if (!ts) return undefined;
  const d = String(ts).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}

// ── Mesonic-proxy calls (server-to-server, CRON_SECRET) ──────────────────
async function proxyExportRaw(base: string, secret: string, key: string): Promise<string> {
  const res = await fetch(`${base}/functions/v1/mesonic-proxy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'export_raw', type: BELEGE_TYPE, template: BELEGE_TEMPLATE, key }),
  });
  if (!res.ok) throw new Error(`mesonic-proxy export_raw HTTP ${res.status}: ${await res.text()}`);
  return await res.text();
}

async function proxyImport(base: string, secret: string, xmlData: string): Promise<{ ok: boolean; voucherNumber?: string; error?: string }> {
  const res = await fetch(`${base}/functions/v1/mesonic-proxy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import', type: BELEGE_TYPE, template: 'WEBAngebot', xmlData, actionCode: 1 }),
  });
  if (!res.ok) return { ok: false, error: `mesonic-proxy import HTTP ${res.status}: ${await res.text()}` };
  const data = await res.json().catch(() => ({}));
  const xml: string = data.result || '';
  const success = xml.match(/<OverallSuccess>(.*?)<\/OverallSuccess>/i);
  if (success && success[1].toLowerCase() === 'false') {
    const code = xml.match(/<ErrorCode>(.*?)<\/ErrorCode>/)?.[1] ?? 'unknown';
    const textErr = xml.match(/<ErrorText>(.*?)<\/ErrorText>/)?.[1] ?? 'Unbekannter Fehler';
    return { ok: false, error: `${code}: ${textErr}` };
  }
  // WinLine echoes the created Beleg number in <VoucherNumber> (or <KeyValue>).
  const vn = xml.match(/<VoucherNumber>(\d+)<\/VoucherNumber>/)?.[1]
    ?? xml.match(/<KeyValue>(.*?)<\/KeyValue>/)?.[1]?.trim();
  return { ok: true, voucherNumber: vn && vn !== '+' ? vn : undefined };
}

// Höchste bereits vergebene Laufnummer eines Kontos — server-seitiges
// Pendant zu readMaxLaufnummer (runTicketBelegExport). Scannt <konto>-<n> in
// 25er-Batches über den bewährten WEBBelege-Export-Weg und stoppt nach einem
// komplett leeren Batch (Belegnummern sind fortlaufend). Nur Regex, kein DOM.
async function readMaxLaufnummer(base: string, secret: string, konto: string): Promise<number> {
  let max = 0;
  for (let start = 1; start <= MAX_LAUFNUMMER_SCAN; start += BELEGE_BATCH_SIZE) {
    const size = Math.min(BELEGE_BATCH_SIZE, MAX_LAUFNUMMER_SCAN - start + 1);
    const keys = Array.from({ length: size }, (_, i) => `'${konto}-${start + i}'`).join(',');
    let xml = '';
    try {
      xml = await proxyExportRaw(base, secret, keys);
    } catch {
      break; // Export-Fehler: nicht weiter hämmern, mit bisherigem max weiter
    }
    if (/<OverallSuccess>\s*false/i.test(xml)) break;

    // BELEGKEYs, die eine Position (T026) tragen = echte, nicht-leere Belege.
    const withPositions = new Set<string>();
    for (const m of xml.matchAll(/<WEBBelegeT026>([\s\S]*?)<\/WEBBelegeT026>/g)) {
      const bk = m[1].match(/<BELEGKEY>(.*?)<\/BELEGKEY>/)?.[1]?.trim();
      if (bk) withPositions.add(bk);
    }
    let batchMax = 0;
    for (const m of xml.matchAll(/<WEBBelegeT025>([\s\S]*?)<\/WEBBelegeT025>/g)) {
      const block = m[1];
      const bk = block.match(/<BELEGKEY>(.*?)<\/BELEGKEY>/)?.[1]?.trim();
      const lauf = Number(block.match(/<Laufnummer>(.*?)<\/Laufnummer>/)?.[1] ?? 0);
      if (bk && withPositions.has(bk) && lauf > batchMax) batchMax = lauf;
    }
    if (batchMax === 0) break; // leerer Batch → Ende erreicht
    if (batchMax > max) max = batchMax;
  }
  return max;
}

interface OfferRow {
  id: string;
  status: string | null;
  signed_at: string | null;
  accepted_at: string | null;
  creator_id: string | null;
  mesonic_customer_id: string | null;
  mesonic_beleg_key: string | null;
  offer_data: Record<string, unknown> | null;
}

// Angebots-Ersteller → Standort (KL/WO-Suffix des Pseudoartikels) +
// Vertreternummer. Join offers.creator_id → employees.code, wie ticketApi es
// über employees.id macht. Fällt auf Klagenfurt zurück, wenn nicht auflösbar
// (Pseudoartikel muss existieren; KL ist der sichere Default).
async function resolveCreatorMesonic(
  supabase: ReturnType<typeof createClient>,
  creatorId: string | null | undefined,
): Promise<{ standort: MesonicStandort; vertreternummer?: string }> {
  if (!creatorId) return { standort: 'klagenfurt' };
  const { data } = await supabase
    .from('employees')
    .select('standort_id, mesonic_rep_id')
    .eq('code', creatorId)
    .maybeSingle<{ standort_id: number | null; mesonic_rep_id: string | null }>();
  return {
    standort: standortFromId(data?.standort_id),
    vertreternummer: data?.mesonic_rep_id ?? undefined,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!supabaseUrl || !serviceKey || !cronSecret) {
    return jsonResponse({ error: 'Missing required environment variables' }, 500);
  }

  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const presented = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!presented || !timingSafeEqual(presented, cronSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({})) as { offerId?: string };
    const offerId = body.offerId;
    if (!offerId) return jsonResponse({ error: 'offerId is required' }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('id, status, signed_at, accepted_at, creator_id, mesonic_customer_id, mesonic_beleg_key, offer_data')
      .eq('id', offerId)
      .single<OfferRow>();
    if (offerErr || !offer) return jsonResponse({ error: 'Offer not found', details: offerErr?.message }, 404);

    // Idempotency: already exported.
    if (offer.mesonic_beleg_key) {
      return jsonResponse({ skipped: true, reason: 'already_exported', belegKey: offer.mesonic_beleg_key });
    }
    // Defensive: only for genuinely accepted offers (the trigger already guards).
    if (!offer.signed_at && !offer.accepted_at && offer.status !== 'accepted') {
      return jsonResponse({ skipped: true, reason: 'not_accepted' });
    }

    const konto = (offer.mesonic_customer_id || '').trim();
    if (!konto) {
      // No WinLine customer linked → flag for staff follow-up, do not export.
      await supabase.from('offers')
        .update({ mesonic_beleg_status: 'skipped_no_customer' })
        .eq('id', offer.id);
      return jsonResponse({ skipped: true, reason: 'no_mesonic_customer' });
    }

    // Build lines + summary from the frozen snapshots.
    const od = offer.offer_data ?? {};
    const lines = (Array.isArray(od.lineSnapshot) ? od.lineSnapshot : []) as OfferLineSnapshot[];
    const snap = (od.acceptSnapshot ?? {}) as Record<string, unknown>;
    const summary: OfferBelegSummary = {
      periodTotal: num(snap.periodTotal),
      monthly: num(snap.monthly),
      once: num(snap.once),
      maxMonths: num(snap.maxMonths) || 12,
      takeBack: num(snap.takeBack),
      rabattActive: !!od.rabattActive,
    };

    // Standort (KL/WO-Pseudoartikel) + Vertreternummer aus dem Ersteller.
    const { standort, vertreternummer } = await resolveCreatorMesonic(supabase, offer.creator_id);

    const laufnummer = (await readMaxLaufnummer(supabaseUrl, serviceKey, konto)) + 1;
    const belegKey = offerBelegKey(konto, laufnummer);
    const datumAngebot = isoDate(offer.accepted_at) ?? isoDate(offer.signed_at);

    const xml = buildOfferAngebotImport(
      { kontonummer: konto, laufnummer, datumAngebot, vertreternummer },
      lines,
      summary,
      standort,
    );
    const res = await proxyImport(supabaseUrl, serviceKey, xml);

    if (!res.ok) {
      await supabase.from('offers')
        .update({ mesonic_beleg_status: 'failed', mesonic_beleg_error: (res.error ?? 'Import fehlgeschlagen').slice(0, 500) })
        .eq('id', offer.id);
      return jsonResponse({ ok: false, error: res.error }, 502);
    }

    await supabase.from('offers')
      .update({
        mesonic_beleg_laufnummer: laufnummer,
        mesonic_beleg_key: belegKey,
        mesonic_beleg_number: res.voucherNumber ?? String(laufnummer),
        mesonic_beleg_status: 'exported',
        mesonic_beleg_error: null,
        mesonic_beleg_created_at: new Date().toISOString(),
      })
      .eq('id', offer.id);

    return jsonResponse({ ok: true, belegKey, laufnummer, voucherNumber: res.voucherNumber });
  } catch (err) {
    console.error('export-offer-angebot: unexpected error', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
