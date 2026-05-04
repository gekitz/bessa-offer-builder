import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

// No CORS: Stripe calls this directly.
serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const notifyEmail = Deno.env.get('BILLING_NOTIFY_EMAIL') || '';
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || '';

  const sig = req.headers.get('stripe-signature') || '';
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error('webhook signature verify failed:', err);
    return new Response('invalid signature', { status: 400 });
  }

  // Find the related offer via metadata on the object (all our objects carry offer_id)
  const obj = event.data.object as Record<string, unknown>;
  const offerId =
    (obj.metadata as Record<string, string> | undefined)?.offer_id ||
    (await lookupOfferIdByStripeObject(stripe, supabase, event));
  if (!offerId) {
    // Not our object
    return new Response('ok', { status: 200 });
  }

  const { data: offer } = await supabase
    .from('offers')
    .select('id, customer_name, customer_company, customer_email, creator_name, payment_status, plan_chosen, service_start_date')
    .eq('id', offerId)
    .single();
  if (!offer) return new Response('ok', { status: 200 });

  // Idempotency: skip if we've seen this event id
  const { data: existing } = await supabase
    .from('offer_payment_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();
  if (existing) return new Response('ok', { status: 200 });

  let newStatus: string | null = null;
  let notify: { subject: string; body: string } | null = null;

  switch (event.type) {
    case 'invoice.payment_succeeded': {
      newStatus = 'active';
      break;
    }
    case 'invoice.payment_failed': {
      newStatus = 'past_due';
      notify = {
        subject: `[Kitz Billing] Zahlung fehlgeschlagen — ${customerLabel(offer)}`,
        body: `Die Zahlung einer Rechnung ist fehlgeschlagen.
Angebot: ${offerLink(appUrl, offerId)}
Kunde: ${customerLabel(offer)}
Plan: ${offer.plan_chosen}
Stripe versucht die Zahlung automatisch erneut (Dunning).`,
      };
      break;
    }
    case 'customer.subscription.updated': {
      const sub = obj as unknown as Stripe.Subscription;
      if (sub.status === 'past_due') newStatus = 'past_due';
      else if (sub.status === 'unpaid') {
        newStatus = 'unpaid';
        notify = {
          subject: `[Kitz Billing] ACTION REQUIRED — Kunde deaktivieren — ${customerLabel(offer)}`,
          body: `Die Zahlung eines Kunden konnte nach mehreren Versuchen nicht eingezogen werden.
Bitte deaktiviere die Software für diesen Kunden.
Angebot: ${offerLink(appUrl, offerId)}
Kunde: ${customerLabel(offer)}
Stripe Customer: ${sub.customer}`,
        };
      } else if (sub.status === 'active' && offer.payment_status !== 'active') {
        newStatus = 'active';
      } else if (sub.status === 'canceled') {
        newStatus = 'canceled';
      }
      break;
    }
    case 'customer.subscription.deleted': {
      newStatus = 'canceled';
      break;
    }
    default:
      // Log unknown event but don't act
      break;
  }

  await supabase.from('offer_payment_events').insert({
    offer_id: offerId,
    event_type: event.type,
    stripe_event_id: event.id,
    stripe_object_id: (obj as { id?: string }).id || null,
    payload: { status: newStatus, objectType: event.data.object.object },
  });

  if (newStatus && newStatus !== offer.payment_status) {
    await supabase.from('offers').update({ payment_status: newStatus }).eq('id', offerId);
  }

  if (notify && resendKey && notifyEmail) {
    await sendEmail(resendKey, notifyEmail, notify.subject, notify.body);
  }

  return new Response('ok', { status: 200 });
});

function customerLabel(offer: {
  customer_name: string | null;
  customer_company: string | null;
  customer_email: string | null;
}): string {
  return (
    offer.customer_company ||
    offer.customer_name ||
    offer.customer_email ||
    'Unbekannter Kunde'
  );
}

function offerLink(appUrl: string, offerId: string): string {
  return appUrl ? `${appUrl} (Angebot ${offerId.slice(0, 8)})` : `Angebot ${offerId}`;
}

async function sendEmail(apiKey: string, to: string, subject: string, body: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Kitz Billing <angebote@kitz.co.at>',
        to: [to],
        subject,
        text: body,
      }),
    });
  } catch (err) {
    console.error('notification email failed:', err);
  }
}

async function lookupOfferIdByStripeObject(
  stripe: Stripe,
  _supabase: ReturnType<typeof createClient>,
  event: Stripe.Event,
): Promise<string | null> {
  // Invoices don't always carry our metadata directly; fall back to the parent subscription
  const obj = event.data.object as Record<string, unknown>;
  const subId = (obj.subscription as string | null) || null;
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      return (sub.metadata?.offer_id as string) || null;
    } catch {
      return null;
    }
  }
  return null;
}
