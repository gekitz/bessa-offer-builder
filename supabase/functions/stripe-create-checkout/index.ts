import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_PLANS = new Set(['standard', 'ratenzahlung', 'miete']);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { shareCode, plan } = await req.json();
    if (!shareCode || !VALID_PLANS.has(plan)) {
      return json({ error: 'shareCode und gültiger plan erforderlich' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });
    const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'http://localhost:5173';

    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('*')
      .eq('share_code', shareCode)
      .single();
    if (offerErr || !offer) return json({ error: 'Angebot nicht gefunden' }, 404);
    if (offer.accepted_at) return json({ error: 'Angebot wurde bereits angenommen' }, 409);
    if (!offer.customer_email) return json({ error: 'Keine Kunden-E-Mail am Angebot' }, 400);

    // Reuse Stripe customer if one already exists from a prior attempt
    let customerId = offer.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: offer.customer_email,
        name: offer.customer_company || offer.customer_name || undefined,
        phone: offer.customer_phone || undefined,
        address: offer.customer_address
          ? { line1: offer.customer_address, country: 'AT' }
          : undefined,
        metadata: {
          offer_id: offer.id,
          share_code: shareCode,
          mesonic_customer_id: offer.mesonic_customer_id || '',
        },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card', 'sepa_debit'],
      currency: 'eur',
      success_url: `${appUrl}/?a=${shareCode}&s=success&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?a=${shareCode}&s=cancel`,
      metadata: {
        offer_id: offer.id,
        share_code: shareCode,
        plan,
      },
    });

    await supabase
      .from('offers')
      .update({
        plan_chosen: plan,
        stripe_customer_id: customerId,
        stripe_checkout_id: session.id,
        payment_status: 'setup_pending',
      })
      .eq('id', offer.id);

    return json({ url: session.url });
  } catch (err) {
    console.error('stripe-create-checkout error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
