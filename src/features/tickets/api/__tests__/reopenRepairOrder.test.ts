import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase query builder — mirrors the harness in deleteDrafts.test.ts,
// with `is` added for the `.is('mesonic_beleg_key', null)` guard.
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown }

function makeChain(response: ChainResponse) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'is', 'in', 'gte', 'lte', 'order'];
  for (const m of passthrough) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(response).then(resolve);
  return Object.assign(builder, { _calls: calls }) as Record<string, ReturnType<typeof vi.fn>> & {
    _calls: typeof calls;
  };
}

const fromMock = vi.fn<AnyFn>();
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

import { reopenSignedRepairOrder } from '../ticketApi';

const SIGNED_ROW = {
  id: 'ro-1',
  ticket_id: 't-1',
  status: 'completed',
  signature_data: null,
  signed_at: null,
  signed_by_name: null,
  mesonic_beleg_key: null,
};

beforeEach(() => {
  fromMock.mockReset();
});

describe('reopenSignedRepairOrder', () => {
  it('voids the signature and drops to completed, guarded to signed + not-yet-exported', async () => {
    const chain = makeChain({ data: SIGNED_ROW, error: null });
    fromMock.mockImplementation(() => chain);

    const result = await reopenSignedRepairOrder('ro-1', 'Ersatzteil nachgetragen', 'emp-9');

    expect(fromMock).toHaveBeenCalledWith('repair_orders');

    // The update clears the signature and reverts status.
    const update = chain._calls.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({
      status: 'completed',
      signature_data: null,
      signed_by_name: null,
      signed_at: null,
    });

    // Guards: only a signed order, and only before Mesonic export.
    expect(chain._calls.filter((c) => c.method === 'eq')).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['id', 'ro-1'] },
        { method: 'eq', args: ['status', 'signed'] },
      ]),
    );
    expect(chain._calls).toEqual(
      expect.arrayContaining([{ method: 'is', args: ['mesonic_beleg_key', null] }]),
    );

    expect(result.id).toBe('ro-1');
    expect(result.status).toBe('completed');
  });

  it('rejects an empty reason before touching supabase', async () => {
    await expect(reopenSignedRepairOrder('ro-1', '   ')).rejects.toThrow(/Grund/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws a friendly error when the guard matches no row (already exported or not signed)', async () => {
    fromMock.mockImplementation(() => makeChain({ data: null, error: null }));
    await expect(reopenSignedRepairOrder('ro-1', 'zu spät')).rejects.toThrow(/Gutschrift/);
  });

  it('throws when supabase returns an error', async () => {
    fromMock.mockImplementation(() => makeChain({ data: null, error: { message: 'boom' } }));
    await expect(reopenSignedRepairOrder('ro-1', 'grund')).rejects.toBeTruthy();
  });
});
