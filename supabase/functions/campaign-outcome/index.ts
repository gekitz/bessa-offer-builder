import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  applyOutcome,
  isRksvOutcome,
  type OutcomeClient,
  type RecipientRow,
  type RksvOutcomePayload,
} from './outcomeWriteBack.ts';

// ═══════════════════════════════════════════════════════════════════
// campaign-outcome — öffentlicher Terminal-Handler der Landing-Page (M2/M3)
//
// Von der ANONYMEN Kampagnen-Landing-Page (?c={token}, ohne Login)
// aufgerufen. Der Empfänger-Token IST das Credential: die Funktion lädt die
// Zeile per token und weigert sich bei allem anderen; dann stempelt sie das
// Outcome + führt den Viertl-Write-back (Flag + Notiz) mit dem
// SERVICE-ROLE-Key aus — sodass der öffentliche Client NIE direkt auf
// viertl_* schreibt (M2). Der Idempotenz-Guard (M3) sitzt in applyOutcome
// (compare-and-set). Spiegelt notify-viertl-closure (Service-Role für
// Viertl-Writes) + send-campaign (Body-Credential, verify_jwt=false).
//
// POST body: { token, outcome, payload? }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy:  supabase functions deploy campaign-outcome   (MANUELL)
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json().catch(() => ({}));
    const { token, outcome, payload } = body as {
      token?: string;
      outcome?: string;
      payload?: RksvOutcomePayload;
    };

    if (!token) return json({ error: 'Missing token.' }, 400);
    if (!isRksvOutcome(outcome)) return json({ error: 'Ungültiges Outcome.' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Empfänger per Token laden (Service-Role). Der Token bindet die
    // Blast-Radius auf genau diese eine Zeile.
    const { data: recipient, error: loadErr } = await admin
      .from('campaign_recipients')
      .select('*')
      .eq('token', token)
      .limit(1)
      .maybeSingle();
    if (loadErr) return json({ error: loadErr.message }, 500);
    if (!recipient) return json({ error: 'Empfänger nicht gefunden.' }, 404);

    const result = await applyOutcome(
      admin as unknown as OutcomeClient,
      recipient as RecipientRow,
      outcome,
      payload ?? {},
    );

    // Frische Zeile zurückgeben (nach dem Stamp), damit der Client den
    // aktualisierten Zustand mappen kann.
    const { data: fresh } = await admin
      .from('campaign_recipients')
      .select('*')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    return json({ ok: true, idempotent: result.idempotent, recipient: fresh ?? recipient });
  } catch (err) {
    console.error('campaign-outcome error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
