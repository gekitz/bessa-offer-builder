import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Send a follow-up email on an existing offer. Threaded into the
// original conversation via In-Reply-To/References, with Reply-To
// pointing to the rep's mailbox so customer replies land naturally.
//
// Auth: invoked from the authenticated SPA (verify_jwt = true).
//
// Behaviour:
//   - logs the send as an offer_activities row (kind = 'email') so
//     it shows up in the Kontaktverlauf and counts toward the
//     "stale" / "Heiße Spur" buckets.
//   - logs an email_events 'sent' row with the activity_id, so when
//     resend-webhook later receives 'opened' / 'clicked' for the
//     same Resend id, it can attribute back to this follow-up.
//   - optionally re-attaches the original offer PDF (default ON
//     from the UI) so the customer has the doc one click away.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  offerId: string;
  templateId?: string | null;
  subject: string;
  body: string;
  attachPdf?: boolean;
  includeAcceptLink?: boolean;
  createdById?: string | null;
  createdByName?: string | null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as RequestBody;
    const { offerId, templateId, subject, body, attachPdf, includeAcceptLink, createdById, createdByName } = payload;

    if (!offerId || !subject || !body) {
      return jsonResponse({ error: 'offerId, subject, and body are required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const publicAppUrl = Deno.env.get('PUBLIC_APP_URL') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (offerError || !offer) {
      return jsonResponse({ error: 'Angebot nicht gefunden' }, 404);
    }

    if (!offer.customer_email) {
      return jsonResponse({ error: 'Keine Kunden-E-Mail vorhanden' }, 400);
    }

    // Attach PDF: re-download the existing offer PDF from storage.
    // We never re-render here — sending the same PDF the customer
    // originally received avoids any "wait, the numbers changed?"
    // confusion mid-thread.
    let attachmentPayload: { filename: string; content: string } | null = null;
    if (attachPdf && offer.pdf_path) {
      const { data: pdfData, error: pdfError } = await supabase.storage
        .from('offer-pdfs')
        .download(offer.pdf_path);
      if (!pdfError && pdfData) {
        const buf = new Uint8Array(await pdfData.arrayBuffer());
        // Convert to base64 in chunks to avoid call-stack overflow on
        // large PDFs (encountered before in send-offer for 451fdf4).
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        const base64 = btoa(binary);
        const filenameFromPath = offer.pdf_path.split('/').pop() || 'angebot.pdf';
        attachmentPayload = { filename: filenameFromPath, content: base64 };
      } else if (pdfError) {
        console.warn('send-followup: PDF download failed, continuing without attachment', pdfError);
      }
    }

    // Optional accept-link reuses the existing share_code if present.
    let acceptUrl = '';
    if (includeAcceptLink && publicAppUrl && offer.share_code) {
      acceptUrl = `${publicAppUrl}/?a=${offer.share_code}`;
    }

    const html = renderFollowupHtml({
      bodyText: body,
      acceptUrl,
      creatorName: offer.creator_name || 'Kitz Team',
    });

    // Threading uses the deterministic Message-ID set by send-offer.
    // For legacy offers without that ID (sent before the change),
    // threading degrades gracefully: clients fall back to subject-
    // and sender-based grouping (Re: + same Reply-To still works
    // in Gmail/Outlook).
    const threadMessageId = `<offer-${offerId}@offer.kitz.co.at>`;
    const followupMessageId = `<followup-${crypto.randomUUID()}@offer.kitz.co.at>`;

    const emailPayload: Record<string, unknown> = {
      from: 'Kitz Computer & Office GmbH <angebote@kitz.co.at>',
      to: [offer.customer_email],
      subject,
      html,
      headers: {
        'Message-ID': followupMessageId,
        'In-Reply-To': threadMessageId,
        'References': threadMessageId,
      },
    };
    if (offer.creator_email) {
      emailPayload.reply_to = offer.creator_email;
    }
    if (attachmentPayload) {
      emailPayload.attachments = [attachmentPayload];
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('send-followup: Resend error', resendData);
      return jsonResponse({ error: 'E-Mail konnte nicht gesendet werden', details: resendData }, 502);
    }

    // Log the activity first so we can attribute the email event to
    // a known activity_id. Note: the existing trigger updates the
    // offer's last_activity_at automatically.
    const noteSummary = bodyPreview(body, templateId);
    const { data: activity, error: activityError } = await supabase
      .from('offer_activities')
      .insert({
        offer_id: offerId,
        kind: 'email',
        outcome: 'sent',
        note: noteSummary,
        next_followup_at: null,
        created_by_id: createdById || null,
        created_by_name: createdByName || null,
      })
      .select('id')
      .single();

    if (activityError) {
      // The email already went out; logging failure shouldn't fail
      // the user-visible operation. Surface it but return success.
      console.error('send-followup: activity log failed', activityError);
    }

    await supabase.from('email_events').insert({
      offer_id: offerId,
      event_type: 'sent',
      activity_id: activity?.id || null,
      metadata: {
        resend_id: resendData.id,
        to: offer.customer_email,
        template_id: templateId || null,
        followup: true,
      },
    });

    return jsonResponse({
      success: true,
      resendId: resendData.id,
      activityId: activity?.id || null,
    });
  } catch (err) {
    console.error('send-followup: unexpected error', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bodyPreview(body: string, templateId?: string | null): string {
  // Store a 240-char preview in the activity note so the timeline
  // shows what was sent without bloating the table with full HTML.
  const cleaned = body.replace(/\s+/g, ' ').trim();
  const sliced = cleaned.length > 240 ? cleaned.slice(0, 237) + '…' : cleaned;
  return templateId ? `[${templateId}] ${sliced}` : sliced;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface RenderArgs {
  bodyText: string;
  acceptUrl: string;
  creatorName: string;
}

function renderFollowupHtml({ bodyText, acceptUrl, creatorName }: RenderArgs): string {
  // Convert the textarea body to safe HTML: escape, then turn blank
  // lines into paragraphs and single newlines into <br>.
  const escaped = escapeHtml(bodyText);
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#32373c;padding:20px 28px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:6px 12px;border-radius:6px;font-size:14px;">KITZ</div>
      <div style="color:#ffffff;margin-top:6px;font-size:13px;">Computer &amp; Office GmbH</div>
    </div>
    <div style="padding:28px;">
      ${paragraphs}
      ${acceptUrl ? `
      <div style="text-align:center;margin:8px 0 24px;">
        <a href="${acceptUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:8px;font-size:15px;">
          Angebot online annehmen
        </a>
      </div>` : ''}
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;color:#64748b;font-size:12px;">
        ${escapeHtml(creatorName)} · Kitz Computer &amp; Office GmbH · www.kitz.co.at
      </div>
    </div>
  </div>
</body>
</html>`;
}
