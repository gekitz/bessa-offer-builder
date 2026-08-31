import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Täglicher „Aktion nötig"-Nag PRO ERSTELLER: liegengebliebene Entwürfe
// (nie versendet) + versendete Angebote ohne Aktivität. Jeder Ersteller
// bekommt NUR seine eigenen — per E-Mail (Resend) und Push (send-push).
//
// Ausgelöst von pg_cron (Migration), Body leer. Kriterien sind mit
// src/features/offers/lib/needsAction.ts gespiegelt (Entwurf > 3 Tage,
// gesendet > 7 Tage ohne Aktivität).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injiziert), RESEND_API_KEY,
//      CRON_SECRET. Optional: DIGEST_FROM, PUBLIC_APP_URL.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DRAFT_STALE_DAYS = 3;
const SENT_STALE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

interface OfferRow {
  id: string;
  status: string | null;
  stage: string | null;
  created_at: string | null;
  sent_at: string | null;
  last_activity_at: string | null;
  creator_id: string | null;
  creator_name: string | null;
  creator_email: string | null;
  customer_name: string | null;
  customer_company: string | null;
  total_period: number | null;
  total_monthly: number | null;
}

type Reason = 'draft_unsent' | 'sent_no_action';

function actionReason(o: OfferRow, nowMs: number): Reason | null {
  if (o.status === 'draft' && o.created_at && nowMs - Date.parse(o.created_at) >= DRAFT_STALE_DAYS * DAY) {
    return 'draft_unsent';
  }
  if (o.stage === 'offer_sent' && o.sent_at && nowMs - Date.parse(o.sent_at) >= SENT_STALE_DAYS * DAY) {
    const la = o.last_activity_at ? Date.parse(o.last_activity_at) : 0;
    if (nowMs - la >= SENT_STALE_DAYS * DAY) return 'sent_no_action';
  }
  return null;
}

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
function ageDays(iso: string | null, nowMs: number): number {
  return iso ? Math.floor((nowMs - Date.parse(iso)) / DAY) : 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const fromAddr = Deno.env.get('DIGEST_FROM') || 'Kitz Computer & Office GmbH <angebote@kitz.co.at>';
  const appBaseUrl = Deno.env.get('PUBLIC_APP_URL') || '';

  if (!supabaseUrl || !serviceKey || !resendApiKey || !cronSecret) {
    return json({ error: 'Missing required environment variables' }, 500);
  }
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented || presented.length !== cronSecret.length || !timingSafeEqual(presented, cronSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const now = Date.now();

    const { data, error } = await supabase
      .from('offers')
      .select('id, status, stage, created_at, sent_at, last_activity_at, creator_id, creator_name, creator_email, customer_name, customer_company, total_period, total_monthly')
      .in('stage', ['new', 'offer_sent']);
    if (error) return json({ error: 'Query failed', details: error.message }, 500);

    const stale = (data as OfferRow[] ?? [])
      .map((o) => ({ o, reason: actionReason(o, now) }))
      .filter((x) => x.reason) as { o: OfferRow; reason: Reason }[];

    if (stale.length === 0) return json({ ok: true, sent: 0, reason: 'nothing stale' });

    // Nach Ersteller-E-Mail gruppieren (ohne E-Mail → nicht erreichbar, skip).
    const byCreator = new Map<string, { name: string; items: { o: OfferRow; reason: Reason }[] }>();
    for (const x of stale) {
      const email = (x.o.creator_email || '').trim().toLowerCase();
      if (!email) continue;
      const g = byCreator.get(email) ?? { name: x.o.creator_name || email, items: [] };
      g.items.push(x);
      byCreator.set(email, g);
    }

    // creator_email → employee.id für Push.
    const { data: emps } = await supabase.from('employees').select('id, email').eq('active', true);
    const empByEmail = new Map<string, string>();
    for (const e of emps ?? []) if (e.email) empByEmail.set(String(e.email).trim().toLowerCase(), e.id);

    let emailsSent = 0;
    let pushesSent = 0;
    const results: unknown[] = [];

    for (const [email, group] of byCreator) {
      const drafts = group.items.filter((i) => i.reason === 'draft_unsent');
      const sents = group.items.filter((i) => i.reason === 'sent_no_action');
      const subject = `⚡ ${group.items.length} Angebot(e) brauchen deine Aktion`;
      const html = renderEmail(group.name, drafts, sents, now, appBaseUrl);

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromAddr, to: [email], subject, html }),
      });
      const rd = await r.json();
      if (r.ok) emailsSent++;
      else console.error('nag: resend error', email, rd);

      // Push (best effort).
      const empId = empByEmail.get(email);
      if (empId) {
        try {
          const p = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeIds: [empId],
              title: 'Angebote: Aktion nötig',
              body: `${drafts.length} Entwurf/Entwürfe zu senden · ${sents.length} ohne Reaktion`,
              url: appBaseUrl ? `${appBaseUrl}/#/angebote` : undefined,
              tag: 'offer-nag',
            }),
          });
          if (p.ok) pushesSent++;
        } catch (e) { console.warn('nag: push failed', email, e); }
      }
      results.push({ email, offers: group.items.length });
    }

    return json({ ok: true, creators: byCreator.size, emailsSent, pushesSent, results });
  } catch (err) {
    console.error('daily-offer-nag error', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function renderEmail(name: string, drafts: { o: OfferRow; reason: Reason }[], sents: { o: OfferRow; reason: Reason }[], nowMs: number, appBaseUrl: string): string {
  const row = (o: OfferRow, ageIso: string | null) => {
    const cust = o.customer_company || o.customer_name || 'Kunde';
    const d = ageDays(ageIso, nowMs);
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eef2f7;">${esc(cust)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eef2f7;color:#64748b;text-align:right;white-space:nowrap;">seit ${d} Tg.</td>
    </tr>`;
  };
  const section = (title: string, hint: string, items: { o: OfferRow; reason: Reason }[], ageKey: 'created_at' | 'sent_at') =>
    items.length ? `
      <div style="font-weight:600;color:#1e293b;margin:16px 0 4px;">${title} (${items.length})</div>
      <div style="color:#64748b;font-size:12px;margin-bottom:6px;">${hint}</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${items.map((i) => row(i.o, i.o[ageKey])).join('')}</table>` : '';

  const cta = appBaseUrl
    ? `<div style="margin:20px 0;"><a href="${appBaseUrl}/#/angebote" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:8px;">In der App öffnen</a></div>`
    : '';

  return `<!DOCTYPE html><html lang="de"><body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:560px;margin:0 auto;">
    <p>Hallo ${esc(name.split(' ')[0] || name)},</p>
    <p>diese Angebote von dir warten auf den nächsten Schritt:</p>
    ${section('📝 Entwürfe – noch nicht gesendet', 'Senden oder verwerfen.', drafts, 'created_at')}
    ${section('📤 Gesendet – keine Reaktion', 'Beim Kunden nachfassen (anrufen / Follow-up loggen).', sents, 'sent_at')}
    ${cta}
    <p style="color:#94a3b8;font-size:12px;">Automatische Erinnerung · KITZ Workspace</p>
  </body></html>`;
}

function timingSafeEqual(a: string, b: string): boolean {
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
