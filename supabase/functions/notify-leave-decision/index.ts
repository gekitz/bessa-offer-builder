// Send a decision notification email to the requester after Genehmigt /
// Abgelehnt. The decideLeaveRequest API call in the client invokes this
// function once the row UPDATE has succeeded.
//
// Inputs (POST JSON body):
//   leaveRequestId: string  — UUID of the row that was just decided
//
// Behaviour:
//   * Loads the leave request, requester (employees) and the leave
//     type label (leave_types.label) server-side using the service-
//     role key. Nothing about the email body is trusted from the
//     client.
//   * Looks up the decider's name from employees by decided_by.
//   * Sends a German email via Resend.
//   * Returns { skipped: true, reason } when the requester has no
//     email on file (we don't fail the call — the request decision
//     itself already succeeded).
//
// Deploy:
//   supabase functions deploy notify-leave-decision

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_LABEL: Record<string, { headline: string; subjectVerb: string; accent: string }> = {
  approved: {
    headline: 'Dein Urlaubsantrag wurde genehmigt',
    subjectVerb: 'genehmigt',
    accent: '#16a34a',
  },
  rejected: {
    headline: 'Dein Urlaubsantrag wurde abgelehnt',
    subjectVerb: 'abgelehnt',
    accent: '#dc2626',
  },
};

function fmtDate(iso: string): string {
  // 2026-08-10 -> 10.08.2026
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
    const { leaveRequestId } = await req.json();
    if (!leaveRequestId) {
      return new Response(JSON.stringify({ error: 'leaveRequestId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: lr, error: lrError } = await supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type_id, start_date, end_date, half_day_start, half_day_end, status, decided_by, decision_note')
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

    const statusKey = lr.status as string;
    const config = STATUS_LABEL[statusKey];
    if (!config) {
      return new Response(JSON.stringify({ skipped: true, reason: `status ${statusKey} not notifiable` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: requester }, { data: type }, { data: decider }] = await Promise.all([
      supabase.from('employees').select('id, name, email').eq('id', lr.employee_id).maybeSingle(),
      supabase.from('leave_types').select('id, label').eq('id', lr.leave_type_id).maybeSingle(),
      lr.decided_by
        ? supabase.from('employees').select('id, name').eq('id', lr.decided_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!requester) {
      return new Response(JSON.stringify({ error: 'Mitarbeiter nicht gefunden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!requester.email) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no email on file' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const typeLabel = type?.label ?? 'Urlaub';
    const deciderName = decider?.name ?? 'KITZ';
    const range = lr.start_date === lr.end_date
      ? fmtDate(lr.start_date)
      : `${fmtDate(lr.start_date)} – ${fmtDate(lr.end_date)}`;
    const halfDayBits: string[] = [];
    if (lr.half_day_start) halfDayBits.push('½ Anfang');
    if (lr.half_day_end) halfDayBits.push('½ Ende');
    const halfDayLine = halfDayBits.length > 0 ? `Halbtag: ${halfDayBits.join(', ')}` : '';

    const decisionNote = (lr.decision_note ?? '').toString().trim();

    const subject = `${typeLabel} ${range} ${config.subjectVerb}`;

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;">
    <div style="background:#32373c;padding:20px 28px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:6px 14px;border-radius:6px;font-size:16px;">KITZ</div>
      <div style="color:#ffffff;margin-top:6px;font-size:13px;">Urlaubsplaner</div>
    </div>

    <div style="padding:28px;">
      <h1 style="color:${config.accent};font-size:20px;margin:0 0 16px;">${escapeHtml(config.headline)}</h1>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hallo ${escapeHtml(requester.name)},
      </p>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
        ${escapeHtml(deciderName)} hat deinen Antrag ${escapeHtml(config.subjectVerb)}.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 18px;font-size:14px;color:#1e293b;">
        <div><strong>Art:</strong> ${escapeHtml(typeLabel)}</div>
        <div style="margin-top:4px;"><strong>Zeitraum:</strong> ${escapeHtml(range)}</div>
        ${halfDayLine ? `<div style="margin-top:4px;color:#64748b;">${escapeHtml(halfDayLine)}</div>` : ''}
      </div>

      ${decisionNote
        ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin:0 0 18px;font-size:14px;color:#78350f;">
            <div style="font-weight:bold;margin-bottom:4px;">Anmerkung von ${escapeHtml(deciderName)}</div>
            <div style="white-space:pre-wrap;">${escapeHtml(decisionNote)}</div>
          </div>`
        : ''}

      <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
        Diese E-Mail wurde automatisch vom KITZ Urlaubsplaner versendet.
      </p>
    </div>

    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <div style="color:#94a3b8;font-size:11px;">Kitz Computer &amp; Office GmbH</div>
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
        from: 'KITZ Workspace <workspace@kitz.co.at>',
        to: [requester.email],
        subject,
        html,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'E-Mail konnte nicht gesendet werden', details: resendData }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, resendId: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-leave-decision error:', err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
