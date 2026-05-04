import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_MONTHS: Record<string, number> = { '12mo': 12, '6mo': 6, '2mo': 2, event: 1 };
const VAT = 1.2;
const FIN_SURCHARGE = 1.08;

type PlanId = 'standard' | 'ratenzahlung' | 'miete';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { shareCode, checkoutSessionId } = await req.json();
    if (!shareCode || !checkoutSessionId) {
      return json({ error: 'shareCode und checkoutSessionId erforderlich' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('*')
      .eq('share_code', shareCode)
      .single();
    if (offerErr || !offer) return json({ error: 'Angebot nicht gefunden' }, 404);
    if (offer.accepted_at) {
      return json({ alreadyAccepted: true, offerId: offer.id });
    }

    // Verify Checkout completed and retrieve the saved payment method
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['setup_intent'],
    });
    if (session.status !== 'complete' || !session.setup_intent) {
      return json({ error: 'Checkout nicht abgeschlossen' }, 400);
    }
    // Ensure this session was created for this offer
    const sessionOfferId = (session.metadata || {}).offer_id;
    if (sessionOfferId && sessionOfferId !== offer.id) {
      return json({ error: 'Checkout-Session gehört zu einem anderen Angebot' }, 400);
    }
    const setupIntent = session.setup_intent as Stripe.SetupIntent;
    const paymentMethodId = setupIntent.payment_method as string;
    if (!paymentMethodId) return json({ error: 'Keine Zahlungsmethode erfasst' }, 400);
    const customerId = offer.stripe_customer_id as string;

    // Set the new payment method as the customer's default for invoices
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Derive billing numbers
    const plan = offer.plan_chosen as PlanId;
    const offerData = offer.offer_data || {};
    const globalTier: string = offerData.globalTier || '12mo';
    const raten: number = offerData.raten || 12;
    const tierMonths = TIER_MONTHS[globalTier] || 12;
    const isOpenEnded = globalTier === '12mo';

    const monthlyNet = Number(offer.total_monthly || 0);
    const onceNet = Number(offer.total_once || 0);
    const periodNet = Number(offer.total_period || 0);
    const yearlyNet = Math.max(0, periodNet - monthlyNet * tierMonths - onceNet);

    const monthlyBrutto = monthlyNet * VAT;
    const onceBrutto = onceNet * VAT;
    const yearlyBrutto = yearlyNet * VAT;
    const periodBrutto = periodNet * VAT;

    const startTs = offer.service_start_date
      ? Math.floor(new Date(offer.service_start_date + 'T00:00:00Z').getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    const cancelAtTs = addMonthsTs(startTs, tierMonths);

    const desc = (label: string) =>
      `${label} — Angebot ${offer.id.slice(0, 8)} (${offer.customer_company || offer.customer_name || ''})`.trim();

    // Stable, reusable Stripe products — one per billing kind. Located via the
    // metadata.kitz_kind tag; created lazily on first use. Per-offer context
    // (offer id, customer) is attached to the subscription's description, not
    // the product, so the Stripe dashboard stays uncluttered across offers.
    type ProductKind = 'monthly_fee' | 'yearly_service' | 'installment' | 'rental';
    const PRODUCT_NAMES: Record<ProductKind, string> = {
      monthly_fee: 'KITZ Monatsgebühr',
      yearly_service: 'KITZ Wartung jährlich',
      installment: 'KITZ Ratenzahlung',
      rental: 'KITZ Miete',
    };
    const productCache = new Map<ProductKind, Stripe.Product>();

    async function getProduct(kind: ProductKind): Promise<Stripe.Product> {
      const cached = productCache.get(kind);
      if (cached) return cached;
      const result = await stripe.products.search({
        query: `metadata['kitz_kind']:'${kind}' AND active:'true'`,
        limit: 1,
      });
      const product = result.data[0]
        ?? (await stripe.products.create({
          name: PRODUCT_NAMES[kind],
          metadata: { kitz_kind: kind },
        }));
      productCache.set(kind, product);
      return product;
    }

    async function subItem(kind: ProductKind, brutto: number, interval: 'month' | 'year') {
      const product = await getProduct(kind);
      return {
        price_data: {
          currency: 'eur',
          unit_amount: toCents(brutto),
          recurring: { interval },
          product: product.id,
        } as Stripe.SubscriptionCreateParams.Item.PriceData,
      };
    }

    const invoiceIds: string[] = [];
    const subscriptionIds: string[] = [];
    let scheduleId: string | null = null;

    // Pending invoice items attach to the customer and are automatically
    // picked up by the next invoice Stripe generates for them.
    async function addPendingItem(amount: number, description: string) {
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: toCents(amount),
        currency: 'eur',
        description,
      });
    }

    if (plan === 'standard') {
      if (onceBrutto > 0) await addPendingItem(onceBrutto, desc('Einmalige Kosten'));

      if (monthlyBrutto > 0) {
        const sub = await stripe.subscriptions.create({
          customer: customerId,
          items: [await subItem('monthly_fee', monthlyBrutto, 'month')],
          description: desc('Monatsgebühr'),
          trial_end: startTs,
          cancel_at: isOpenEnded ? undefined : cancelAtTs,
          default_payment_method: paymentMethodId,
          metadata: baseMeta(offer, 'standard_monthly'),
        });
        subscriptionIds.push(sub.id);
      } else if (onceBrutto > 0) {
        // No subscription: create and finalize a standalone invoice for the pending items
        const invoice = await stripe.invoices.create({
          customer: customerId,
          collection_method: 'charge_automatically',
          default_payment_method: paymentMethodId,
          auto_advance: true,
          metadata: baseMeta(offer, 'standard_once'),
        });
        invoiceIds.push(invoice.id);
      }

      if (yearlyBrutto > 0) {
        const yearlySub = await stripe.subscriptions.create({
          customer: customerId,
          items: [await subItem('yearly_service', yearlyBrutto, 'year')],
          description: desc('Wartung jährlich'),
          trial_end: startTs,
          cancel_at: isOpenEnded ? undefined : cancelAtTs,
          default_payment_method: paymentMethodId,
          metadata: baseMeta(offer, 'standard_yearly'),
        });
        subscriptionIds.push(yearlySub.id);
      }
    } else if (plan === 'ratenzahlung') {
      const totalFinanced = periodBrutto * FIN_SURCHARGE;
      const anzahlung = totalFinanced * 0.3;
      const ratePerMonth = (totalFinanced * 0.7) / raten;

      // Anzahlung rides along on the first schedule invoice as a pending item
      await addPendingItem(anzahlung, desc('Anzahlung (30%)'));

      const phases: Stripe.SubscriptionScheduleCreateParams.Phase[] = [
        {
          items: [await subItem('installment', ratePerMonth, 'month')],
          iterations: raten,
          metadata: baseMeta(offer, 'raten_phase1'),
        },
      ];

      if (isOpenEnded && monthlyBrutto > 0) {
        phases.push({
          items: [await subItem('monthly_fee', monthlyBrutto, 'month')],
          metadata: baseMeta(offer, 'raten_phase2'),
        });
      }

      const schedule = await stripe.subscriptionSchedules.create({
        customer: customerId,
        start_date: startTs,
        end_behavior: isOpenEnded && monthlyBrutto > 0 ? 'release' : 'cancel',
        default_settings: {
          default_payment_method: paymentMethodId,
          description: desc('Ratenzahlung'),
        },
        phases,
        metadata: baseMeta(offer, 'raten_schedule'),
      });
      scheduleId = schedule.id;

      if (isOpenEnded && yearlyBrutto > 0) {
        const yearlySub = await stripe.subscriptions.create({
          customer: customerId,
          items: [await subItem('yearly_service', yearlyBrutto, 'year')],
          description: desc('Wartung jährlich'),
          trial_end: addMonthsTs(startTs, raten),
          default_payment_method: paymentMethodId,
          metadata: baseMeta(offer, 'raten_yearly'),
        });
        subscriptionIds.push(yearlySub.id);
      }
    } else if (plan === 'miete') {
      const mieteMonthly = (periodBrutto / tierMonths) * FIN_SURCHARGE;
      await addPendingItem(500, desc('Kaution (rückzahlbar)'));
      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [await subItem('rental', mieteMonthly, 'month')],
        description: desc('Miete monatlich'),
        trial_end: startTs,
        cancel_at: cancelAtTs,
        default_payment_method: paymentMethodId,
        metadata: baseMeta(offer, 'miete'),
      });
      subscriptionIds.push(sub.id);
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from('offers')
      .update({
        accepted_at: nowIso,
        status: 'accepted',
        payment_status: 'active',
        stripe_invoice_ids: invoiceIds,
        stripe_subscription_ids: subscriptionIds,
        stripe_schedule_id: scheduleId,
      })
      .eq('id', offer.id);

    await supabase.from('offer_payment_events').insert({
      offer_id: offer.id,
      event_type: 'accepted',
      stripe_object_id: customerId,
      payload: { plan, subscriptionIds, invoiceIds, scheduleId },
    });

    return json({ success: true, offerId: offer.id, plan });
  } catch (err) {
    console.error('stripe-complete-acceptance error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toCents(euro: number): number {
  return Math.round(euro * 100);
}

function addMonthsTs(ts: number, months: number): number {
  const d = new Date(ts * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return Math.floor(d.getTime() / 1000);
}

function baseMeta(offer: { id: string; share_code: string }, role: string) {
  return { offer_id: offer.id, share_code: offer.share_code, role };
}

