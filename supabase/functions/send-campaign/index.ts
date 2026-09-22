import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════════
// send-campaign — typ-agnostischer Kampagnen-Sender
//
// Spiegelt send-offer (Resend-POST, KITZ-HTML-Chrome, deterministische
// Message-ID) liest aber aus campaigns/campaign_recipients. Staff-invoked
// aus dem Kampagnen-Back-Office → verify_jwt=true (siehe config.toml).
//
// Idempotenz: der DB-Unique-Index uq_campaign_recipients_subject verhindert
// doppelte ENROLMENT, nicht doppelte SENDS. Um das Double-Send-Fenster bei
// Teil-Fehlern zu verkleinern, stempeln wir sent_at OPTIMISTISCH vor dem
// Resend-Call und räumen es bei Fehler wieder ab; ein Re-Run überspringt so
// bereits versendete Zeilen. Der Versand bleibt at-least-once — bei einem
// Fn-Timeout NACH dem Resend-Call, aber vor dem sent_at-Stempel, kann eine
// Zeile in einem Re-Run erneut gesendet werden (kleines Restfenster).
//
// No-E-Mail-Segment (email IS NULL) wird NIE versendet → Druck-Fallback im
// Back-Office. Kampagnen-Sends schreiben KEINE email_events (die Tabelle ist
// offer-scoped); die Zuordnung läuft über campaign_recipients.resend_id +
// resend-webhook.
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

const MAX_BATCH = 200;          // Guardrail gegen versehentliche 300-Burst
const THROTTLE_MS = 120;        // Pause zwischen zwei Resend-Calls
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

// KITZ-Chrome um den (pro Kampagne editierbaren) Inline-HTML-Body + eine
// CTA-Schaltfläche auf die Landing-URL.
function renderEmail(opts: {
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  recipientName: string;
}): string {
  const { bodyHtml, ctaLabel, ctaUrl, recipientName } = opts;
  // {name}-Interpolation im Body.
  const body = bodyHtml.replace(/\{name\}/g, esc(recipientName));
  return `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#32373c;padding:24px 32px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:8px 16px;border-radius:8px;font-size:18px;">KITZ</div>
      <div style="color:#ffffff;margin-top:8px;font-size:14px;">Computer &amp; Office GmbH</div>
    </div>
    <div style="padding:32px;">
      <div style="color:#475569;font-size:15px;line-height:1.6;">${body}</div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${ctaUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:8px;font-size:15px;">
          ${esc(ctaLabel)}
        </a>
      </div>
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px;">
        <div style="color:#64748b;font-size:13px;">Kitz Computer &amp; Office GmbH</div>
        <div style="color:#64748b;font-size:13px;">www.kitz.co.at</div>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <div style="color:#94a3b8;font-size:11px;">
        Kitz Computer &amp; Office GmbH | Johann-Offner-Str. 17, 9400 Wolfsberg | Rosentalerstr. 1, 9020 Klagenfurt
      </div>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { campaignId, recipientIds, batch, resend } = await req.json();

    if (!campaignId || !Array.isArray(recipientIds) || !batch) {
      return json({ error: 'campaignId, recipientIds und batch sind erforderlich' }, 400);
    }
    if (recipientIds.length === 0) {
      return json({ ok: true, sent: 0, skipped: 0, noEmail: 0, failed: 0, batch });
    }
    if (recipientIds.length > MAX_BATCH) {
      return json({ error: `Zu viele Empfänger (max. ${MAX_BATCH} pro Welle)` }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const publicAppUrl = Deno.env.get('PUBLIC_APP_URL') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Kampagne laden.
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    if (campErr || !campaign) return json({ error: 'Kampagne nicht gefunden' }, 404);
    if (campaign.status === 'archived') return json({ error: 'Kampagne archiviert' }, 400);

    // 2) Ausgewählte Empfänger laden.
    const { data: recipients, error: recErr } = await supabase
      .from('campaign_recipients')
      .select('*')
      .in('id', recipientIds);
    if (recErr) return json({ error: recErr.message }, 500);

    const ctaLabel = campaign.type === 'pos_replacement' ? 'Angebot ansehen' : 'Jetzt erledigen';
    const bodyHtml = campaign.email_template || '';
    const subject = campaign.email_subject || campaign.title || 'Nachricht von Kitz Computer & Office GmbH';

    let sent = 0;
    let skipped = 0;
    let noEmail = 0;
    let failed = 0;

    for (const row of recipients ?? []) {
      // 3) Idempotenz-Partition.
      if (!row.email) { noEmail++; continue; }
      if (row.sent_at && !resend) { skipped++; continue; }

      const ctaUrl = publicAppUrl ? `${publicAppUrl}/?c=${row.token}` : `/?c=${row.token}`;
      const html = renderEmail({ bodyHtml, ctaLabel, ctaUrl, recipientName: row.name || 'Kunde' });

      // Optimistisch sent_at stempeln, damit ein Re-Run diese Zeile
      // überspringt, falls der Fn nach dem Resend-Call abbricht.
      const nowIso = new Date().toISOString();
      await supabase
        .from('campaign_recipients')
        .update({ sent_at: nowIso, batch })
        .eq('id', row.id);

      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Kitz Computer & Office GmbH <angebote@kitz.co.at>',
            to: [row.email],
            subject,
            html,
            headers: { 'Message-ID': `<campaign-${row.id}@offer.kitz.co.at>` },
          }),
        });
        const resendData = await resendRes.json();
        if (!resendRes.ok) {
          // Optimistischen Stempel wieder abräumen (nur wenn wir gerade
          // gesetzt haben — bei resend blieb der alte sent_at ohnehin).
          if (!resend) {
            await supabase.from('campaign_recipients').update({ sent_at: null }).eq('id', row.id);
          }
          failed++;
          continue;
        }
        // Erfolg: resend_id + (bei Folge-Welle) resend_count erhöhen. Die
        // Erhöhung ist read-modify-write aus der bereits geladenen Zeile —
        // racy nur bei zwei gleichzeitigen Wellen derselben Kampagne.
        const patch: Record<string, unknown> = { resend_id: resendData.id };
        if (resend) patch.resend_count = (row.resend_count ?? 0) + 1;
        await supabase.from('campaign_recipients').update(patch).eq('id', row.id);
        sent++;
      } catch (err) {
        if (!resend) {
          await supabase.from('campaign_recipients').update({ sent_at: null }).eq('id', row.id);
        }
        console.error('send-campaign row error:', err);
        failed++;
      }

      await sleep(THROTTLE_MS);
    }

    return json({ ok: true, sent, skipped, noEmail, failed, batch });
  } catch (err) {
    console.error('send-campaign error:', err);
    return json({ error: err.message }, 500);
  }
});
