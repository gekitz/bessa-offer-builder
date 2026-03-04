import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = await req.json();
    const { type, data } = payload;

    // Map Resend event types to our event types
    const eventMap: Record<string, string> = {
      'email.sent': 'sent',
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
