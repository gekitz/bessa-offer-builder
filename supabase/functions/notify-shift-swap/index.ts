// Send email notifications around shift_swaps lifecycle events. The
// shift API client invokes this function once the corresponding RPC
// has succeeded — fire-and-forget, so an email outage cannot
// rollback or fail the user-facing action.
//
// Inputs (POST JSON body):
//   swapId: string             — UUID of the shift_swaps row
//   event:  'created' | 'accepted' | 'declined' | 'cancelled'
//
// Behaviour per event:
//   created   → emails requester (confirmation) + target (proposal).
//   accepted  → emails both parties (swap successful).
//   declined  → emails requester (proposal declined).
//   cancelled → emails target (proposal withdrawn).
//
// Skips quietly when an addressee has no email on file. Mirrors the
// notify-leave-decision shape — no shared helpers because there are
// only two notification functions and the divergence is small.
//
// Deploy:
//   supabase functions deploy notify-shift-swap

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SwapEvent = 'created' | 'accepted' | 'declined' | 'cancelled';

interface ShiftRow {
  id: string;
  shift_date: string;
  slot_kind_id: number;
  employee_id: string | null;
}
interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
}
interface SlotKindRow {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slotLine(date: string, kind: SlotKindRow | undefined): string {
  const t = kind ? ` · ${kind.start_time.slice(0,5)}–${kind.end_time.slice(0,5)}` : '';
  const label = kind ? ` · ${kind.label}` : '';
  return `${fmtDate(date)}${label}${t}`;
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

function shellHtml(opts: { headline: string; accent: string; bodyInner: string }): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;">
    <div style="background:#32373c;padding:20px 28px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:6px 14px;border-radius:6px;font-size:16px;">KITZ</div>
      <div style="color:#ffffff;margin-top:6px;font-size:13px;">Schichtplan</div>
    </div>
    <div style="padding:28px;">
      <h1 style="color:${opts.accent};font-size:20px;margin:0 0 16px;">${escapeHtml(opts.headline)}</h1>
      ${opts.bodyInner}
      <p style="color:#64748b;font-size:13px;line-height:1.6;margin:18px 0 0;">
        Diese E-Mail wurde automatisch vom KITZ Schichtplan versendet.
      </p>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <div style="color:#94a3b8;font-size:11px;">Kitz Computer &amp; Office GmbH</div>
    </div>
  </div>
</body></html>`;
}

function pairCard(opts: {
  giveAwayLabel: string;
  giveAwayLine: string;
  takeOverLabel: string;
  takeOverLine: string;
}): string {
  return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 18px;font-size:14px;color:#1e293b;">
    <div style="font-weight:bold;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(opts.giveAwayLabel)}</div>
    <div style="margin-top:4px;">${escapeHtml(opts.giveAwayLine)}</div>
    <div style="font-weight:bold;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:14px;">${escapeHtml(opts.takeOverLabel)}</div>
    <div style="margin-top:4px;">${escapeHtml(opts.takeOverLine)}</div>
  </div>`;
}

function buildEmailsForEvent(opts: {
  event: SwapEvent;
  requester: EmployeeRow;
  target: EmployeeRow;
  requesterShift: ShiftRow;
  targetShift: ShiftRow;
  slotById: Map<number, SlotKindRow>;
  message: string | null;
}): EmailPayload[] {
  const { event, requester, target, requesterShift, targetShift, slotById, message } = opts;
  const requesterShiftLine = slotLine(requesterShift.shift_date, slotById.get(requesterShift.slot_kind_id));
  const targetShiftLine    = slotLine(targetShift.shift_date,    slotById.get(targetShift.slot_kind_id));
  const messageBlock = message && message.trim()
    ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin:0 0 18px;font-size:14px;color:#78350f;">
         <div style="font-weight:bold;margin-bottom:4px;">Nachricht</div>
         <div style="white-space:pre-wrap;">${escapeHtml(message.trim())}</div>
       </div>`
    : '';

  const out: EmailPayload[] = [];

  if (event === 'created') {
    // Target gets the proposal.
    if (target.email) {
      out.push({
        to: target.email,
        subject: `Schichttausch-Anfrage von ${requester.name}`,
        html: shellHtml({
          headline: 'Tauschanfrage erhalten',
          accent: '#b45309',
          bodyInner: `
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo ${escapeHtml(target.name)},</p>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
              <strong>${escapeHtml(requester.name)}</strong> möchte mit dir Schichten tauschen:
            </p>
            ${pairCard({
              giveAwayLabel: `${requester.name} gibt ab`,
              giveAwayLine: requesterShiftLine,
              takeOverLabel: `${requester.name} übernimmt von dir`,
              takeOverLine: targetShiftLine,
            })}
            ${messageBlock}
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">
              Im KITZ Schichtplan kannst du die Anfrage <strong>annehmen</strong> oder <strong>ablehnen</strong>.
            </p>`,
        }),
      });
    }
    // Requester gets a confirmation.
    if (requester.email) {
      out.push({
        to: requester.email,
        subject: `Tauschanfrage an ${target.name} gesendet`,
        html: shellHtml({
          headline: 'Anfrage gesendet',
          accent: '#0369a1',
          bodyInner: `
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo ${escapeHtml(requester.name)},</p>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Deine Tauschanfrage an <strong>${escapeHtml(target.name)}</strong> wurde gesendet.
            </p>
            ${pairCard({
              giveAwayLabel: 'Du gibst ab',
              giveAwayLine: requesterShiftLine,
              takeOverLabel: 'Du übernimmst dafür',
              takeOverLine: targetShiftLine,
            })}
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">
              Du wirst benachrichtigt, sobald ${escapeHtml(target.name)} entscheidet.
            </p>`,
        }),
      });
    }
  } else if (event === 'accepted') {
    const html = (audience: EmployeeRow, partner: EmployeeRow, audienceShiftLine: string, partnerShiftLine: string) =>
      shellHtml({
        headline: 'Tausch bestätigt',
        accent: '#16a34a',
        bodyInner: `
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo ${escapeHtml(audience.name)},</p>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Der Schichttausch mit <strong>${escapeHtml(partner.name)}</strong> wurde bestätigt.
          </p>
          ${pairCard({
            giveAwayLabel: 'Diese Schicht ist nicht mehr deine',
            giveAwayLine: audienceShiftLine,
            takeOverLabel: 'Diese Schicht übernimmst du',
            takeOverLine: partnerShiftLine,
          })}
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">
            Der Kalender wurde aktualisiert.
          </p>`,
      });
    if (requester.email) {
      out.push({
        to: requester.email,
        subject: `Tausch mit ${target.name} bestätigt`,
        html: html(requester, target, requesterShiftLine, targetShiftLine),
      });
    }
    if (target.email) {
      out.push({
        to: target.email,
        subject: `Tausch mit ${requester.name} bestätigt`,
        html: html(target, requester, targetShiftLine, requesterShiftLine),
      });
    }
  } else if (event === 'declined') {
    if (requester.email) {
      out.push({
        to: requester.email,
        subject: `${target.name} hat deine Tauschanfrage abgelehnt`,
        html: shellHtml({
          headline: 'Tauschanfrage abgelehnt',
          accent: '#dc2626',
          bodyInner: `
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo ${escapeHtml(requester.name)},</p>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
              <strong>${escapeHtml(target.name)}</strong> hat deine Tauschanfrage abgelehnt.
              Deine Schicht bleibt unverändert.
            </p>
            ${pairCard({
              giveAwayLabel: 'Deine Schicht (unverändert)',
              giveAwayLine: requesterShiftLine,
              takeOverLabel: 'Vorgeschlagene Tauschschicht',
              takeOverLine: targetShiftLine,
            })}`,
        }),
      });
    }
  } else if (event === 'cancelled') {
    if (target.email) {
      out.push({
        to: target.email,
        subject: `Tauschanfrage von ${requester.name} zurückgezogen`,
        html: shellHtml({
          headline: 'Anfrage zurückgezogen',
          accent: '#64748b',
          bodyInner: `
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo ${escapeHtml(target.name)},</p>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
              <strong>${escapeHtml(requester.name)}</strong> hat die Tauschanfrage zurückgezogen.
              Deine Schicht bleibt unverändert.
            </p>
            ${pairCard({
              giveAwayLabel: 'Deine Schicht (unverändert)',
              giveAwayLine: targetShiftLine,
              takeOverLabel: 'Ehemals angefragte Tauschschicht',
              takeOverLine: requesterShiftLine,
            })}`,
        }),
      });
    }
  }

  return out;
}

interface PushPayload {
  employeeIds: string[];
  title: string;
  body: string;
  url: string;
  tag: string;
}

// Compact push payloads — iOS truncates after ~4 lines so we keep
// title + body short. tag = swap id so multiple notifications about
// the same swap collapse on the device instead of stacking.
function buildPushesForEvent(opts: {
  event: SwapEvent;
  swapId: string;
  requester: EmployeeRow;
  target: EmployeeRow;
  requesterShift: ShiftRow;
  targetShift: ShiftRow;
  slotById: Map<number, SlotKindRow>;
}): PushPayload[] {
  const { event, swapId, requester, target, requesterShift, targetShift, slotById } = opts;
  const reqLine = slotLine(requesterShift.shift_date, slotById.get(requesterShift.slot_kind_id));
  const tgtLine = slotLine(targetShift.shift_date,    slotById.get(targetShift.slot_kind_id));
  const tag = `swap-${swapId}`;
  const url = '/#urlaub';

  if (event === 'created') {
    return [
      {
        employeeIds: [target.id],
        title: `Tauschanfrage von ${requester.name}`,
        body: `${reqLine}  ↔  ${tgtLine}`,
        url, tag,
      },
      // No confirmation push to the requester — they just performed
      // the action and saw the UI update. Email is sufficient.
    ];
  }
  if (event === 'accepted') {
    return [
      {
        employeeIds: [requester.id],
        title: `Tausch mit ${target.name} bestätigt`,
        body: `Du übernimmst ${tgtLine}`,
        url, tag,
      },
      {
        employeeIds: [target.id],
        title: `Tausch mit ${requester.name} bestätigt`,
        body: `Du übernimmst ${reqLine}`,
        url, tag,
      },
    ];
  }
  if (event === 'declined') {
    return [{
      employeeIds: [requester.id],
      title: `${target.name} hat abgelehnt`,
      body: `${reqLine} bleibt deine Schicht.`,
      url, tag,
    }];
  }
  if (event === 'cancelled') {
    return [{
      employeeIds: [target.id],
      title: `${requester.name} hat zurückgezogen`,
      body: `${tgtLine} bleibt deine Schicht.`,
      url, tag,
    }];
  }
  return [];
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
    const { swapId, event } = await req.json();
    if (!swapId || !event) {
      return new Response(JSON.stringify({ error: 'swapId and event are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const validEvents: SwapEvent[] = ['created', 'accepted', 'declined', 'cancelled'];
    if (!validEvents.includes(event)) {
      return new Response(JSON.stringify({ error: `unknown event ${event}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: swap, error: swapErr } = await supabase
      .from('shift_swaps')
      .select('id, requester_shift_id, target_shift_id, requester_id, target_id, message')
      .eq('id', swapId)
      .maybeSingle();
    if (swapErr || !swap) {
      return new Response(JSON.stringify({ error: 'Swap nicht gefunden', details: swapErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [reqShiftRes, tgtShiftRes, reqEmpRes, tgtEmpRes, slotsRes] = await Promise.all([
      supabase.from('shifts').select('id, shift_date, slot_kind_id, employee_id').eq('id', swap.requester_shift_id).maybeSingle(),
      supabase.from('shifts').select('id, shift_date, slot_kind_id, employee_id').eq('id', swap.target_shift_id).maybeSingle(),
      supabase.from('employees').select('id, name, email').eq('id', swap.requester_id).maybeSingle(),
      supabase.from('employees').select('id, name, email').eq('id', swap.target_id).maybeSingle(),
      supabase.from('shift_slot_kinds').select('id, label, start_time, end_time'),
    ]);

    const requesterShift = reqShiftRes.data as ShiftRow | null;
    const targetShift    = tgtShiftRes.data as ShiftRow | null;
    const requester      = reqEmpRes.data    as EmployeeRow | null;
    const target         = tgtEmpRes.data    as EmployeeRow | null;
    const slotKinds      = (slotsRes.data ?? []) as SlotKindRow[];

    if (!requesterShift || !targetShift || !requester || !target) {
      return new Response(JSON.stringify({ error: 'Vollständige Swap-Daten konnten nicht geladen werden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const slotById = new Map<number, SlotKindRow>(slotKinds.map((k) => [k.id, k]));

    const emails = buildEmailsForEvent({
      event: event as SwapEvent,
      requester,
      target,
      requesterShift,
      targetShift,
      slotById,
      message: (swap.message ?? null) as string | null,
    });
    const pushes = buildPushesForEvent({
      event: event as SwapEvent,
      swapId,
      requester,
      target,
      requesterShift,
      targetShift,
      slotById,
    });

    // Send sequentially — Resend rate is generous, and serial keeps
    // the failure mode obvious in logs (which email failed for which
    // recipient).
    const emailResults: Array<{ to: string; ok: boolean; id?: string; error?: unknown }> = [];
    for (const m of emails) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'KITZ Workspace <workspace@kitz.co.at>',
          to: [m.to],
          subject: m.subject,
          html: m.html,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        console.error('Resend error:', m.to, data);
        emailResults.push({ to: m.to, ok: false, error: data });
      } else {
        emailResults.push({ to: m.to, ok: true, id: data.id });
      }
    }

    // Push fan-out — parallel, each call hits the standalone send-push
    // function so the web-push npm import only loads in one function.
    // Fire-and-forget at the function-level: an Apple/Google/Mozilla
    // push outage shouldn't fail the email path or rollback the swap.
    const pushResults: Array<{ to: string[]; ok: boolean; result?: unknown; error?: unknown }> = [];
    if (pushes.length > 0) {
      const sendPushUrl = `${supabaseUrl}/functions/v1/send-push`;
      await Promise.all(pushes.map(async (p) => {
        try {
          const r = await fetch(sendPushUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(p),
          });
          const data = await r.json();
          pushResults.push({ to: p.employeeIds, ok: r.ok, result: data });
        } catch (err) {
          console.warn('send-push invoke failed:', err);
          pushResults.push({ to: p.employeeIds, ok: false, error: String(err) });
        }
      }));
    }

    if (emails.length === 0 && pushes.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no recipients (no email + no push subscriptions targeted)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allOk = emailResults.every((r) => r.ok) && pushResults.every((r) => r.ok);
    return new Response(JSON.stringify({
      success: allOk,
      emails: { sent: emailResults.length, results: emailResults },
      pushes: { sent: pushResults.length, results: pushResults },
    }), {
      status: allOk ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-shift-swap error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
