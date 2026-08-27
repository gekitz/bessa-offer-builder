// Notify the internal assignees of an appointment (Termin) when it is
// created for them, they are added/removed, it changes, or it is
// cancelled. Invoked fire-and-forget by the client after a successful
// mutation — failures here must never roll back or surface in the UI,
// so we return a structured `skipped` result rather than 500 where
// possible.
//
// This is the appointment-assignee counterpart to notify-ticket-event:
// that one fans out to the customer + the ticket's single assigned_to;
// this one fans out to every appointment_assignees row.
//
// Inputs (POST JSON body):
//   event:        'created' | 'assigned' | 'updated' |
//                 'unassigned' | 'cancelled'          (required)
//   appointmentId: string                             (required unless a
//                                                      full snapshot is
//                                                      supplied — the row
//                                                      is gone on cancel)
//   recipientIds: string[]                            (employees.id to notify.
//                                                      For 'updated' it may be
//                                                      omitted — we then resolve
//                                                      the current assignees.)
//   triggeredBy:  string | null                       (employees.id of the actor;
//                                                      suppressed from recipients)
//   changedFields: string[]                           ('updated' only — labels
//                                                      which fields moved)
//   snapshot:     { title, startsAt, endsAt, location } (fallback details when the
//                                                      row was already deleted)
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (required)
//   PUBLIC_BASE_URL — base origin for the workspace deep-link
//                     (default https://bessa.kitz.co.at)
//
// Deploy:
//   supabase functions deploy notify-appointment-event

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EventType = 'created' | 'assigned' | 'updated' | 'unassigned' | 'cancelled';

const KIND_LABEL_DE: Record<string, string> = {
  installation: 'Installation',
  reparatur: 'Reparatur',
  wartung: 'Wartung',
  beratung: 'Beratung',
  abholung: 'Abholung',
  lieferung: 'Lieferung',
  intern: 'Intern',
};

const FIELD_LABEL_DE: Record<string, string> = {
  startsAt: 'Beginn',
  endsAt: 'Ende',
  location: 'Ort',
  status: 'Status',
  title: 'Titel',
  description: 'Beschreibung',
  kind: 'Art',
};

// Per-event copy. `accent` drives the heading colour; `verb` is woven
// into the subject/lead line.
const EVENT_COPY: Record<EventType, { heading: string; lead: string; accent: string }> = {
  created:    { heading: 'Neuer Termin für dich', lead: 'Für dich wurde ein Termin eingetragen.', accent: '#7c3aed' },
  assigned:   { heading: 'Du wurdest einem Termin zugewiesen', lead: 'Du wurdest einem Termin zugewiesen.', accent: '#7c3aed' },
  updated:    { heading: 'Ein Termin wurde geändert', lead: 'Ein Termin, dem du zugewiesen bist, hat sich geändert.', accent: '#d97706' },
  unassigned: { heading: 'Du wurdest von einem Termin entfernt', lead: 'Du wurdest von einem Termin entfernt.', accent: '#94a3b8' },
  cancelled:  { heading: 'Ein Termin wurde abgesagt', lead: 'Ein Termin, dem du zugewiesen warst, wurde abgesagt.', accent: '#dc2626' },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
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

function htmlShell(opts: {
  heading: string;
  accent: string;
  bodyHtml: string;
  footerLink?: { href: string; label: string } | null;
}): string {
  const { heading, accent, bodyHtml, footerLink } = opts;
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;">
    <div style="background:#32373c;padding:20px 28px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:6px 14px;border-radius:6px;font-size:16px;">KITZ</div>
      <div style="color:#ffffff;margin-top:6px;font-size:13px;">Kalender</div>
    </div>
    <div style="padding:28px;">
      <h1 style="color:${accent};font-size:20px;margin:0 0 16px;">${escapeHtml(heading)}</h1>
      ${bodyHtml}
      ${footerLink ? `<p style="margin:24px 0 0;"><a href="${footerLink.href}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:bold;">${escapeHtml(footerLink.label)}</a></p>` : ''}
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
      Kitz Computer + Office GmbH · 04352/4176 · office@kitz.co.at
    </div>
  </div>
</body></html>`;
}

interface ApptDetails {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  kind: string | null;
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
    const event = body.event as EventType;
    if (!event || !EVENT_COPY[event]) {
      return new Response(JSON.stringify({ error: 'valid event is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const publicBase = (Deno.env.get('PUBLIC_BASE_URL') ?? 'https://bessa.kitz.co.at').replace(/\/$/, '');
    const supabase = createClient(supabaseUrl, serviceKey);

    const appointmentId = (body.appointmentId as string | undefined) ?? null;
    const triggeredBy = (body.triggeredBy as string | null | undefined) ?? null;
    const changedFields = Array.isArray(body.changedFields) ? (body.changedFields as string[]) : [];

    // Resolve appointment details for the email body. On 'cancelled' the
    // row is already deleted, so the client passes a snapshot instead.
    let details: ApptDetails | null = null;
    if (appointmentId) {
      const { data: a } = await supabase
        .from('appointments')
        .select('title, starts_at, ends_at, location, kind')
        .eq('id', appointmentId)
        .maybeSingle();
      if (a) {
        details = {
          title: (a as any).title,
          startsAt: (a as any).starts_at,
          endsAt: (a as any).ends_at,
          location: (a as any).location ?? null,
          kind: (a as any).kind ?? null,
        };
      }
    }
    if (!details && body.snapshot) {
      const s = body.snapshot as Record<string, unknown>;
      details = {
        title: String(s.title ?? 'Termin'),
        startsAt: String(s.startsAt ?? ''),
        endsAt: String(s.endsAt ?? ''),
        location: (s.location as string | null) ?? null,
        kind: (s.kind as string | null) ?? null,
      };
    }
    if (!details) {
      return new Response(JSON.stringify({ error: 'Termin nicht gefunden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Recipient employee ids. For 'updated' the client may omit them —
    // resolve the appointment's current assignees in that case.
    let recipientIds: string[] = Array.isArray(body.recipientIds) ? (body.recipientIds as string[]) : [];
    if (recipientIds.length === 0 && appointmentId) {
      const { data: rows } = await supabase
        .from('appointment_assignees')
        .select('employee_id')
        .eq('appointment_id', appointmentId);
      recipientIds = (rows ?? []).map((r: any) => r.employee_id).filter(Boolean);
    }

    // De-dupe and drop the actor (don't notify yourself of your own change).
    const recipients = Array.from(new Set(recipientIds)).filter((id) => id && id !== triggeredBy);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: emps } = await supabase
      .from('employees')
      .select('id, name, email')
      .in('id', recipients);
    const employees = (emps ?? []) as Array<{ id: string; name: string | null; email: string | null }>;

    const copy = EVENT_COPY[event];
    const kindLabel = details.kind ? (KIND_LABEL_DE[details.kind] ?? details.kind) : null;
    const when = details.startsAt
      ? `${fmtDateTime(details.startsAt)}${details.endsAt ? ` – ${fmtTime(details.endsAt)}` : ''}`
      : '';
    const changedLabels = changedFields
      .map((f) => FIELD_LABEL_DE[f] ?? f)
      .filter(Boolean);

    const detailBox = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 18px;font-size:14px;color:#1e293b;">
        <div><strong>${escapeHtml(details.title)}</strong></div>
        ${when ? `<div style="margin-top:4px;">${escapeHtml(when)}</div>` : ''}
        ${kindLabel ? `<div style="margin-top:4px;color:#64748b;">Art: ${escapeHtml(kindLabel)}</div>` : ''}
        ${details.location ? `<div style="margin-top:4px;color:#64748b;">Ort: ${escapeHtml(details.location)}</div>` : ''}
      </div>`;
    const changedBox = event === 'updated' && changedLabels.length > 0
      ? `<p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 16px;">Geändert: ${escapeHtml(changedLabels.join(', '))}.</p>`
      : '';

    const internalUrl = `${publicBase}/#/kalender`;
    const subject = `${copy.heading}: ${details.title}`;

    // Push body — plain text, capped for the OS notification tray.
    const pushBody = (() => {
      const bits = [details.title];
      if (when) bits.push(when);
      const line = bits.join(' · ');
      return line.length > 140 ? line.slice(0, 137) + '…' : line;
    })();

    const emailResults: Array<{ id: string; result: string }> = [];
    for (const emp of employees) {
      if (!emp.email) {
        emailResults.push({ id: emp.id, result: 'skipped: no email' });
        continue;
      }
      const bodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(emp.name) || 'Kollege'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          ${escapeHtml(copy.lead)}
        </p>
        ${changedBox}
        ${detailBox}`;
      const html = htmlShell({
        heading: copy.heading,
        accent: copy.accent,
        bodyHtml,
        footerLink: { href: internalUrl, label: 'Im Kalender öffnen' },
      });
      const r = await sendResend({ apiKey: resendApiKey, to: emp.email, subject, html });
      emailResults.push({ id: emp.id, result: r.ok ? (r.id ?? 'ok') : 'resend failed' });
    }

    // Single push fan-out to every recipient (send-push resolves each
    // employee's subscriptions itself and de-dupes).
    const push = await sendPush({
      supabaseUrl,
      serviceKey,
      employeeIds: recipients,
      title: copy.heading,
      body: pushBody,
      url: internalUrl,
      tag: appointmentId ? `appointment-${appointmentId}` : 'appointment',
    });

    return new Response(JSON.stringify({
      success: true,
      event,
      recipients: recipients.length,
      emails: emailResults,
      push: push.ok ? (push.result ?? 'ok') : { skipped: 'send-push failed' },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-appointment-event error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
