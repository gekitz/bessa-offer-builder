// Notify the right people about the *lifecycle* of a leave request —
// submitted, edited, or cancelled — as opposed to the approve/reject
// *decision* (that stays in notify-leave-decision, which mails the
// requester).
//
// Recipients depend on the event and on who triggered it:
//   * Approvers (Georg + Herbert) — so a new/changed/cancelled request
//     lands on their desk. The approver who performed the action is
//     suppressed (no self-mail).
//   * The named substitute (Vertreter) — told they were put down as
//     cover, that the cover details changed, or that it's no longer
//     needed.
//   * The employee — only when someone OTHER than them acted on their
//     request (an approver entering / editing / cancelling on their
//     behalf). Self-initiated changes stay silent for the employee.
//
// Sends email (Resend) + web push (send-push) per recipient. Invoked
// fire-and-forget by the client after the mutation committed, so a
// mail outage never rolls back the request.
//
// Inputs (POST JSON body):
//   leaveRequestId: string                          (required)
//   event:          'submitted' | 'updated' | 'cancelled'  (required)
//   triggeredBy:    string | null                   (employees.id of actor,
//                                                    suppressed from recipients)
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (required)
//   PUBLIC_BASE_URL — base origin for the workspace deep-link
//                     (default https://bessa.kitz.co.at)
//   LEAVE_APPROVER_CODES — comma-separated employee codes who approve
//                          (default 'gkitz,hkitz')
//
// Deploy:
//   supabase functions deploy notify-leave-event

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EventType = 'submitted' | 'updated' | 'cancelled';
type Role = 'employee' | 'substitute' | 'approver';

const EVENT_VERB: Record<EventType, string> = {
  submitted: 'eingereicht',
  updated: 'geändert',
  cancelled: 'storniert',
};

const EVENT_ACCENT: Record<EventType, string> = {
  submitted: '#2563eb',
  updated: '#d97706',
  cancelled: '#dc2626',
};

function fmtDate(iso: string): string {
  // 2026-08-10 -> 10.08.2026
  const parts = String(iso).split('-');
  if (parts.length !== 3) return String(iso);
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
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

function htmlShell(opts: { heading: string; accent: string; bodyHtml: string }): string {
  const { heading, accent, bodyHtml } = opts;
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;">
    <div style="background:#32373c;padding:20px 28px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:6px 14px;border-radius:6px;font-size:16px;">KITZ</div>
      <div style="color:#ffffff;margin-top:6px;font-size:13px;">Urlaubsplaner</div>
    </div>
    <div style="padding:28px;">
      <h1 style="color:${accent};font-size:20px;margin:0 0 16px;">${escapeHtml(heading)}</h1>
      ${bodyHtml}
      <p style="color:#64748b;font-size:13px;line-height:1.6;margin:24px 0 0;">
        Diese E-Mail wurde automatisch vom KITZ Urlaubsplaner versendet.
      </p>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
      Kitz Computer + Office GmbH · 04352/4176 · office@kitz.co.at
    </div>
  </div>
</body></html>`;
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

async function sendResend(opts: {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; id?: string; error?: unknown }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'KITZ Workspace <workspace@kitz.co.at>',
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Resend error:', data);
    return { ok: false, error: data };
  }
  return { ok: true, id: data.id };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const leaveRequestId = body.leaveRequestId as string;
    const event = body.event as EventType;
    const triggeredBy = (body.triggeredBy as string | null | undefined) ?? null;
    if (!leaveRequestId || !event || !EVENT_VERB[event]) {
      return new Response(JSON.stringify({ error: 'leaveRequestId and a valid event are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const publicBase = (Deno.env.get('PUBLIC_BASE_URL') ?? 'https://bessa.kitz.co.at').replace(/\/$/, '');
    const approverCodes = (Deno.env.get('LEAVE_APPROVER_CODES') ?? 'gkitz,hkitz')
      .split(',').map((c) => c.trim()).filter(Boolean);
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: lr, error: lrError } = await supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type_id, start_date, end_date, half_day_start, half_day_end, status, substitute_id')
      .eq('id', leaveRequestId)
      .maybeSingle();
    if (lrError) {
      return new Response(JSON.stringify({ error: 'Lookup failed', details: lrError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!lr) {
      return new Response(JSON.stringify({ error: 'Antrag nicht gefunden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: requester }, { data: type }, { data: substitute }, { data: approverRows }, { data: actor }] =
      await Promise.all([
        supabase.from('employees').select('id, name, email').eq('id', lr.employee_id).maybeSingle(),
        supabase.from('leave_types').select('id, label').eq('id', lr.leave_type_id).maybeSingle(),
        lr.substitute_id
          ? supabase.from('employees').select('id, name, email').eq('id', lr.substitute_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('employees').select('id, name, email').in('code', approverCodes),
        triggeredBy
          ? supabase.from('employees').select('id, name').eq('id', triggeredBy).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    const requesterName = (requester as any)?.name ?? 'Ein Mitarbeiter';
    const actorName = (actor as any)?.name ?? 'Jemand';
    const typeLabel = (type as any)?.label ?? 'Urlaub';
    const range = lr.start_date === lr.end_date
      ? fmtDate(lr.start_date)
      : `${fmtDate(lr.start_date)} – ${fmtDate(lr.end_date)}`;
    const halfDayBits: string[] = [];
    if (lr.half_day_start) halfDayBits.push('½ Anfang');
    if (lr.half_day_end) halfDayBits.push('½ Ende');
    const halfDayLine = halfDayBits.length > 0 ? `Halbtag: ${halfDayBits.join(', ')}` : '';
    const verb = EVENT_VERB[event];
    const accent = EVENT_ACCENT[event];

    // Assemble the recipient set with a role each. Priority employee >
    // substitute > approver decides the message when one person wears
    // several hats. The actor is never a recipient.
    type Recipient = { id: string; name: string | null; email: string | null; role: Role };
    const byId = new Map<string, Recipient>();
    const consider = (r: { id?: string | null; name?: string | null; email?: string | null } | null, role: Role) => {
      const id = r?.id ?? null;
      if (!id || id === triggeredBy || byId.has(id)) return;
      byId.set(id, { id, name: r?.name ?? null, email: r?.email ?? null, role });
    };

    // Employee — only when acted on by someone else.
    if (triggeredBy && triggeredBy !== lr.employee_id) {
      consider(requester as any, 'employee');
    }
    // Substitute — on submit/update always; on cancel to release them.
    if (substitute) consider(substitute as any, 'substitute');
    // Approvers.
    for (const a of (approverRows ?? []) as any[]) consider(a, 'approver');

    const recipients = Array.from(byId.values());
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const detailBox = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 18px;font-size:14px;color:#1e293b;">
        <div><strong>Mitarbeiter:</strong> ${escapeHtml(requesterName)}</div>
        <div style="margin-top:4px;"><strong>Art:</strong> ${escapeHtml(typeLabel)}</div>
        <div style="margin-top:4px;"><strong>Zeitraum:</strong> ${escapeHtml(range)}</div>
        ${halfDayLine ? `<div style="margin-top:4px;color:#64748b;">${escapeHtml(halfDayLine)}</div>` : ''}
      </div>`;

    // Role-specific heading + lead sentence.
    function copyFor(role: Role): { heading: string; lead: string; pushTitle: string } {
      if (role === 'employee') {
        return {
          heading: `Dein Urlaub wurde ${verb}`,
          lead: `${escapeHtml(actorName)} hat für dich einen Urlaubsantrag ${verb}.`,
          pushTitle: `Dein Urlaub wurde ${verb}`,
        };
      }
      if (role === 'substitute') {
        if (event === 'cancelled') {
          return {
            heading: 'Vertretung nicht mehr nötig',
            lead: `Der Urlaub von ${escapeHtml(requesterName)}, für den du als Vertretung eingetragen warst, wurde storniert.`,
            pushTitle: 'Vertretung nicht mehr nötig',
          };
        }
        return {
          heading: 'Du wurdest als Vertretung eingetragen',
          lead: `Du wurdest als Vertretung für ${escapeHtml(requesterName)} eingetragen.`,
          pushTitle: `Vertretung für ${requesterName}`,
        };
      }
      // approver
      return {
        heading: `Urlaubsantrag ${verb}`,
        lead: `${escapeHtml(requesterName)} hat einen Urlaubsantrag ${verb}.`,
        pushTitle: `Antrag von ${requesterName} ${verb}`,
      };
    }

    const internalUrl = `${publicBase}/#/urlaub`;
    const pushUrl = internalUrl;
    const pushBody = `${typeLabel} · ${range}`;

    const results: Array<{ id: string; role: Role; email: string; push: string }> = [];
    for (const r of recipients) {
      const copy = copyFor(r.role);
      let emailResult = 'skipped: no email';
      if (r.email) {
        const bodyHtml = `
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Hallo ${escapeHtml(r.name) || 'Kollege'},
          </p>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
            ${copy.lead}
          </p>
          ${detailBox}
          <p style="margin:0;"><a href="${internalUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:bold;">Im Urlaubsplaner öffnen</a></p>`;
        const html = htmlShell({ heading: copy.heading, accent, bodyHtml });
        const subject = `${copy.heading}: ${requesterName} ${range}`;
        const er = await sendResend({ apiKey: resendApiKey, to: r.email, subject, html });
        emailResult = er.ok ? (er.id ?? 'ok') : 'resend failed';
      }
      const pr = await sendPush({
        supabaseUrl,
        serviceKey,
        employeeIds: [r.id],
        title: copy.pushTitle,
        body: pushBody,
        url: pushUrl,
        tag: `leave-${lr.id}`,
      });
      results.push({
        id: r.id,
        role: r.role,
        email: emailResult,
        push: pr.ok ? 'ok' : 'send-push failed',
      });
    }

    return new Response(JSON.stringify({ success: true, event, recipients: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-leave-event error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
