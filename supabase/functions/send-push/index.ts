// Generic Web Push fan-out. Given a list of employee_ids and a
// payload, signs and sends a push notification to every active
// push_subscriptions row for those employees. Stale subscriptions
// (410 Gone / 404 Not Found from the push service) are deleted; live
// ones get their last_seen_at bumped so a future cleanup cron can
// drop ones that haven't been delivered to in N days.
//
// Inputs (POST JSON body):
//   employeeIds: string[]   — UUIDs to deliver to (de-duped server-side)
//   title:       string     — notification title
//   body:        string     — notification body
//   url?:        string     — click target inside the SPA (default '/')
//   tag?:        string     — collapse key (e.g. shift id) so multiple
//                             notifications about the same thing replace
//                             each other instead of stacking
//
// Auth: requires the Supabase service role to read push_subscriptions
// without RLS gymnastics. Other Edge Functions invoke this one via
// supabase.functions.invoke (which forwards the caller's JWT, but the
// SUPABASE_SERVICE_ROLE_KEY in env lets us bypass that for the row
// reads).
//
// Deploy:
//   supabase functions deploy send-push

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// web-push 3.6.x ships ESM-compatible builds; npm: specifier works in
// Supabase Edge runtime (Deno + npm compat layer).
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_token: string;
}

interface SendInput {
  employeeIds: string[];
  title: string;
  body: string;
  url?: string;
  tag?: string;
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
    const input = await req.json() as Partial<SendInput>;
    if (!input.employeeIds || !Array.isArray(input.employeeIds) || input.employeeIds.length === 0) {
      return new Response(JSON.stringify({ error: 'employeeIds is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!input.title || !input.body) {
      return new Response(JSON.stringify({ error: 'title and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:office@kitz.co.at';

    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const supabase = createClient(supabaseUrl, serviceKey);

    // De-duplicate employee ids and load subscriptions.
    const ids = Array.from(new Set(input.employeeIds));
    const { data: rows, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_token')
      .in('employee_id', ids);
    if (error) {
      return new Response(JSON.stringify({ error: 'Lookup failed', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const subs = (rows ?? []) as SubscriptionRow[];
    if (subs.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({
      title: input.title,
      body:  input.body,
      url:   input.url ?? '/',
      tag:   input.tag ?? 'kitz',
    });

    const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = [];
    const deadIds: string[] = [];
    const liveIds: string[] = [];

    // Fire in parallel — web-push will resolve / reject per
    // subscription; we don't bail the batch on a single failure.
    await Promise.all(subs.map(async (s) => {
      try {
        const res = await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth_token },
          },
          payload,
        );
        results.push({ id: s.id, ok: true, status: res.statusCode });
        liveIds.push(s.id);
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        const status = e.statusCode ?? 0;
        // 410 Gone / 404 Not Found = subscription is permanently dead.
        if (status === 404 || status === 410) {
          deadIds.push(s.id);
        }
        results.push({
          id: s.id,
          ok: false,
          status,
          error: e.body || e.message || String(err),
        });
      }
    }));

    if (liveIds.length > 0) {
      await supabase
        .from('push_subscriptions')
        .update({ last_seen_at: new Date().toISOString() })
        .in('id', liveIds);
    }
    if (deadIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', deadIds);
    }

    return new Response(JSON.stringify({
      success: results.every((r) => r.ok),
      sent: liveIds.length,
      pruned: deadIds.length,
      total: subs.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
