import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase query builder mirroring the publicTicketApi
// test harness. Each chain method records its name + args so the
// test can assert WHICH table we hit and WHICH payload was inserted.
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown }

interface FromCall {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

function makeChain(table: string, response: ChainResponse) {
  const calls: FromCall['calls'] = [];
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
  return Object.assign(builder, { _calls: calls, _table: table }) as Record<string, ReturnType<typeof vi.fn>> & {
    _calls: typeof calls;
    _table: string;
  };
}

const fromMock = vi.fn<AnyFn>();
const invokeMock = vi.fn<AnyFn>();
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { createRepairOrder, setTicketStatus, signRepairOrder, updateTicket } from '../ticketApi';

// Realistic-shape ticket row the SELECTs after UPDATE return.
const TICKET_ROW = {
  id: 't-1', ticket_number: '26-0000001', share_code: 'sc-1',
  title: 'Drucker', description: null, kind: 'reparatur', priority: 'normal',
  status: 'in_progress', pool_abteilung_id: null, assigned_to: null,
  mesonic_customer_id: null, customer_name: null, customer_phone: null,
  customer_email: null, customer_address: null,
  customer_has_wartungsvertrag: false, standort_id: null,
  billable: true, closed_at: null, closed_by: null, resolution_note: null,
  offer_id: null, mesonic_beleg_id: null, created_by: null,
  created_at: '', updated_at: '',
};

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset().mockResolvedValue({ data: { success: true }, error: null });
});

// Helper to collect from() calls in order
function expectInsertOn(chains: Array<ReturnType<typeof makeChain>>, table: string, predicate: (payload: Record<string, unknown>) => boolean) {
  const ticketCommentChain = chains.find((c) => c._table === table);
  expect(ticketCommentChain, `expected an insert on ${table}`).toBeDefined();
  const insertCall = ticketCommentChain!._calls.find((c) => c.method === 'insert');
  expect(insertCall).toBeDefined();
  expect(predicate(insertCall!.args[0] as Record<string, unknown>)).toBe(true);
  return insertCall!.args[0] as Record<string, unknown>;
}

describe('setTicketStatus — audit comment', () => {
  it('inserts a status_change comment when the status actually changes', async () => {
    // 1. SELECT prev status (returns 'open')
    // 2. UPDATE tickets, returning the new row (status='in_progress')
    // 3. INSERT into ticket_comments
    const prevChain = makeChain('tickets', { data: { status: 'open' }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, status: 'in_progress' }, error: null });
    const commentChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => commentChain);

    await setTicketStatus('t-1', 'in_progress', { actorId: 'emp-a' });

    // Allow the fire-and-forget audit insert to settle (it is awaited
    // via void-promise; the test must let the microtask queue drain).
    await Promise.resolve();
    await Promise.resolve();

    const payload = expectInsertOn([commentChain], 'ticket_comments', (p) => p.kind === 'status_change');
    expect(payload.ticket_id).toBe('t-1');
    expect(payload.body).toBe('Status: Offen → In Arbeit');
    expect(payload.is_external).toBe(false);
    expect(payload.created_by).toBe('emp-a');
    expect((payload.metadata as Record<string, unknown>).previousStatus).toBe('open');
    expect((payload.metadata as Record<string, unknown>).newStatus).toBe('in_progress');
  });

  it('does NOT insert an audit comment when the status is unchanged', async () => {
    const prevChain = makeChain('tickets', { data: { status: 'in_progress' }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, status: 'in_progress' }, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain);

    await setTicketStatus('t-1', 'in_progress', { actorId: 'emp-a' });
    await Promise.resolve();
    // Only two from() calls — no third call for the comment insert.
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it('uses closedBy as actorId when actorId is not explicitly passed', async () => {
    const prevChain = makeChain('tickets', { data: { status: 'open' }, error: null });
    const updateChain = makeChain('tickets', {
      data: { ...TICKET_ROW, status: 'closed', closed_by: 'emp-z' },
      error: null,
    });
    const commentChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => commentChain);

    await setTicketStatus('t-1', 'closed', { closedBy: 'emp-z', resolutionNote: 'done' });
    await Promise.resolve();
    await Promise.resolve();

    const payload = expectInsertOn([commentChain], 'ticket_comments', (p) => p.kind === 'status_change');
    expect(payload.created_by).toBe('emp-z');
  });
});

describe('updateTicket — assignment audit comment', () => {
  it('inserts an assignment comment when assignedTo changes (with names)', async () => {
    // 1. SELECT prev assigned_to (returns 'emp-a')
    // 2. UPDATE tickets
    // 3. SELECT employees by id to resolve names
    // 4. INSERT into ticket_comments
    const prevChain = makeChain('tickets', { data: { assigned_to: 'emp-a' }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, assigned_to: 'emp-b' }, error: null });
    const employeesChain = makeChain('employees', {
      data: [
        { id: 'emp-a', name: 'Alice' },
        { id: 'emp-b', name: 'Bob' },
      ],
      error: null,
    });
    const commentChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => employeesChain)
      .mockImplementationOnce(() => commentChain);

    await updateTicket('t-1', { assignedTo: 'emp-b' }, { actorId: 'emp-z' });
    await Promise.resolve();
    await Promise.resolve();

    const payload = expectInsertOn([commentChain], 'ticket_comments', (p) => p.kind === 'assignment');
    expect(payload.body).toBe('Zuweisung: Alice → Bob');
    expect(payload.created_by).toBe('emp-z');
    expect((payload.metadata as Record<string, unknown>).previousAssignedTo).toBe('emp-a');
    expect((payload.metadata as Record<string, unknown>).newAssignedTo).toBe('emp-b');
  });

  it('inserts "Zuweisung entfernt" when assignedTo goes from set to null', async () => {
    const prevChain = makeChain('tickets', { data: { assigned_to: 'emp-a' }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, assigned_to: null }, error: null });
    const employeesChain = makeChain('employees', {
      data: [{ id: 'emp-a', name: 'Alice' }],
      error: null,
    });
    const commentChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => employeesChain)
      .mockImplementationOnce(() => commentChain);

    await updateTicket('t-1', { assignedTo: null });
    await Promise.resolve();
    await Promise.resolve();

    const payload = expectInsertOn([commentChain], 'ticket_comments', (p) => p.kind === 'assignment');
    expect(payload.body).toBe('Zuweisung entfernt (zuvor: Alice)');
  });

  it('inserts "Zugewiesen" when assignedTo goes from null to set', async () => {
    const prevChain = makeChain('tickets', { data: { assigned_to: null }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, assigned_to: 'emp-b' }, error: null });
    const employeesChain = makeChain('employees', {
      data: [{ id: 'emp-b', name: 'Bob' }],
      error: null,
    });
    const commentChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => employeesChain)
      .mockImplementationOnce(() => commentChain);

    await updateTicket('t-1', { assignedTo: 'emp-b' });
    await Promise.resolve();
    await Promise.resolve();

    const payload = expectInsertOn([commentChain], 'ticket_comments', (p) => p.kind === 'assignment');
    expect(payload.body).toBe('Zugewiesen: Bob');
  });

  it('notifies the new assignee on reassignment', async () => {
    const prevChain = makeChain('tickets', { data: { assigned_to: 'emp-a' }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, assigned_to: 'emp-b' }, error: null });
    const employeesChain = makeChain('employees', {
      data: [{ id: 'emp-a', name: 'Alice' }, { id: 'emp-b', name: 'Bob' }],
      error: null,
    });
    const commentChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => employeesChain)
      .mockImplementationOnce(() => commentChain);

    await updateTicket('t-1', { assignedTo: 'emp-b' }, { actorId: 'emp-z' });
    await Promise.resolve();
    await Promise.resolve();

    const call = invokeMock.mock.calls.find((c) => c[0] === 'notify-ticket-event');
    expect(call, 'expected a notify-ticket-event invoke').toBeDefined();
    expect((call![1] as { body: unknown }).body).toMatchObject({
      event: 'ticket_assigned',
      ticketId: 't-1',
      triggeredBy: 'emp-z',
    });
  });

  it('does NOT notify when the ticket is unassigned (set to null)', async () => {
    const prevChain = makeChain('tickets', { data: { assigned_to: 'emp-a' }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, assigned_to: null }, error: null });
    const employeesChain = makeChain('employees', { data: [{ id: 'emp-a', name: 'Alice' }], error: null });
    const commentChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => employeesChain)
      .mockImplementationOnce(() => commentChain);

    await updateTicket('t-1', { assignedTo: null });
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock.mock.calls.find((c) => c[0] === 'notify-ticket-event')).toBeUndefined();
  });

  it('does NOT insert an assignment comment for unrelated patches (title/description)', async () => {
    const updateChain = makeChain('tickets', { data: TICKET_ROW, error: null });
    fromMock.mockImplementationOnce(() => updateChain);

    await updateTicket('t-1', { title: 'Neuer Titel' });
    // Only one from() — no prev-select since patch didn't touch assignedTo.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT insert when assignedTo is in the patch but the value is unchanged', async () => {
    const prevChain = makeChain('tickets', { data: { assigned_to: 'emp-a' }, error: null });
    const updateChain = makeChain('tickets', { data: { ...TICKET_ROW, assigned_to: 'emp-a' }, error: null });
    fromMock
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updateChain);

    await updateTicket('t-1', { assignedTo: 'emp-a' });
    await Promise.resolve();
    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});

describe('createRepairOrder — status bump + milestone', () => {
  it('bumps an open ticket to in_progress and writes a milestone', async () => {
    const roChain = makeChain('repair_orders', { data: { id: 'ro-1', ticket_id: 't-1' }, error: null });
    const statusChain = makeChain('tickets', { data: { status: 'open' }, error: null }); // status check
    // setTicketStatus internals:
    const prevChain = makeChain('tickets', { data: { status: 'open' }, error: null });
    const updChain = makeChain('tickets', { data: { ...TICKET_ROW, status: 'in_progress' }, error: null });
    const statusCommentChain = makeChain('ticket_comments', { data: null, error: null });
    const milestoneChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => roChain)
      .mockImplementationOnce(() => statusChain)
      .mockImplementationOnce(() => prevChain)
      .mockImplementationOnce(() => updChain)
      .mockImplementationOnce(() => statusCommentChain)
      .mockImplementationOnce(() => milestoneChain);

    await createRepairOrder({ ticketId: 't-1', createdBy: 'emp-a' });
    await Promise.resolve();
    await Promise.resolve();

    const upd = updChain._calls.find((c) => c.method === 'update');
    expect(upd?.args[0]).toMatchObject({ status: 'in_progress' });
    const ms = milestoneChain._calls.find((c) => c.method === 'insert');
    expect(ms?.args[0]).toMatchObject({ kind: 'milestone', body: 'Ein Reparaturschein wurde erstellt.' });
  });

  it('does NOT bump a ticket that is not open, but still writes a milestone', async () => {
    const roChain = makeChain('repair_orders', { data: { id: 'ro-2', ticket_id: 't-1' }, error: null });
    const statusChain = makeChain('tickets', { data: { status: 'in_progress' }, error: null });
    const milestoneChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock
      .mockImplementationOnce(() => roChain)
      .mockImplementationOnce(() => statusChain)
      .mockImplementationOnce(() => milestoneChain);

    await createRepairOrder({ ticketId: 't-1', createdBy: 'emp-a' });
    await Promise.resolve();
    await Promise.resolve();

    // Only 3 from() calls: repair_orders insert, status check, milestone.
    expect(fromMock).toHaveBeenCalledTimes(3);
    const ms = milestoneChain._calls.find((c) => c.method === 'insert');
    expect(ms?.args[0]).toMatchObject({ kind: 'milestone' });
  });
});

describe('signRepairOrder — milestone', () => {
  it('writes a "unterschrieben" milestone on sign', async () => {
    const signChain = makeChain('repair_orders', {
      data: { id: 'ro-1', ticket_id: 't-1', status: 'signed' },
      error: null,
    });
    const milestoneChain = makeChain('ticket_comments', { data: null, error: null });
    fromMock.mockImplementationOnce(() => signChain).mockImplementationOnce(() => milestoneChain);

    await signRepairOrder('ro-1', 'data:image/png;base64,x', 'Max Mustermann');
    await Promise.resolve();
    await Promise.resolve();

    const ms = milestoneChain._calls.find((c) => c.method === 'insert');
    expect(ms?.args[0]).toMatchObject({
      ticket_id: 't-1',
      kind: 'milestone',
      body: 'Reparaturschein wurde unterschrieben.',
    });
  });
});
