import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase query builder — mirrors the harness in
// publicTicketApi.test.ts / auditComments.test.ts. Records each chain
// call so the test can assert WHAT was inserted.
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown }

function makeChain(response: ChainResponse) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'order'];
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
  },
}));

import { addComment } from '../ticketApi';

function commentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1', ticket_id: 't-1', kind: 'comment', body: 'hi',
    metadata: null, created_by: 'emp-a', created_at: '',
    is_external: false, is_internal: true, ...overrides,
  };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe('addComment — visibility', () => {
  it('defaults new staff comments to internal (is_internal=true)', async () => {
    const chain = makeChain({ data: commentRow(), error: null });
    fromMock.mockImplementation(() => chain);

    const out = await addComment('t-1', 'hi', { createdBy: 'emp-a' });

    const insertCall = chain._calls.find((c) => c.method === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload.is_internal).toBe(true);
    expect(payload.kind).toBe('comment');
    expect(payload.is_external).toBeUndefined(); // never impersonates a customer post
    expect(out.isInternal).toBe(true);
  });

  it('writes is_internal=false when the composer chooses Extern', async () => {
    const chain = makeChain({ data: commentRow({ is_internal: false }), error: null });
    fromMock.mockImplementation(() => chain);

    const out = await addComment('t-1', 'hi', { createdBy: 'emp-a', isInternal: false });

    const payload = chain._calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(payload.is_internal).toBe(false);
    expect(out.isInternal).toBe(false);
  });
});
