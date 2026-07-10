import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyFn = (...args: unknown[]) => unknown;

interface ChainResponse {
  data: unknown;
  error: unknown;
}

// Chainable Supabase query builder. Each chain call records its name +
// args so the test can assert *which* columns were SELECTed (the
// security boundary), what was filtered, and what was INSERTed.
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
  return Object.assign(builder, { _calls: calls }) as {
    [key: string]: ReturnType<typeof vi.fn>;
  } & { _calls: typeof calls } & PromiseLike<unknown>;
}

const fromMock = vi.fn<AnyFn>();
const invokeMock = vi.fn<AnyFn>();
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

import { addPublicComment, getPublicTicketView } from '../publicTicketApi';

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset().mockResolvedValue({ data: { success: true }, error: null });
});

describe('getPublicTicketView', () => {
  it('returns null when the share_code does not match any ticket', async () => {
    const ticketChain = makeChain({ data: null, error: null });
    fromMock.mockImplementation(() => ticketChain);
    const result = await getPublicTicketView('unknown');
    expect(result).toBeNull();
  });

  it('selects only the whitelisted public columns from tickets', async () => {
    const ticketChain = makeChain({
      data: {
        id: 't-1', share_code: 'sc-1', ticket_number: '26-0000001',
        title: 'X', description: null, kind: 'reparatur', status: 'open',
        customer_name: 'Müller', closed_at: null, resolution_note: null,
        created_at: '2026-05-12T08:00:00Z',
      },
      error: null,
    });
    const apptChain = makeChain({ data: [], error: null });
    const commentChain = makeChain({ data: [], error: null });
    fromMock
      .mockImplementationOnce(() => ticketChain)
      .mockImplementationOnce(() => apptChain)
      .mockImplementationOnce(() => commentChain);

    await getPublicTicketView('sc-1');

    const selectCall = ticketChain._calls.find((c) => c.method === 'select');
    expect(selectCall).toBeDefined();
    const cols = String(selectCall!.args[0]);
    // The customer projection must NOT include any of these internal fields.
    for (const internal of [
      'assigned_to',
      'customer_phone',
      'customer_email',
      'customer_address',
      'pool_abteilung_id',
      'customer_has_wartungsvertrag',
      'mesonic_beleg_id',
      'standort_id',
    ]) {
      expect(cols).not.toContain(internal);
    }
    // And it must include the public-safe fields.
    for (const pub of ['ticket_number', 'share_code', 'title', 'kind', 'status', 'customer_name', 'resolution_note']) {
      expect(cols).toContain(pub);
    }
  });

  it('filters comments to public kinds only', async () => {
    const ticketChain = makeChain({
      data: {
        id: 't-1', share_code: 'sc-1', ticket_number: '26-0000001',
        title: 'X', description: null, kind: 'support', status: 'open',
        customer_name: null, closed_at: null, resolution_note: null,
        created_at: '',
      },
      error: null,
    });
    const apptChain = makeChain({ data: [], error: null });
    const commentChain = makeChain({ data: [], error: null });
    fromMock
      .mockImplementationOnce(() => ticketChain)
      .mockImplementationOnce(() => apptChain)
      .mockImplementationOnce(() => commentChain);

    await getPublicTicketView('sc-1');

    const inCall = commentChain._calls.find((c) => c.method === 'in');
    expect(inCall).toBeDefined();
    expect(inCall!.args[0]).toBe('kind');
    // Customer-safe kinds only — 'assignment' and 'system' must not leak.
    expect(inCall!.args[1]).toEqual(['comment', 'status_change', 'milestone']);
  });

  it('exposes only public appointment fields (no internal standort/notes/created_by)', async () => {
    const ticketChain = makeChain({
      data: {
        id: 't-1', share_code: 'sc-1', ticket_number: '26-0000001',
        title: 'X', description: null, kind: 'support', status: 'open',
        customer_name: null, closed_at: null, resolution_note: null,
        created_at: '',
      },
      error: null,
    });
    const apptChain = makeChain({ data: [], error: null });
    const commentChain = makeChain({ data: [], error: null });
    fromMock
      .mockImplementationOnce(() => ticketChain)
      .mockImplementationOnce(() => apptChain)
      .mockImplementationOnce(() => commentChain);

    await getPublicTicketView('sc-1');

    const selectCall = apptChain._calls.find((c) => c.method === 'select');
    const cols = String(selectCall!.args[0]);
    for (const internal of ['standort_id', 'notes', 'created_by', 'mesonic_customer_id']) {
      expect(cols).not.toContain(internal);
    }
  });
});

describe('addPublicComment', () => {
  it('writes is_external=TRUE, kind="comment" and created_by=null', async () => {
    const ticketChain = makeChain({ data: { id: 't-1' }, error: null });
    const insertChain = makeChain({
      data: { id: 'c-1', ticket_id: 't-1', kind: 'comment', body: 'hi', metadata: null, created_at: '', is_external: true },
      error: null,
    });
    fromMock
      .mockImplementationOnce(() => ticketChain)
      .mockImplementationOnce(() => insertChain);

    const out = await addPublicComment('sc-1', 'hi');

    const insertCall = insertChain._calls.find((c) => c.method === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload.is_external).toBe(true);
    expect(payload.kind).toBe('comment');
    expect(payload.created_by).toBeNull();
    expect(payload.ticket_id).toBe('t-1');
    expect(out.isExternal).toBe(true);

    // Fires the customer_replied notification with share_code so the
    // edge function can validate it against the ticket.
    expect(invokeMock).toHaveBeenCalledWith('notify-ticket-event', {
      body: { event: 'customer_replied', ticketId: 't-1', shareCode: 'sc-1' },
    });
  });

  it('throws when the share_code does not match any ticket', async () => {
    const ticketChain = makeChain({ data: null, error: null });
    fromMock.mockImplementationOnce(() => ticketChain);
    await expect(addPublicComment('unknown', 'hi')).rejects.toThrow('Auftrag nicht gefunden');
  });

  it('rejects empty bodies before hitting the network', async () => {
    await expect(addPublicComment('sc-1', '   ')).rejects.toThrow('darf nicht leer sein');
    expect(fromMock).not.toHaveBeenCalled();
  });
});
