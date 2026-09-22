import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase query builder — mirrors the harness in
// publicTicketApi.test.ts / auditComments.test.ts. Records each chain
// call so the test can assert WHAT was inserted.
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
const invokeMock = vi.fn<AnyFn>(() => Promise.resolve({ data: null, error: null }));
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { addComment, addWatchers, listWatchers } from '../ticketApi';

function commentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1', ticket_id: 't-1', kind: 'comment', body: 'hi',
    metadata: null, created_by: 'emp-a', created_at: '',
    is_external: false, is_internal: true, ...overrides,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockImplementation(() => Promise.resolve({ data: null, error: null }));
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
    expect(payload.metadata).toBeNull(); // no mentions → no metadata
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

describe('addComment — mentions & watchers', () => {
  it('stores deduped mentions in metadata and strips the author', async () => {
    const chain = makeChain({ data: commentRow({ metadata: { mentions: ['emp-b'] } }), error: null });
    fromMock.mockImplementation(() => chain);

    await addComment('t-1', 'hey @Bob', {
      createdBy: 'emp-a',
      mentions: ['emp-b', 'emp-b', 'emp-a'], // duplicate + self
    });

    const payload = chain._calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(payload.metadata).toEqual({ mentions: ['emp-b'] });
  });

  it('upserts author + mentions as watchers', async () => {
    const chain = makeChain({ data: commentRow(), error: null });
    fromMock.mockImplementation(() => chain);

    await addComment('t-1', 'hey @Bob', { createdBy: 'emp-a', mentions: ['emp-b'] });

    const upsert = chain._calls.find((c) => c.method === 'upsert');
    expect(upsert, 'expected a ticket_watchers upsert').toBeDefined();
    const rows = upsert!.args[0] as Array<{ ticket_id: string; employee_id: string }>;
    expect(rows).toEqual(
      expect.arrayContaining([
        { ticket_id: 't-1', employee_id: 'emp-a' },
        { ticket_id: 't-1', employee_id: 'emp-b' },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it('fires the comment_added notify with the new comment id + author', async () => {
    const chain = makeChain({ data: commentRow(), error: null });
    fromMock.mockImplementation(() => chain);

    await addComment('t-1', 'hi', { createdBy: 'emp-a' });

    expect(invokeMock).toHaveBeenCalledWith('notify-ticket-event', {
      body: { event: 'comment_added', ticketId: 't-1', commentId: 'c-1', triggeredBy: 'emp-a' },
    });
  });

  it('does not fail the comment if the watcher upsert errors', async () => {
    // ticket_comments insert succeeds; ticket_watchers upsert rejects.
    const commentChain = makeChain({ data: commentRow(), error: null });
    const watcherChain = makeChain({ data: null, error: { message: 'boom' } });
    fromMock.mockImplementation((table: unknown) =>
      table === 'ticket_watchers' ? watcherChain : commentChain,
    );

    const out = await addComment('t-1', 'hi', { createdBy: 'emp-a', mentions: ['emp-b'] });
    expect(out.id).toBe('c-1'); // comment still returned
  });
});

describe('watcher helpers', () => {
  it('addWatchers dedupes and uses ignoreDuplicates upsert', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockImplementation(() => chain);

    await addWatchers('t-1', ['emp-a', 'emp-a', 'emp-b']);

    const upsert = chain._calls.find((c) => c.method === 'upsert')!;
    expect(upsert.args[0]).toEqual([
      { ticket_id: 't-1', employee_id: 'emp-a' },
      { ticket_id: 't-1', employee_id: 'emp-b' },
    ]);
    expect(upsert.args[1]).toEqual({ onConflict: 'ticket_id,employee_id', ignoreDuplicates: true });
  });

  it('addWatchers skips the round-trip when the id list is empty', async () => {
    fromMock.mockImplementation(() => makeChain({ data: null, error: null }));
    await addWatchers('t-1', []);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('listWatchers maps joined employee names', async () => {
    const chain = makeChain({
      data: [{ employee_id: 'emp-a', created_at: '2026-09-10', employees: { name: 'Anna' } }],
      error: null,
    });
    fromMock.mockImplementation(() => chain);

    const out = await listWatchers('t-1');
    expect(out).toEqual([{ employeeId: 'emp-a', name: 'Anna', createdAt: '2026-09-10' }]);
  });
});
