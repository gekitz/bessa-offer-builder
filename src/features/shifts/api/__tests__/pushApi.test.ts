import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyFn = (...args: unknown[]) => unknown;

// Same chainable thenable mock as vacationApi tests — every chained
// method returns the builder, awaiting resolves to the configured
// {data,error} pair.
function makeChain(response: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'upsert', 'delete', 'eq', 'in'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(response).then(resolve);
  return builder as { [key: string]: ReturnType<typeof vi.fn> } & PromiseLike<unknown>;
}

const fromMock = vi.fn<AnyFn>();

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  registerPushSubscription,
  unregisterPushSubscription,
  hasPushSubscription,
} from '../pushApi';

beforeEach(() => {
  fromMock.mockReset();
});

describe('pushApi', () => {
  it('registerPushSubscription upserts on the endpoint conflict target', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);

    await registerPushSubscription({
      employeeId: 'emp-1',
      endpoint: 'https://push.example/abc',
      p256dh: 'P256DH',
      authToken: 'AUTH',
      userAgent: 'Mozilla/5.0 (test)',
    });

    expect(fromMock).toHaveBeenCalledWith('push_subscriptions');
    expect(chain.upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = chain.upsert.mock.calls[0]!;
    expect(row).toMatchObject({
      employee_id: 'emp-1',
      endpoint: 'https://push.example/abc',
      p256dh: 'P256DH',
      auth_token: 'AUTH',
      user_agent: 'Mozilla/5.0 (test)',
    });
    // last_seen_at is set on every upsert so the prune cron treats
    // an active re-subscription as "fresh".
    expect(typeof (row as { last_seen_at?: unknown }).last_seen_at).toBe('string');
    expect(opts).toEqual({ onConflict: 'endpoint' });
  });

  it('registerPushSubscription throws when supabase reports an error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: { message: 'rls denied' } }));
    await expect(registerPushSubscription({
      employeeId: 'emp-1',
      endpoint: 'x',
      p256dh: 'k',
      authToken: 'a',
    })).rejects.toMatchObject({ message: 'rls denied' });
  });

  it('unregisterPushSubscription deletes by endpoint', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);

    await unregisterPushSubscription('https://push.example/abc');

    expect(fromMock).toHaveBeenCalledWith('push_subscriptions');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('endpoint', 'https://push.example/abc');
  });

  it('hasPushSubscription returns true when a row exists', async () => {
    fromMock.mockReturnValue(makeChain({ data: { id: 'sub-1' }, error: null }));
    const result = await hasPushSubscription('emp-1', 'https://push.example/abc');
    expect(result).toBe(true);
  });

  it('hasPushSubscription returns false when no row matches', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await hasPushSubscription('emp-1', 'https://push.example/abc');
    expect(result).toBe(false);
  });

  it('hasPushSubscription throws when supabase errors', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: { message: 'boom' } }));
    await expect(hasPushSubscription('emp-1', 'x')).rejects.toMatchObject({ message: 'boom' });
  });
});
