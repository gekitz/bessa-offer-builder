// Send ticket-event emails + web push notifications to the customer
// (via customer_email) and the internal assignee. Invoked by the
// client after a successful mutation — failures here do not fail the
// mutation, so the function returns a structured `skipped` result
// rather than 500 where possible.
//
// Inputs (POST JSON body):
//   ticketId:    string                                 (required, all events)
//   event:       'ticket_created' | 'status_changed' |
//                'appointment_scheduled' | 'ticket_closed' |
//                'customer_replied'                      (required)
//   previousStatus, newStatus: string                   (status_changed only)
//   appointmentId: string                               (appointment_scheduled only)
//   shareCode:   string                                 (customer_replied only —
//                                                        validated against tickets.share_code
//                                                        so anonymous callers can't spoof
//                                                        notifications for arbitrary tickets)
//   triggeredBy: string                                 (employees.id of actor — used to
//                                                        suppress self-notifications)
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (required)
//   PUBLIC_BASE_URL — base origin for the customer share link
//                      (default https://bessa.kitz.co.at)
//
// Deploy:
//   supabase functions deploy notify-ticket-event

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EventType =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'status_changed'
  | 'appointment_scheduled'
  | 'ticket_closed'
  | 'customer_replied';

const STATUS_LABEL_DE: Record<string, string> = {
  open: 'Eingelangt',
  in_progress: 'In Bearbeitung',
  waiting: 'Wartet auf Rückmeldung',
  review: 'In Prüfung',
  closed: 'Abgeschlossen',
  cancelled: 'Storniert',
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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
      <div style="color:#ffffff;margin-top:6px;font-size:13px;">Computer + Office</div>
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

interface TicketRow {
  id: string;
  ticket_number: string;
  share_code: string;
  title: string;
  description: string | null;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  assigned_to: string | null;
  resolution_note: string | null;
}

interface AppointmentRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  kind: string;
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
    const ticketId = body.ticketId as string;
    if (!event || !ticketId) {
      return new Response(JSON.stringify({ error: 'event and ticketId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const publicBase = (Deno.env.get('PUBLIC_BASE_URL') ?? 'https://bessa.kitz.co.at').replace(/\/$/, '');
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .select('id, ticket_number, share_code, title, description, customer_name, customer_email, status, assigned_to, resolution_note')
      .eq('id', ticketId)
      .maybeSingle();
    if (tErr) {
      return new Response(JSON.stringify({ error: 'Lookup failed', details: tErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ticket) {
      return new Response(JSON.stringify({ error: 'Ticket nicht gefunden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const t = ticket as TicketRow;
    // Customer-facing portal link (share_code). Only ever sent to the customer.
    const shareUrl = `${publicBase}/?t=${encodeURIComponent(t.share_code)}`;
    // Internal workspace deep-link. Staff get THIS, never the portal — the
    // portal's comment box posts as the customer (is_external=true), so a
    // staff member replying there would be misattributed.
    const internalUrl = `${publicBase}/#/tickets/${t.id}`;

    // Resolve event-specific data
    let appointment: AppointmentRow | null = null;
    if (event === 'appointment_scheduled' && body.appointmentId) {
      const { data: a } = await supabase
        .from('appointments')
        .select('id, title, starts_at, ends_at, location, kind')
        .eq('id', body.appointmentId)
        .maybeSingle();
      appointment = (a as AppointmentRow | null) ?? null;
    }

    // customer_replied is triggered by anonymous customer clients via
    // the public share link. The shareCode in the body must match the
    // ticket's share_code or we reject — otherwise an attacker who
    // somehow knows a ticket_id could spam the assignee.
    let customerCommentBody: string | null = null;
    if (event === 'customer_replied') {
      if (!body.shareCode || body.shareCode !== t.share_code) {
        return new Response(JSON.stringify({ error: 'share_code mismatch' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Pull the most-recent external comment so the internal email +
      // push can quote it. Best-effort — we still fire the alert if
      // the read fails.
      const { data: latest } = await supabase
        .from('ticket_comments')
        .select('body, created_at')
        .eq('ticket_id', t.id)
        .eq('is_external', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      customerCommentBody = (latest as { body?: string } | null)?.body ?? null;
    }

    // Resolve internal assignee (if any) for the internal notification.
    // customer_replied always notifies the assignee — there's no
    // triggeredBy to compare against because the customer (anon)
    // triggered the event.
    let assigneeEmail: string | null = null;
    let assigneeName: string | null = null;
    let assigneeId: string | null = null;
    const skipSelfNotify = event !== 'customer_replied' && t.assigned_to === body.triggeredBy;
    if (t.assigned_to && !skipSelfNotify) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id, email, name')
        .eq('id', t.assigned_to)
        .maybeSingle();
      if (emp) {
        assigneeEmail = (emp as { email?: string | null }).email ?? null;
        assigneeName = (emp as { name?: string | null }).name ?? null;
        assigneeId = (emp as { id?: string | null }).id ?? null;
      }
    }

    // Compose per-event payloads
    const sent: { customer?: string | { skipped: string }; internal?: string | { skipped: string } } = {};

    let customerSubject = '';
    let customerBodyHtml = '';
    let internalSubject = '';
    let internalBodyHtml = '';
    let accent = '#dc2626';
    let footerLabel = 'Auftrag verfolgen';

    if (event === 'ticket_created') {
      accent = '#dc2626';
      customerSubject = `Ihr Auftrag ${t.ticket_number} wurde eingelangt`;
      customerBodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(t.customer_name) || 'Kundin/Kunde'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Wir haben Ihren Auftrag eingelangt und werden uns zeitnah darum kümmern.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 18px;font-size:14px;color:#1e293b;">
          <div><strong>Auftragsnummer:</strong> ${escapeHtml(t.ticket_number)}</div>
          <div style="margin-top:4px;"><strong>Betreff:</strong> ${escapeHtml(t.title)}</div>
          ${t.description ? `<div style="margin-top:8px;color:#475569;white-space:pre-wrap;">${escapeHtml(t.description)}</div>` : ''}
        </div>
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
          Über den Link unten können Sie den aktuellen Status jederzeit einsehen.
        </p>`;
      internalSubject = `Neues Ticket: ${t.ticket_number} — ${t.title}`;
      internalBodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(assigneeName) || 'Kollege'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Dir wurde ein neues Ticket zugewiesen.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 18px;font-size:14px;color:#1e293b;">
          <div><strong>${escapeHtml(t.ticket_number)}</strong> — ${escapeHtml(t.title)}</div>
          ${t.customer_name ? `<div style="margin-top:4px;color:#64748b;">Kunde: ${escapeHtml(t.customer_name)}</div>` : ''}
          ${t.description ? `<div style="margin-top:8px;color:#475569;white-space:pre-wrap;">${escapeHtml(t.description)}</div>` : ''}
        </div>`;
      footerLabel = 'Auftrag öffnen';
    } else if (event === 'ticket_assigned') {
      // Internal-only: a ticket was (re)assigned to someone. No customer
      // mail (customerSubject stays empty → customer email is skipped).
      accent = '#dc2626';
      internalSubject = `Ticket zugewiesen: ${t.ticket_number} — ${t.title}`;
      internalBodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(assigneeName) || 'Kollege'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Dir wurde ein Ticket zugewiesen.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 18px;font-size:14px;color:#1e293b;">
          <div><strong>${escapeHtml(t.ticket_number)}</strong> — ${escapeHtml(t.title)}</div>
          ${t.customer_name ? `<div style="margin-top:4px;color:#64748b;">Kunde: ${escapeHtml(t.customer_name)}</div>` : ''}
          ${t.description ? `<div style="margin-top:8px;color:#475569;white-space:pre-wrap;">${escapeHtml(t.description)}</div>` : ''}
        </div>`;
    } else if (event === 'status_changed') {
      const prev = String(body.previousStatus ?? '');
      const next = String(body.newStatus ?? t.status);
      accent = next === 'closed' ? '#16a34a' : next === 'cancelled' ? '#94a3b8' : '#dc2626';
      const nextLabel = STATUS_LABEL_DE[next] ?? next;
      customerSubject = `Auftrag ${t.ticket_number} — Status: ${nextLabel}`;
      customerBodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(t.customer_name) || 'Kundin/Kunde'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Der Status Ihres Auftrags <strong>${escapeHtml(t.ticket_number)}</strong> hat sich geändert auf <strong>${escapeHtml(nextLabel)}</strong>.
        </p>
        ${prev && STATUS_LABEL_DE[prev]
          ? `<p style="color:#94a3b8;font-size:12px;margin:0 0 16px;">Vorher: ${escapeHtml(STATUS_LABEL_DE[prev])}</p>` : ''}`;
      internalSubject = `Ticket ${t.ticket_number}: Status → ${nextLabel}`;
      internalBodyHtml = `<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Status-Wechsel auf <strong>${escapeHtml(nextLabel)}</strong>${prev && STATUS_LABEL_DE[prev] ? ` (vorher: ${escapeHtml(STATUS_LABEL_DE[prev])})` : ''}.</p>`;
    } else if (event === 'ticket_closed') {
      accent = '#16a34a';
      customerSubject = `Auftrag ${t.ticket_number} abgeschlossen`;
      customerBodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(t.customer_name) || 'Kundin/Kunde'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Ihr Auftrag <strong>${escapeHtml(t.ticket_number)}</strong> wurde erfolgreich abgeschlossen.
        </p>
        ${t.resolution_note ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 18px;margin:0 0 18px;font-size:14px;color:#065f46;"><div style="font-weight:bold;margin-bottom:4px;">Lösung</div><div style="white-space:pre-wrap;">${escapeHtml(t.resolution_note)}</div></div>` : ''}
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Bei Rückfragen melden Sie sich jederzeit unter 04352/4176 oder office@kitz.co.at.
        </p>`;
      // Closing notifications to internal are noisy — skip both
      // email and push for the assignee on close.
      assigneeEmail = null;
      assigneeId = null;
      footerLabel = 'Abschluss-Details ansehen';
    } else if (event === 'appointment_scheduled') {
      accent = '#7c3aed';
      const apptInfo = appointment
        ? `<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px 18px;margin:0 0 18px;font-size:14px;color:#1e1b4b;">
            <div><strong>${escapeHtml(appointment.title)}</strong></div>
            <div style="margin-top:4px;">${escapeHtml(fmtDateTime(appointment.starts_at))} – ${escapeHtml(new Date(appointment.ends_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }))}</div>
            ${appointment.location ? `<div style="margin-top:4px;color:#5b21b6;">Ort: ${escapeHtml(appointment.location)}</div>` : ''}
          </div>`
        : '';
      customerSubject = `Termin geplant: Auftrag ${t.ticket_number}`;
      customerBodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(t.customer_name) || 'Kundin/Kunde'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Wir haben einen Termin für Ihren Auftrag <strong>${escapeHtml(t.ticket_number)}</strong> geplant.
        </p>
        ${apptInfo}`;
      internalSubject = `Termin für ${t.ticket_number} geplant`;
      internalBodyHtml = `<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Neuer Termin für <strong>${escapeHtml(t.ticket_number)}</strong> — ${escapeHtml(t.title)}.</p>${apptInfo}`;
      footerLabel = 'Termin im Portal ansehen';
    } else if (event === 'customer_replied') {
      accent = '#7c3aed';
      // Customer doesn't get an email here — they just submitted the
      // comment, the confirmation is the "Senden" succeeding in the
      // portal. Only the internal assignee is notified.
      const snippet = customerCommentBody
        ? customerCommentBody.length > 280
          ? customerCommentBody.slice(0, 277) + '…'
          : customerCommentBody
        : '';
      internalSubject = `Kunden-Rückmeldung zu ${t.ticket_number}`;
      internalBodyHtml = `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Hallo ${escapeHtml(assigneeName) || 'Kollege'},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
          ${escapeHtml(t.customer_name) || 'Der Kunde'} hat eine Rückmeldung zu Auftrag <strong>${escapeHtml(t.ticket_number)}</strong> hinterlassen.
        </p>
        ${snippet
          ? `<div style="background:#f5f3ff;border-left:3px solid #7c3aed;padding:12px 16px;margin:0 0 18px;font-size:14px;color:#1e1b4b;white-space:pre-wrap;">${escapeHtml(snippet)}</div>`
          : ''}`;
      footerLabel = 'Ticket öffnen';
    } else {
      return new Response(JSON.stringify({ skipped: true, reason: `unknown event ${event}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Customer email
    if (t.customer_email && customerSubject) {
      const html = htmlShell({
        heading: customerSubject,
        accent,
        bodyHtml: customerBodyHtml,
        footerLink: { href: shareUrl, label: footerLabel },
      });
      const r = await sendResend({ apiKey: resendApiKey, to: t.customer_email, subject: customerSubject, html });
      sent.customer = r.ok ? r.id ?? 'ok' : { skipped: 'resend failed' };
    } else if (!t.customer_email) {
      sent.customer = { skipped: 'no customer email' };
    }

    // 2. Internal email (assignee, if any and not the one who triggered)
    if (assigneeEmail && internalSubject) {
      const html = htmlShell({
        heading: internalSubject,
        accent,
        bodyHtml: internalBodyHtml,
        // Deep-link into the internal workspace, NOT the public portal — so
        // staff never comment through the customer-facing box.
        footerLink: { href: internalUrl, label: 'Ticket öffnen' },
      });
      const r = await sendResend({ apiKey: resendApiKey, to: assigneeEmail, subject: internalSubject, html });
      sent.internal = r.ok ? r.id ?? 'ok' : { skipped: 'resend failed' };
    } else if (!assigneeEmail) {
      sent.internal = { skipped: 'no internal recipient' };
    }

    // 3. Internal push notification (assignee). Deep-links into the
    // ticket detail. Body is plain text — push services don't honour
    // HTML. Body length is capped by the OS (~150 chars on iOS, more
    // generous on desktop), so the customer-comment quote is already
    // truncated to 280 above.
    let pushResult: unknown = null;
    if (assigneeId && internalSubject) {
      const pushBody = (() => {
        if (event === 'customer_replied') {
          if (customerCommentBody) {
            return customerCommentBody.length > 140
              ? customerCommentBody.slice(0, 137) + '…'
              : customerCommentBody;
          }
          return `${t.customer_name ?? 'Der Kunde'} hat eine Rückmeldung hinterlassen.`;
        }
        if (event === 'ticket_created' || event === 'ticket_assigned') return `${t.title} · ${t.customer_name ?? ''}`.trim();
        if (event === 'status_changed') {
          const next = String(body.newStatus ?? t.status);
          return `${t.title} — ${STATUS_LABEL_DE[next] ?? next}`;
        }
        if (event === 'appointment_scheduled' && appointment) {
          return `${appointment.title} · ${fmtDateTime(appointment.starts_at)}`;
        }
        return t.title;
      })();

      // Deep-link into the workspace SPA, not the public portal —
      // staff have the internal view available behind auth (internalUrl
      // defined once above, shared with the internal email).
      const r = await sendPush({
        supabaseUrl,
        serviceKey,
        employeeIds: [assigneeId],
        title: internalSubject,
        body: pushBody,
        url: internalUrl,
        tag: `ticket-${t.id}`,
      });
      pushResult = r.ok ? r.result ?? 'ok' : { skipped: 'send-push failed' };
    } else if (!assigneeId) {
      pushResult = { skipped: 'no internal recipient' };
    }

    return new Response(JSON.stringify({ success: true, event, sent, push: pushResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-ticket-event error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
