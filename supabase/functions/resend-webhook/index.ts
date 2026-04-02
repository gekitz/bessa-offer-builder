import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyWebhookSignature(
  body: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string
): Promise<boolean> {
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject timestamps older than 5 minutes to prevent replay attacks
  const ts = parseInt(svixTimestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // Resend webhook secrets start with "whsec_" followed by base64-encoded key
  const secretBytes = Uint8Array.from(
    atob(secret.startsWith('whsec_') ? secret.slice(6) : secret),
    (c) => c.charCodeAt(0)
  );

  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // svix-signature can contain multiple signatures separated by spaces (e.g. "v1,<sig1> v1,<sig2>")
  const signatures = svixSignature.split(' ');
  return signatures.some((s) => s === `v1,${expected}`);
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET not configured');
      return new Response(JSON.stringify({ error: 'webhook secret not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.text();

    // Verify Svix signature
    const isValid = await verifyWebhookSignature(
      body,
      req.headers.get('svix-id'),
      req.headers.get('svix-timestamp'),
      req.headers.get('svix-signature'),
      webhookSecret
    );

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.parse(body);
    const { type, data } = payload;

    // Map Resend event types to our event types
    // 'email.sent' is already recorded by send-offer, so we skip it here
    const eventMap: Record<string, string> = {
      'email.delivered': 'delivered',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
      'email.bounced': 'bounced',
    };

    const eventType = eventMap[type];
    if (!eventType) {
      return new Response(JSON.stringify({ ignored: true, type }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the offer by the Resend email ID stored in metadata
    const resendEmailId = data?.email_id;
    if (!resendEmailId) {
      return new Response(JSON.stringify({ error: 'no email_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Look up the offer via the sent event's metadata
    const { data: events } = await supabase
      .from('email_events')
      .select('offer_id')
      .eq('event_type', 'sent')
      .contains('metadata', { resend_id: resendEmailId })
      .limit(1);

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ error: 'offer not found for email_id' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const offerId = events[0].offer_id;

    // Log the event
    await supabase.from('email_events').insert({
      offer_id: offerId,
      event_type: eventType,
      metadata: data,
    });

    // Update offer status for key events
    if (eventType === 'delivered') {
      const { data: offer } = await supabase
        .from('offers')
        .select('status')
        .eq('id', offerId)
        .single();

      if (offer && offer.status === 'sent') {
        await supabase
          .from('offers')
          .update({ status: 'delivered' })
          .eq('id', offerId);
      }
    }

    if (eventType === 'opened') {
      const { data: offer } = await supabase
        .from('offers')
        .select('status')
        .eq('id', offerId)
        .single();

      if (offer && ['sent', 'delivered'].includes(offer.status)) {
        await supabase
          .from('offers')
          .update({ status: 'opened', opened_at: new Date().toISOString() })
          .eq('id', offerId);
      }
    }

    if (eventType === 'bounced') {
      await supabase
        .from('offers')
        .update({ status: 'bounced' })
        .eq('id', offerId);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('resend-webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
