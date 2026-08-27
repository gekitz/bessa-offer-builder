import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase query builder — mirrors addComment.test.ts, plus a
// stubbed functions.invoke so we can assert the fire-and-forget
// notify-appointment-event calls each mutation makes.
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown }

function makeChain(response: ChainResponse) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'order'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(response).then(resolve);
  return builder as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
}

const fromMock = vi.fn<AnyFn>();
const invokeMock = vi.fn<AnyFn>();
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import {
  createAppointment,
  updateAppointment,
  deleteAppointment,
  setAppointmentAssignees,
} from '../ticketApi';

function apptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1', ticket_id: null, mesonic_customer_id: null, customer_name: null,
    title: 'Kasse tauschen', description: null, kind: 'reparatur',
    starts_at: '2026-09-01T08:00:00Z', ends_at: '2026-09-01T09:00:00Z',
    all_day: false, location: 'Klagenfurt', status: 'geplant', standort_id: 1,
    notes: null, created_by: null, created_at: '', updated_at: '', ...overrides,
  };
}

// Pull out the notify-appointment-event invocations (ignoring any
// notify-ticket-event calls a ticket-tied appointment also makes).
function apptNotifyCalls() {
  return invokeMock.mock.calls.filter((c) => c[0] === 'notify-appointment-event');
}

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset().mockResolvedValue({ data: { success: true }, error: null });
});

describe('createAppointment notifications', () => {
  it('notifies the assignees with event=created and the creator as triggeredBy', async () => {
    // 1) appointments insert → row, 2) appointment_assignees insert → ok
    fromMock
      .mockReturnValueOnce(makeChain({ data: apptRow(), error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }));

    await createAppointment(
      { title: 'Kasse tauschen', startsAt: '2026-09-01T08:00:00Z', endsAt: '2026-09-01T09:00:00Z', createdBy: 'gkitz-id' },
      [{ employeeId: 'tech-a', role: 'lead' }, { employeeId: 'tech-b' }],
    );

    const calls = apptNotifyCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      body: {
        event: 'created',
        appointmentId: 'appt-1',
        recipientIds: ['tech-a', 'tech-b'],
        triggeredBy: 'gkitz-id',
      },
    });
  });

  it('does not fire an appointment notification when there are no assignees', async () => {
    fromMock.mockReturnValueOnce(makeChain({ data: apptRow(), error: null }));
    await createAppointment(
      { title: 'Intern', startsAt: '2026-09-01T08:00:00Z', endsAt: '2026-09-01T09:00:00Z', createdBy: 'gkitz-id' },
      [],
    );
    expect(apptNotifyCalls()).toHaveLength(0);
  });
});

describe('updateAppointment notifications', () => {
  it('fires event=updated with the changed fields + actor when a notifiable field moves', async () => {
    fromMock.mockReturnValueOnce(makeChain({ data: apptRow({ starts_at: '2026-09-02T08:00:00Z' }), error: null }));

    await updateAppointment(
      'appt-1',
      { startsAt: '2026-09-02T08:00:00Z', endsAt: '2026-09-02T09:00:00Z' },
      { actorId: 'gkitz-id' },
    );

    const calls = apptNotifyCalls();
    expect(calls).toHaveLength(1);
    const body = calls[0][1] as { body: any };
    expect(body.body.event).toBe('updated');
    expect(body.body.appointmentId).toBe('appt-1');
    expect(body.body.triggeredBy).toBe('gkitz-id');
    expect(body.body.changedFields).toEqual(['startsAt', 'endsAt']);
  });

  it('stays silent when only non-notifiable fields (e.g. notes) change', async () => {
    fromMock.mockReturnValueOnce(makeChain({ data: apptRow(), error: null }));
    await updateAppointment('appt-1', { notes: 'nur intern' }, { actorId: 'gkitz-id' });
    expect(apptNotifyCalls()).toHaveLength(0);
  });
});

describe('deleteAppointment notifications', () => {
  it('captures assignees + a snapshot before deleting and fires event=cancelled', async () => {
    // 1) pre-delete select → row with assignees, 2) delete → ok
    fromMock
      .mockReturnValueOnce(makeChain({
        data: apptRow({ appointment_assignees: [{ employee_id: 'tech-a' }, { employee_id: 'tech-b' }] }),
        error: null,
      }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }));

    await deleteAppointment('appt-1', { actorId: 'gkitz-id' });

    const calls = apptNotifyCalls();
    expect(calls).toHaveLength(1);
    const body = (calls[0][1] as { body: any }).body;
    expect(body.event).toBe('cancelled');
    expect(body.recipientIds).toEqual(['tech-a', 'tech-b']);
    expect(body.triggeredBy).toBe('gkitz-id');
    expect(body.snapshot).toEqual({
      title: 'Kasse tauschen',
      startsAt: '2026-09-01T08:00:00Z',
      endsAt: '2026-09-01T09:00:00Z',
      location: 'Klagenfurt',
      kind: 'reparatur',
    });
  });
});

describe('setAppointmentAssignees notifications', () => {
  it('fires assigned for added and unassigned for removed employees (diffed against the current set)', async () => {
    // 1) before select → [tech-a, tech-c], 2) delete → ok, 3) insert → ok
    fromMock
      .mockReturnValueOnce(makeChain({ data: [{ employee_id: 'tech-a' }, { employee_id: 'tech-c' }], error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }));

    // New set: keep tech-a, add tech-b, drop tech-c.
    await setAppointmentAssignees(
      'appt-1',
      [{ employeeId: 'tech-a', role: 'lead' }, { employeeId: 'tech-b' }],
      { actorId: 'gkitz-id' },
    );

    const calls = apptNotifyCalls();
    expect(calls).toHaveLength(2);
    const byEvent = Object.fromEntries(calls.map((c) => [(c[1] as any).body.event, (c[1] as any).body]));
    expect(byEvent.assigned).toEqual({
      event: 'assigned', appointmentId: 'appt-1', recipientIds: ['tech-b'], triggeredBy: 'gkitz-id',
    });
    expect(byEvent.unassigned).toEqual({
      event: 'unassigned', appointmentId: 'appt-1', recipientIds: ['tech-c'], triggeredBy: 'gkitz-id',
    });
  });

  it('does not fire when the assignee set is unchanged', async () => {
    fromMock
      .mockReturnValueOnce(makeChain({ data: [{ employee_id: 'tech-a' }], error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }));

    await setAppointmentAssignees('appt-1', [{ employeeId: 'tech-a', role: 'lead' }], { actorId: 'gkitz-id' });
    expect(apptNotifyCalls()).toHaveLength(0);
  });

  it('swallows notify errors so the mutation still resolves', async () => {
    fromMock
      .mockReturnValueOnce(makeChain({ data: [], error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }));
    invokeMock.mockRejectedValueOnce(new Error('resend down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      setAppointmentAssignees('appt-1', [{ employeeId: 'tech-x' }], { actorId: 'gkitz-id' }),
    ).resolves.toBeUndefined();

    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
