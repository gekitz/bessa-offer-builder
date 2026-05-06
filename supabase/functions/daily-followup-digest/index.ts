import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  buildDigest,
  digestSubject,
  HOT_TRAIL_LOOKBACK_DAYS,
  renderDigestHtml,
  type DigestOffer,
} from './digest.ts';

// Daily morning digest of follow-up activity for the sales rep.
// Triggered by pg_cron (see migration); the request body is empty —
// all configuration comes from environment variables.
//
// Required env (in addition to the standard SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY that Supabase injects):
//   - RESEND_API_KEY     Resend API key
//   - CRON_SECRET        Shared secret; cron job sends it as
//                        Authorization: Bearer <secret>
// Optional env:
//   - DIGEST_RECIPIENT   To-address for the email. Defaults to
//                        georg.kitz@bessa.app.
//   - DIGEST_FROM        From-address. Defaults to the same sender
//                        used by send-offer.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const recipient = Deno.env.get('DIGEST_RECIPIENT') || 'georg.kitz@bessa.app';
  const fromAddr = Deno.env.get('DIGEST_FROM')
    || 'Kitz Computer & Office GmbH <angebote@kitz.co.at>';
  // Optional: when set, each digest row becomes a tappable deep-link
  // back into the SPA's SendFollowupModal for that offer.
  const appBaseUrl = Deno.env.get('PUBLIC_APP_URL') || null;

  if (!supabaseUrl || !supabaseServiceKey || !resendApiKey || !cronSecret) {
    return jsonResponse({ error: 'Missing required environment variables' }, 500);
  }

  // Reject any caller that doesn't present the shared cron secret.
  // We compare via constant-time-ish equality on equal-length strings.
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const presented = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!presented || presented.length !== cronSecret.length || !timingSafeEqual(presented, cronSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Pull every offer that's still in the 'offer_sent' stage; the
    // dataset is small (hundreds at most) so a single round-trip is
    // fine. We filter further inside buildDigest by next_followup_at.
    const { data, error } = await supabase
      .from('offers')
      .select('id, stage, sent_at, last_activity_at, next_followup_at, total_period, total_monthly, customer_name, customer_company, creator_id, creator_name')
      .eq('stage', 'offer_sent');

    if (error) {
      console.error('digest: query failed', error);
      return jsonResponse({ error: 'Query failed', details: error.message }, 500);
    }

    const offers = (data || []) as DigestOffer[];
    const now = new Date();

    // Recent open counts power the Heiße Spur bucket. We query the
    // last HOT_TRAIL_LOOKBACK_DAYS days of 'opened' events and group
    // by offer_id in code (cheaper than a SQL group-by for this size).
    const since = new Date(
      now.getTime() - HOT_TRAIL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: openRows, error: openErr } = await supabase
      .from('email_events')
      .select('offer_id')
      .eq('event_type', 'opened')
      .gte('occurred_at', since);

    if (openErr) {
      // Hot trail is a nice-to-have; if the query fails we still
      // render the time-based buckets rather than skipping the email.
      console.warn('digest: opens query failed, falling back to no hot bucket', openErr);
    }
    const opensByOfferId = new Map<string, number>();
    for (const row of openRows || []) {
      opensByOfferId.set(row.offer_id, (opensByOfferId.get(row.offer_id) || 0) + 1);
    }

    const digest = buildDigest(offers, now, opensByOfferId);

    if (digest.total === 0) {
      // Nothing to nag about — don't spam an empty email.
      return jsonResponse({ ok: true, sent: false, reason: 'no follow-ups due' });
    }

    const html = renderDigestHtml(digest, { appBaseUrl });
    const subject = digestSubject(digest);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [recipient],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('digest: Resend error', resendData);
      return jsonResponse({ error: 'Resend failed', details: resendData }, 502);
    }

    return jsonResponse({
      ok: true,
      sent: true,
      resendId: resendData.id,
      total: digest.total,
      hot: digest.totalHot,
      overdue: digest.totalOverdue,
      dueToday: digest.totalDueToday,
      groups: digest.groups.length,
    });
  } catch (err) {
    console.error('digest: unexpected error', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  // Inputs are already length-checked by the caller. We still do a
  // constant-time compare to avoid leaking the secret via timing.
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
