import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyFn = (...args: unknown[]) => unknown;

// Chainable thenable mock — same pattern as offerApi.test.ts. Every
// chain method returns the builder, awaiting resolves to the configured
// { data, error } response.
function makeChain(response: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'order'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(response).then(resolve);
  return builder as { [key: string]: ReturnType<typeof vi.fn> } & PromiseLike<unknown>;
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

import {
  listStandorte,
  listAbteilungen,
  listLeaveTypes,
  listEmployees,
  getEmployeeByCode,
  updateEmployee,
  listEmployeeRoles,
  listSubstitutes,
  listCoverageRules,
  listBlackoutPeriods,
  listLeaveRequests,
  createLeaveRequest,
  decideLeaveRequest,
  cancelLeaveRequest,
  updateLeaveRequest,
  getCalendarToken,
  regenerateCalendarToken,
  listLeaveBalances,
  loadRuleContext,
  LEAVE_TYPE_ID_BY_CODE,
} from '../vacationApi';

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset().mockResolvedValue({ data: { success: true }, error: null });
});

describe('lookup tables', () => {
  it('listStandorte returns the rows ordered by id', async () => {
    const chain = makeChain({ data: [{ id: 1, name: 'Klagenfurt' }, { id: 2, name: 'Wolfsberg' }], error: null });
    fromMock.mockReturnValue(chain);
    const result = await listStandorte();
    expect(fromMock).toHaveBeenCalledWith('standorte');
    expect(chain.order).toHaveBeenCalledWith('id');
    expect(result).toEqual([{ id: 1, name: 'Klagenfurt' }, { id: 2, name: 'Wolfsberg' }]);
  });

  it('listAbteilungen returns the rows', async () => {
    const chain = makeChain({ data: [{ id: 1, name: 'Kassen' }], error: null });
    fromMock.mockReturnValue(chain);
    expect(await listAbteilungen()).toEqual([{ id: 1, name: 'Kassen' }]);
  });

  it('listLeaveTypes maps deducts_from_balance to camelCase', async () => {
    const chain = makeChain({
      data: [{ id: 1, code: 'urlaub', label: 'Urlaub', deducts_from_balance: true }],
      error: null,
    });
    fromMock.mockReturnValue(chain);
    const result = await listLeaveTypes();
    expect(result[0]).toEqual({ id: 1, code: 'urlaub', label: 'Urlaub', deductsFromBalance: true });
  });
});

describe('employees', () => {
  const employeeRow = {
    id: 'emp-1', code: 'gkitz', name: 'Georg Kitz',
    standort_id: 1, hire_date: '2010-01-01',
    weekly_hours: '38.5', employment_type: 'fulltime', active: true,
  };

  it('listEmployees defaults to active=true', async () => {
    const chain = makeChain({ data: [employeeRow], error: null });
    fromMock.mockReturnValue(chain);
    const result = await listEmployees();
    expect(chain.eq).toHaveBeenCalledWith('active', true);
    expect(result[0]).toMatchObject({ id: 'emp-1', code: 'gkitz', standortId: 1, weeklyHours: 38.5 });
  });

  it('listEmployees with activeOnly:false skips the filter', async () => {
    const chain = makeChain({ data: [], error: null });
    fromMock.mockReturnValue(chain);
    await listEmployees({ activeOnly: false });
    expect(chain.eq).not.toHaveBeenCalled();
  });

  it('getEmployeeByCode returns the mapped employee', async () => {
    const chain = makeChain({ data: employeeRow, error: null });
    fromMock.mockReturnValue(chain);
    const result = await getEmployeeByCode('gkitz');
    expect(chain.eq).toHaveBeenCalledWith('code', 'gkitz');
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result?.code).toBe('gkitz');
    expect(result?.weeklyHours).toBe(38.5);
  });

  it('getEmployeeByCode returns null when no row found', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);
    expect(await getEmployeeByCode('ghost')).toBeNull();
  });

  it('updateEmployee maps camelCase patch to snake_case columns', async () => {
    const chain = makeChain({ data: { ...employeeRow, hire_date: '2026-05-01' }, error: null });
    fromMock.mockReturnValue(chain);
    await updateEmployee('emp-1', { hireDate: '2026-05-01', weeklyHours: 30 });
    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.hire_date).toBe('2026-05-01');
    expect(updateArg.weekly_hours).toBe(30);
    expect(updateArg.name).toBeUndefined();
  });

  it('updateEmployee throws on supabase error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: new Error('rls denied') }));
    await expect(updateEmployee('emp-1', { active: false })).rejects.toThrow('rls denied');
  });
});

describe('employee_roles + substitutes + coverage_rules + blackouts', () => {
  it('listEmployeeRoles maps snake_case to camelCase', async () => {
    const chain = makeChain({
      data: [{
        id: 'r1', employee_id: 'e1', abteilung_id: 5, standort_id: 2,
        kind: 'secondary', supervisor_employee_id: 'e9', qualifier: 'Aushilfe',
        valid_from: null, valid_to: null,
      }],
      error: null,
    });
    fromMock.mockReturnValue(chain);
    const result = await listEmployeeRoles();
    expect(result[0]).toEqual({
      id: 'r1', employeeId: 'e1', abteilungId: 5, standortId: 2,
      kind: 'secondary', supervisorEmployeeId: 'e9', qualifier: 'Aushilfe',
      validFrom: undefined, validTo: undefined,
    });
  });

  it('listSubstitutes filters by employee when given', async () => {
    const chain = makeChain({ data: [], error: null });
    fromMock.mockReturnValue(chain);
    await listSubstitutes('e1');
    expect(chain.eq).toHaveBeenCalledWith('employee_id', 'e1');
  });

  it('listCoverageRules filters active by default and maps applies_to_employees', async () => {
    const chain = makeChain({
      data: [{
        id: 'cr1', name: 'Stefan ↔ Mario',
        scope_standort_id: null, scope_abteilung_id: null,
        applies_to_employees: ['s', 'm'],
        max_concurrent_on_leave: 1, kind: 'hard', active: true,
      }],
      error: null,
    });
    fromMock.mockReturnValue(chain);
    const result = await listCoverageRules();
    expect(chain.eq).toHaveBeenCalledWith('active', true);
    expect(result[0]).toMatchObject({
      id: 'cr1',
      appliesToEmployees: ['s', 'm'],
      maxConcurrentOnLeave: 1,
      kind: 'hard',
    });
    expect(result[0]?.scopeStandortId).toBeUndefined();
  });

  it('listBlackoutPeriods maps date arrays', async () => {
    const chain = makeChain({
      data: [{
        id: 'bo1', name: 'Wörthersee',
        start_date: '2026-04-25', end_date: '2026-06-30',
        applies_to_standort_ids: [1], applies_to_abteilung_ids: null,
        severity: 'block', active: true,
      }],
      error: null,
    });
    fromMock.mockReturnValue(chain);
    const result = await listBlackoutPeriods();
    expect(result[0]).toMatchObject({
      id: 'bo1', name: 'Wörthersee',
      startDate: '2026-04-25', endDate: '2026-06-30',
      appliesToStandortIds: [1], appliesToAbteilungIds: undefined,
      severity: 'block', active: true,
    });
  });
});

describe('leave requests', () => {
  const leaveRow = {
    id: 'lr1', employee_id: 'e1', leave_type_id: 1,
    start_date: '2026-07-01', end_date: '2026-07-10',
    half_day_start: false, half_day_end: false,
    status: 'pending', reason: null, substitute_id: null,
  };

  it('listLeaveRequests applies all optional filters', async () => {
    const chain = makeChain({ data: [leaveRow], error: null });
    fromMock.mockReturnValue(chain);
    await listLeaveRequests({
      employeeId: 'e1',
      status: ['pending', 'approved'],
      rangeStart: '2026-07-01',
      rangeEnd: '2026-07-31',
    });
    expect(chain.eq).toHaveBeenCalledWith('employee_id', 'e1');
    expect(chain.in).toHaveBeenCalledWith('status', ['pending', 'approved']);
    expect(chain.gte).toHaveBeenCalledWith('end_date', '2026-07-01');
    expect(chain.lte).toHaveBeenCalledWith('start_date', '2026-07-31');
  });

  it('listLeaveRequests maps leave_type_id back to leaveTypeCode', async () => {
    const chain = makeChain({ data: [leaveRow], error: null });
    fromMock.mockReturnValue(chain);
    const result = await listLeaveRequests();
    expect(result[0]?.leaveTypeCode).toBe('urlaub');
  });

  it('listLeaveRequests maps decided_at / decided_by / decision_note from the row', async () => {
    const chain = makeChain({
      data: [{
        ...leaveRow,
        status: 'rejected',
        decided_at: '2026-05-04T10:00:00Z',
        decided_by: 'gkitz-id',
        decision_note: 'Konflikt mit MFP-Lehrling',
      }],
      error: null,
    });
    fromMock.mockReturnValue(chain);
    const result = await listLeaveRequests();
    expect(result[0]).toMatchObject({
      decidedAt: '2026-05-04T10:00:00Z',
      decidedBy: 'gkitz-id',
      decisionNote: 'Konflikt mit MFP-Lehrling',
    });
  });

  it('listLeaveRequests leaves decision fields undefined when null on the row', async () => {
    const chain = makeChain({
      data: [{ ...leaveRow, decided_at: null, decided_by: null, decision_note: null }],
      error: null,
    });
    fromMock.mockReturnValue(chain);
    const result = await listLeaveRequests();
    expect(result[0]?.decidedAt).toBeUndefined();
    expect(result[0]?.decidedBy).toBeUndefined();
    expect(result[0]?.decisionNote).toBeUndefined();
  });

  it('createLeaveRequest converts the leaveTypeCode to leave_type_id', async () => {
    const chain = makeChain({ data: leaveRow, error: null });
    fromMock.mockReturnValue(chain);
    await createLeaveRequest({
      employeeId: 'e1',
      leaveTypeCode: 'krankenstand',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
    });
    const insertArg = chain.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg.leave_type_id).toBe(LEAVE_TYPE_ID_BY_CODE.krankenstand);
    expect(insertArg.status).toBe('pending');
    expect(insertArg.half_day_start).toBe(false);
  });

  it('updateLeaveRequest maps camelCase patch -> snake_case columns', async () => {
    const chain = makeChain({ data: { ...leaveRow, start_date: '2026-08-12' }, error: null });
    fromMock.mockReturnValue(chain);
    await updateLeaveRequest('lr1', {
      startDate: '2026-08-12',
      halfDayStart: true,
      reason: 'updated reason',
      leaveTypeCode: 'krankenstand',
    });
    expect(chain.eq).toHaveBeenCalledWith('id', 'lr1');
    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.start_date).toBe('2026-08-12');
    expect(updateArg.half_day_start).toBe(true);
    expect(updateArg.reason).toBe('updated reason');
    expect(updateArg.leave_type_id).toBe(LEAVE_TYPE_ID_BY_CODE.krankenstand);
    // Untouched fields stay out of the patch.
    expect(updateArg.end_date).toBeUndefined();
    expect(updateArg.employee_id).toBeUndefined();
  });

  it('updateLeaveRequest converts empty strings on optional refs to null', async () => {
    const chain = makeChain({ data: leaveRow, error: null });
    fromMock.mockReturnValue(chain);
    await updateLeaveRequest('lr1', { reason: '', substituteId: '' });
    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.reason).toBeNull();
    expect(updateArg.substitute_id).toBeNull();
  });

  it('updateLeaveRequest throws on supabase error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: new Error('rls denied') }));
    await expect(updateLeaveRequest('lr1', { startDate: '2026-08-12' })).rejects.toThrow('rls denied');
  });

  it('decideLeaveRequest sets decided_by + decided_at + status', async () => {
    const chain = makeChain({ data: { ...leaveRow, status: 'approved' }, error: null });
    fromMock.mockReturnValue(chain);
    await decideLeaveRequest('lr1', 'approved', 'gkitz-id', 'OK');
    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.status).toBe('approved');
    expect(updateArg.decided_by).toBe('gkitz-id');
    expect(updateArg.decision_note).toBe('OK');
    expect(typeof updateArg.decided_at).toBe('string');
  });

  it('decideLeaveRequest stores null for decided_by when omitted (no SSO mapping yet)', async () => {
    const chain = makeChain({ data: { ...leaveRow, status: 'rejected' }, error: null });
    fromMock.mockReturnValue(chain);
    await decideLeaveRequest('lr1', 'rejected');
    const updateArg = chain.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.status).toBe('rejected');
    expect(updateArg.decided_by).toBeNull();
    expect(updateArg.decision_note).toBeNull();
  });

  it('decideLeaveRequest invokes the notify-leave-decision edge function with the request id', async () => {
    const chain = makeChain({ data: { ...leaveRow, status: 'approved' }, error: null });
    fromMock.mockReturnValue(chain);
    await decideLeaveRequest('lr1', 'approved', 'gkitz-id');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('notify-leave-decision', { body: { leaveRequestId: 'lr1' } });
  });

  it('decideLeaveRequest swallows notify errors so the decision still resolves', async () => {
    const chain = makeChain({ data: { ...leaveRow, status: 'approved' }, error: null });
    fromMock.mockReturnValue(chain);
    invokeMock.mockRejectedValueOnce(new Error('resend down'));

    // Suppress the warning we deliberately log on invoke failure.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await decideLeaveRequest('lr1', 'approved', 'gkitz-id');
    expect(result.id).toBe(leaveRow.id);
    // Wait a microtask so the rejected invoke promise is observed.
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('cancelLeaveRequest sets status=cancelled', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);
    await cancelLeaveRequest('lr1');
    expect(chain.update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'lr1');
  });
});

describe('audit log', () => {
  const leaveRow = {
    id: 'lr1', employee_id: 'e1', leave_type_id: 1,
    start_date: '2026-07-01', end_date: '2026-07-10',
    half_day_start: false, half_day_end: false,
    status: 'pending', reason: null, substitute_id: null,
  };

  it('createLeaveRequest writes an audit row with action=leave.created', async () => {
    const chain = makeChain({ data: leaveRow, error: null });
    fromMock.mockReturnValue(chain);
    await createLeaveRequest({
      employeeId: 'e1',
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
    }, { actorId: 'gkitz-id' });

    // The audit insert happens after the leave_requests insert, so the
    // last `from` call should target workforce_audit_log.
    const tables = fromMock.mock.calls.map((c) => c[0]);
    expect(tables).toContain('workforce_audit_log');

    // The chain.insert mock receives both inserts; the last one is the audit row.
    const inserts = chain.insert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const audit = inserts[inserts.length - 1];
    expect(audit.action).toBe('leave.created');
    expect(audit.entity_type).toBe('leave_request');
    expect(audit.entity_id).toBe(leaveRow.id);
    expect(audit.actor_id).toBe('gkitz-id');
    const details = audit.details as Record<string, unknown>;
    expect(details.employeeId).toBe(leaveRow.employee_id);
    expect(details.startDate).toBe(leaveRow.start_date);
  });

  it('createLeaveRequest defaults actor_id to the requester when no actorId is passed', async () => {
    const chain = makeChain({ data: leaveRow, error: null });
    fromMock.mockReturnValue(chain);
    await createLeaveRequest({
      employeeId: 'e1',
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
    });
    const inserts = chain.insert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const audit = inserts[inserts.length - 1];
    expect(audit.actor_id).toBe('e1');
  });

  it('updateLeaveRequest writes an audit row with the patch', async () => {
    const chain = makeChain({ data: leaveRow, error: null });
    fromMock.mockReturnValue(chain);
    await updateLeaveRequest('lr1', { startDate: '2026-08-12' }, { actorId: 'gkitz-id' });

    const inserts = chain.insert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const audit = inserts[inserts.length - 1];
    expect(audit.action).toBe('leave.updated');
    expect(audit.entity_id).toBe('lr1');
    expect(audit.actor_id).toBe('gkitz-id');
    const details = audit.details as Record<string, unknown>;
    expect((details.patch as Record<string, unknown>).startDate).toBe('2026-08-12');
  });

  it('decideLeaveRequest writes an audit row with the decision and note', async () => {
    const chain = makeChain({ data: { ...leaveRow, status: 'approved' }, error: null });
    fromMock.mockReturnValue(chain);
    await decideLeaveRequest('lr1', 'approved', 'gkitz-id', 'OK');

    const inserts = chain.insert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const audit = inserts[inserts.length - 1];
    expect(audit.action).toBe('leave.decided');
    expect(audit.actor_id).toBe('gkitz-id');
    const details = audit.details as Record<string, unknown>;
    expect(details.decision).toBe('approved');
    expect(details.note).toBe('OK');
  });

  it('cancelLeaveRequest writes an audit row with action=leave.cancelled', async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);
    await cancelLeaveRequest('lr1', { actorId: 'sbauer-id' });

    const tables = fromMock.mock.calls.map((c) => c[0]);
    expect(tables).toContain('workforce_audit_log');

    const inserts = chain.insert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const audit = inserts[inserts.length - 1];
    expect(audit.action).toBe('leave.cancelled');
    expect(audit.entity_id).toBe('lr1');
    expect(audit.actor_id).toBe('sbauer-id');
  });

  it('audit failure does not break the user-facing operation', async () => {
    // First call (leave_requests) succeeds; subsequent (workforce_audit_log) fails.
    const goodChain = makeChain({ data: leaveRow, error: null });
    const badChain = makeChain({ data: null, error: new Error('audit rls') });
    fromMock
      .mockReturnValueOnce(goodChain)
      .mockReturnValueOnce(badChain);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await createLeaveRequest({
      employeeId: 'e1',
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
    });
    expect(result.id).toBe(leaveRow.id);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('calendar token', () => {
  it('getCalendarToken returns the existing token for the employee', async () => {
    const chain = makeChain({ data: { calendar_token: 'abc-123' }, error: null });
    fromMock.mockReturnValue(chain);

    const token = await getCalendarToken('emp-1');

    expect(fromMock).toHaveBeenCalledWith('employees');
    expect(chain.eq).toHaveBeenCalledWith('id', 'emp-1');
    expect(chain.single).toHaveBeenCalled();
    expect(token).toBe('abc-123');
  });

  it('getCalendarToken throws on supabase error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: new Error('rls denied') }));
    await expect(getCalendarToken('emp-1')).rejects.toThrow('rls denied');
  });

  it('regenerateCalendarToken patches employees.calendar_token with a new UUID', async () => {
    const chain = makeChain({ data: { calendar_token: 'fresh-uuid' }, error: null });
    fromMock.mockReturnValue(chain);
    // jsdom polyfills crypto.randomUUID — make it deterministic so we
    // can assert the exact patch payload.
    const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('fresh-uuid' as `${string}-${string}-${string}-${string}-${string}`);

    const token = await regenerateCalendarToken('emp-1');

    expect(chain.update).toHaveBeenCalledWith({ calendar_token: 'fresh-uuid' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'emp-1');
    expect(token).toBe('fresh-uuid');
    uuidSpy.mockRestore();
  });

  it('regenerateCalendarToken throws on supabase error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: new Error('rls denied') }));
    await expect(regenerateCalendarToken('emp-1')).rejects.toThrow('rls denied');
  });
});

describe('leave balances', () => {
  it('listLeaveBalances scopes to employee + year and maps the row', async () => {
    const chain = makeChain({
      data: [{
        id: 'b1', employee_id: 'e1', year: 2026, leave_type_id: 1,
        entitled: '25.0', carried_over: '0.0', used: '5.0', planned: '3.0',
      }],
      error: null,
    });
    fromMock.mockReturnValue(chain);
    const result = await listLeaveBalances('e1', 2026);
    expect(chain.eq).toHaveBeenCalledWith('employee_id', 'e1');
    expect(chain.eq).toHaveBeenCalledWith('year', 2026);
    expect(result[0]).toEqual({
      id: 'b1', employeeId: 'e1', year: 2026,
      leaveTypeCode: 'urlaub',
      entitled: 25, carriedOver: 0, used: 5, planned: 3,
    });
  });
});

describe('loadRuleContext', () => {
  it('parallel-fetches everything the rules engine needs', async () => {
    fromMock.mockImplementation((...args: unknown[]) => {
      const table = args[0] as string;
      switch (table) {
        case 'employees':         return makeChain({ data: [], error: null });
        case 'employee_roles':    return makeChain({ data: [], error: null });
        case 'leave_requests':    return makeChain({ data: [], error: null });
        case 'coverage_rules':    return makeChain({ data: [], error: null });
        case 'blackout_periods':  return makeChain({ data: [], error: null });
        case 'substitutes':       return makeChain({ data: [], error: null });
        default: throw new Error(`unexpected table ${table}`);
      }
    });

    const ctx = await loadRuleContext({ today: '2026-05-04', rangeStart: '2026-07-01', rangeEnd: '2026-07-31' });

    expect(ctx.today).toBe('2026-05-04');
    expect(ctx.employees).toEqual([]);
    expect(ctx.roles).toEqual([]);
    expect(ctx.existingLeaves).toEqual([]);
    expect(ctx.coverageRules).toEqual([]);
    expect(ctx.blackouts).toEqual([]);
    expect(ctx.substitutes).toEqual([]);
    const tablesQueried = fromMock.mock.calls.map((c) => c[0]).sort();
    expect(tablesQueried).toEqual([
      'blackout_periods', 'coverage_rules', 'employee_roles', 'employees', 'leave_requests', 'substitutes',
    ]);
  });

  it('defaults today to the current date if not provided', async () => {
    fromMock.mockImplementation(() => makeChain({ data: [], error: null }));
    const ctx = await loadRuleContext();
    expect(ctx.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
