import { supabase } from '../../../lib/supabase';

// Tiny client for the push_subscriptions table. Both subscribe and
// unsubscribe are idempotent (UPSERT / DELETE-by-endpoint), so the
// caller can safely retry without polluting the registry.

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

export interface RegisterPushSubscriptionInput {
  employeeId: string;
  endpoint: string;
  p256dh: string;
  authToken: string;
  userAgent?: string;
}

// Insert (or upsert by endpoint) a subscription row. Endpoint is
// globally unique per push subscription, so the conflict target is
// "endpoint" — the same browser re-subscribing under the same user
// will refresh the row in place.
export async function registerPushSubscription(
  input: RegisterPushSubscriptionInput,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('push_subscriptions').upsert(
    {
      employee_id: input.employeeId,
      endpoint:    input.endpoint,
      p256dh:      input.p256dh,
      auth_token:  input.authToken,
      user_agent:  input.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}

// Returns true when a row already exists for this employee + endpoint.
// Used by the hook to avoid hitting the network on every page load.
export async function hasPushSubscription(employeeId: string, endpoint: string): Promise<boolean> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('push_subscriptions')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
