import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase query builder — mirrors the harness in addComment.test.ts.
// Records each chain call so the test can assert HOW the row was targeted.
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown }

function makeChain(response: ChainResponse) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'order'];
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

import { deleteRepairOrder } from '../ticketApi';
import { deleteDeliveryNote } from '../deliveryNoteApi';

beforeEach(() => {
  fromMock.mockReset();
});

describe('deleteRepairOrder', () => {
  it('deletes by id but only when status is draft', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockImplementation(() => chain);

    await deleteRepairOrder('ro-1');

    expect(fromMock).toHaveBeenCalledWith('repair_orders');
    expect(chain._calls.some((c) => c.method === 'delete')).toBe(true);
    expect(chain._calls.filter((c) => c.method === 'eq')).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['id', 'ro-1'] },
        { method: 'eq', args: ['status', 'draft'] },
      ]),
    );
  });

  it('throws when supabase returns an error', async () => {
    fromMock.mockImplementation(() => makeChain({ data: null, error: { message: 'boom' } }));
    await expect(deleteRepairOrder('ro-1')).rejects.toBeTruthy();
  });
});

describe('deleteDeliveryNote', () => {
  it('deletes by id but only when status is draft', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockImplementation(() => chain);

    await deleteDeliveryNote('dn-1');

    expect(fromMock).toHaveBeenCalledWith('delivery_notes');
    expect(chain._calls.some((c) => c.method === 'delete')).toBe(true);
    expect(chain._calls.filter((c) => c.method === 'eq')).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['id', 'dn-1'] },
        { method: 'eq', args: ['status', 'draft'] },
      ]),
    );
  });

  it('throws when supabase returns an error', async () => {
    fromMock.mockImplementation(() => makeChain({ data: null, error: { message: 'boom' } }));
    await expect(deleteDeliveryNote('dn-1')).rejects.toBeTruthy();
  });
});
