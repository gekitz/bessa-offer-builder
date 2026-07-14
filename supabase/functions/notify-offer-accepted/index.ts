// Notify the offer creator (sales rep) when a customer accepts an offer.
// Fires for BOTH acceptance paths because it's invoked by a single
// AFTER UPDATE trigger on `offers` (see migration
// 20260714130000_notify_offer_accepted.sql):
//   • signature → signed_at set (offerApi.acceptOfferWithSignature, anon)
//   • payment   → accepted_at set / status='accepted' (stripe-complete-acceptance)
//
// Delivery is best-effort per channel: a failed email doesn't block push
// and vice-versa. The function never fails the triggering transaction —
// pg_net fires it asynchronously and ignores the response.
//
// Inputs (POST JSON body):
//   offerId: string   — offers.id (required)
//
// Auth: shared-secret, same scheme as daily-followup-digest. The caller
// (the DB trigger via pg_net) presents `Authorization: Bearer <CRON_SECRET>`.
// verify_jwt is disabled in config.toml.
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET (required)
//   NOTIFY_FROM   — From header (default 'Kitz Computer & Office GmbH <angebote@kitz.co.at>')
//   PUBLIC_APP_URL — SPA origin; when set the email/push deep-link back to the offer
//
// Deploy:
//   supabase functions deploy notify-offer-accepted

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OfferRow {
  id: string;
  share_code: string | null;
  customer_name: string | null;
  customer_company: string | null;
  creator_email: string | null;
  creator_name: string | null;
  total_monthly: number | null;
  total_once: number | null;
  total_period: number | null;
  payment_status: string | null;
  signed_at: string | null;
  accepted_at: string | null;
}

function fmtEur(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0;
  return new Intl.NumberFormat('de-AT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  }).format(v);
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sendPush(opts: {
  supabaseUrl: string;
  serviceKey: string;
  employeeIds: string[];
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ ok: boolean; result?: unknown; error?: unknown }> {
  if (opts.employeeIds.length === 0) return { ok: true, result: 'no recipients' };
  try {
    const res = await fetch(`${opts.supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        employeeIds: opts.employeeIds,
        title: opts.title,
        body: opts.body,
        url: opts.url,
        tag: opts.tag,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('send-push fan-out failed:', data);
      return { ok: false, error: data };
    }
    return { ok: true, result: data };
  } catch (err) {
    console.warn('send-push invoke failed:', err);
    return { ok: false, error: String(err) };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const fromAddr = Deno.env.get('NOTIFY_FROM')
    || 'Kitz Computer & Office GmbH <angebote@kitz.co.at>';
  const appBaseUrl = Deno.env.get('PUBLIC_APP_URL') || null;

  if (!supabaseUrl || !serviceKey || !resendApiKey || !cronSecret) {
    return jsonResponse({ error: 'Missing required environment variables' }, 500);
  }

  // Reject any caller that doesn't present the shared secret.
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const presented = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!presented || presented.length !== cronSecret.length || !timingSafeEqual(presented, cronSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({})) as { offerId?: string };
    const offerId = body.offerId;
    if (!offerId) {
      return jsonResponse({ error: 'offerId is required' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('id, share_code, customer_name, customer_company, creator_email, creator_name, total_monthly, total_once, total_period, payment_status, signed_at, accepted_at')
      .eq('id', offerId)
      .single<OfferRow>();

    if (offerErr || !offer) {
      return jsonResponse({ error: 'Offer not found', details: offerErr?.message }, 404);
    }

    // Defensive: only notify for genuinely accepted offers. The trigger
    // already guards on the acceptance transition, but this keeps the
    // function safe if invoked directly.
    if (!offer.signed_at && !offer.accepted_at) {
      return jsonResponse({ skipped: true, reason: 'offer not accepted' });
    }

    const who = offer.customer_company || offer.customer_name || 'Ein Kunde';
    const paid = offer.payment_status === 'active';
    const link = appBaseUrl ? `${appBaseUrl}/?offer=${encodeURIComponent(offer.id)}` : null;

    // ── Email to the creator ────────────────────────────────────────
    let emailResult: unknown = 'skipped';
    if (offer.creator_email) {
      const totalsRows: string[] = [];
      if (offer.total_monthly) totalsRows.push(`Monatlich: <strong>${fmtEur(offer.total_monthly)}</strong>`);
      if (offer.total_period) totalsRows.push(`Laufzeitsumme: <strong>${fmtEur(offer.total_period)}</strong>`);
      if (offer.total_once) totalsRows.push(`Einmalig: <strong>${fmtEur(offer.total_once)}</strong>`);

      const html = `<!DOCTYPE html>
<html lang="de"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#16a34a;color:#fff;padding:20px 24px;">
      <div style="font-size:13px;opacity:.85;letter-spacing:.04em;text-transform:uppercase;">Angebot angenommen</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(who)}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">Hallo ${escapeHtml(offer.creator_name) || 'Kollege'},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        <strong>${escapeHtml(who)}</strong> hat soeben dein Angebot
        ${paid ? 'per Zahlung' : 'durch Unterschrift'} verbindlich angenommen. 🎉
      </p>
      ${totalsRows.length ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.9;">${totalsRows.join('<br>')}</div>` : ''}
      ${link ? `<div style="margin-top:24px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Angebot öffnen</a></div>` : ''}
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">Ein Auftrags-Ticket wurde automatisch angelegt.</p>
    </div>
  </div>
</body></html>`;

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [offer.creator_email],
          subject: `✅ Angebot angenommen: ${who}`,
          html,
        }),
      });
      const resendData = await resendRes.json();
      emailResult = resendRes.ok ? { id: resendData.id } : { error: resendData };
      if (!resendRes.ok) console.warn('notify-offer-accepted: Resend error', resendData);
    }

    // ── Web push to the creator's devices ───────────────────────────
    // Map creator_email → employees.id, then fan out via send-push.
    let pushResult: unknown = 'skipped';
    if (offer.creator_email) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .ilike('email', offer.creator_email)
        .maybeSingle<{ id: string }>();
      if (emp?.id) {
        pushResult = (await sendPush({
          supabaseUrl,
          serviceKey,
          employeeIds: [emp.id],
          title: 'Angebot angenommen 🎉',
          body: `${who} hat dein Angebot ${paid ? 'per Zahlung' : 'durch Unterschrift'} angenommen.`,
          url: link ? `/?offer=${encodeURIComponent(offer.id)}` : '/',
          tag: `offer-accepted-${offer.id}`,
        })).result ?? 'sent';
      } else {
        pushResult = 'no matching employee';
      }
    }

    return jsonResponse({ ok: true, email: emailResult, push: pushResult });
  } catch (err) {
    console.error('notify-offer-accepted: unexpected error', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
