import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { offerId, pdfBase64, pdfFilename } = await req.json();

    if (!offerId) {
      return new Response(JSON.stringify({ error: 'offerId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Init Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const trackingBaseUrl = Deno.env.get('TRACKING_BASE_URL') || `${supabaseUrl}/functions/v1`;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the offer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (offerError || !offer) {
      return new Response(JSON.stringify({ error: 'Angebot nicht gefunden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!offer.customer_email) {
      return new Response(JSON.stringify({ error: 'Keine Kunden-E-Mail vorhanden' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upload PDF to Supabase Storage
    let pdfUrl = '';
    if (pdfBase64 && pdfFilename) {
      const pdfBuffer = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const storagePath = `offers/${offerId}/${pdfFilename}`;

      const { error: uploadError } = await supabase.storage
        .from('offer-pdfs')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.error('PDF upload error:', uploadError);
      } else {
        // Update offer with PDF path
        await supabase
          .from('offers')
          .update({ pdf_path: storagePath })
          .eq('id', offerId);

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('offer-pdfs')
          .getPublicUrl(storagePath);
        pdfUrl = urlData?.publicUrl || '';
      }
    }

    // Build tracking pixel URL
    const trackingPixelUrl = `${trackingBaseUrl}/track-open?offer_id=${offerId}`;

    // Build email HTML
    const customerName = offer.customer_name || offer.customer_company || 'Kunde';
    const creatorName = offer.creator_name || 'KITZ Team';
    const totalMonthly = offer.total_monthly ? Number(offer.total_monthly) : 0;
    const totalOnce = offer.total_once ? Number(offer.total_once) : 0;

    const fmtEur = (n: number) =>
      n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const emailHtml = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <!-- Header -->
    <div style="background:#32373c;padding:24px 32px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;color:#dc2626;font-weight:bold;padding:8px 16px;border-radius:8px;font-size:18px;">KITZ</div>
      <div style="color:#ffffff;margin-top:8px;font-size:14px;">Computer + Office GmbH</div>
    </div>

    <!-- Content -->
    <div style="padding:32px;">
      <h1 style="color:#1e293b;font-size:22px;margin:0 0 16px;">Ihr Angebot von KITZ</h1>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Sehr geehrte/r ${customerName},
      </p>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
        vielen Dank für Ihr Interesse. Anbei erhalten Sie Ihr persönliches Angebot als PDF-Anhang.
      </p>

      <!-- Summary Box -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:0 0 24px;">
        <div style="font-weight:bold;color:#1e293b;margin-bottom:12px;font-size:15px;">Zusammenfassung</div>
        ${totalMonthly > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;color:#475569;">
          <span>Monatliche Kosten (netto)</span>
          <span style="font-weight:600;color:#1e293b;">€ ${fmtEur(totalMonthly)}/Mo</span>
        </div>` : ''}
        ${totalOnce > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;color:#475569;">
          <span>Einmalige Kosten (netto)</span>
          <span style="font-weight:600;color:#1e293b;">€ ${fmtEur(totalOnce)}</span>
        </div>` : ''}
      </div>

      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px;">
        Bei Fragen stehe ich Ihnen jederzeit gerne zur Verfügung.
      </p>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 32px;">
        Mit freundlichen Grüßen
      </p>

      <!-- Signature -->
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;">
        <div style="font-weight:bold;color:#1e293b;font-size:14px;">${creatorName}</div>
        <div style="color:#64748b;font-size:13px;margin-top:4px;">KITZ Computer + Office GmbH</div>
        <div style="color:#64748b;font-size:13px;">www.kitz.co.at</div>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <div style="color:#94a3b8;font-size:11px;">
        KITZ Computer + Office GmbH | Johann-Offner-Str. 17, 9400 Wolfsberg | Rosentalerstr. 1, 9020 Klagenfurt
      </div>
    </div>
  </div>
  <!-- Tracking Pixel -->
  <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>`;

    // Build Resend API payload
    const emailPayload: Record<string, unknown> = {
      from: 'KITZ Angebote <angebote@kitz.co.at>',
      to: [offer.customer_email],
      subject: `Ihr Angebot von KITZ – ${offer.customer_company || offer.customer_name || 'Angebot'}`,
      html: emailHtml,
    };

    // Attach PDF if available
    if (pdfBase64 && pdfFilename) {
      emailPayload.attachments = [
        {
          filename: pdfFilename,
          content: pdfBase64,
        },
      ];
    }

    // Send via Resend
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
      console.error('Resend error:', resendData);
      return new Response(JSON.stringify({ error: 'E-Mail konnte nicht gesendet werden', details: resendData }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update offer status
    await supabase
      .from('offers')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', offerId);

    // Log email event
    await supabase.from('email_events').insert({
      offer_id: offerId,
      event_type: 'sent',
      metadata: { resend_id: resendData.id, to: offer.customer_email },
    });

    return new Response(JSON.stringify({ success: true, resendId: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-offer error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
