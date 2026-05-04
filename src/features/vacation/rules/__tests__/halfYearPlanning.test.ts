import { describe, it, expect } from 'vitest';
import { halfYearPlanning } from '../halfYearPlanning';
import type { Employee, LeaveRequest, RuleContext } from '../../types';

const stefan: Employee = {
  id: 'sbauer-id',
  code: 'sbauer',
  name: 'Stefan Bauer',
  standortId: 2,
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    today: '2026-05-01',
    employees: [stefan],
    roles: [],
    existingLeaves: [],
    coverageRules: [],
    blackouts: [],
    leaveBalances: [
      { employeeId: stefan.id, year: 2026, leaveTypeCode: 'urlaub', entitled: 25, carriedOver: 0 },
    ],
    ...overrides,
  };
}

function urlaubReq(start: string, end: string, overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: start,
    endDate: end,
    status: 'pending',
    ...overrides,
  };
}

describe('halfYearPlanning', () => {
  it('passes silently for non-Urlaub leave types', () => {
    const result = halfYearPlanning(
      urlaubReq('2026-05-04', '2026-05-08', { leaveTypeCode: 'krankenstand' }),
      ctx(),
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('passes silently when no balance row exists', () => {
    const result = halfYearPlanning(urlaubReq('2026-05-04', '2026-05-08'), ctx({ leaveBalances: [] }));
    expect(result.warnings).toHaveLength(0);
  });

  it('skips the warning before April 1 (grace period)', () => {
    // Today is March 15 — too early to nag about half-year planning.
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({ today: '2026-03-15', existingLeaves: [] }),
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when H1 days fall short of 50% of entitlement', () => {
    // Today April 1, no other leaves, request is 5 days. Entitlement = 25, threshold = 12.5.
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({ today: '2026-04-01' }),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('50%');
    expect(result.warnings[0].message).toContain('12.5');
    expect(result.warnings[0].message).toContain('25');
    expect(result.warnings[0].message).toContain('5');
    expect(result.violations).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('passes when the new request brings H1 over 50%', () => {
    // 13 H1 days requested → over 12.5 threshold.
    const result = halfYearPlanning(
      urlaubReq('2026-04-06', '2026-04-22'),
      ctx({ today: '2026-04-01' }),
    );
    // 2026-04-06 (Mon) – 2026-04-22 (Wed): 13 working days.
    expect(result.warnings).toHaveLength(0);
  });

  it('counts existing approved + pending Urlaub in H1', () => {
    // 6 days already booked + 5 in this request = 11. Still < 12.5 → warn.
    const existing = urlaubReq('2026-02-09', '2026-02-16', { id: 'lr-1', status: 'approved' });
    // 2026-02-09 (Mon) – 2026-02-16 (Mon): 6 working days.
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({ existingLeaves: [existing] }),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('11');
  });

  it('does not double-count the request when editing', () => {
    const editingId = 'lr-edit';
    const editing: LeaveRequest = urlaubReq('2026-04-13', '2026-04-17', { id: editingId, status: 'approved' });
    const result = halfYearPlanning(editing, ctx({
      existingLeaves: [editing],
    }));
    // The existingLeaves entry is filtered out by id, then the request itself contributes 5.
    // 5 < 12.5 → warn with "Aktuell geplant: 5".
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('5');
  });

  it('ignores leaves of other employees', () => {
    const other = urlaubReq('2026-04-06', '2026-04-22', {
      id: 'lr-other',
      employeeId: 'other-id',
      status: 'approved',
    });
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({ existingLeaves: [other] }),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('5');
  });

  it('ignores Krankenstand toward H1 totals', () => {
    const sick = urlaubReq('2026-03-09', '2026-03-20', {
      id: 'lr-sick',
      leaveTypeCode: 'krankenstand',
      status: 'approved',
    });
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({ existingLeaves: [sick] }),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('5');
  });

  it('ignores rejected and cancelled leaves', () => {
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({
        existingLeaves: [
          urlaubReq('2026-02-02', '2026-02-13', { id: 'lr-r', status: 'rejected' }),
          urlaubReq('2026-03-02', '2026-03-13', { id: 'lr-c', status: 'cancelled' }),
        ],
      }),
    );
    expect(result.warnings[0].message).toContain('5');
  });

  it('clips a leave that crosses the H1/H2 boundary', () => {
    // June 22 (Mon) – July 3 (Fri): the long leave clipped to Jun 30 = Mon-Tue
    // is 7 working days. Plus the new request (5 days) = 12 H1 days. Still
    // < 12.5 → warn.
    const long = urlaubReq('2026-06-22', '2026-07-03', { id: 'lr-long', status: 'approved' });
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({ existingLeaves: [long] }),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('12');
  });

  it('does not count an H2-only request toward H1', () => {
    // The request itself is in H2, so it adds 0 to H1.
    const existing = urlaubReq('2026-02-09', '2026-02-13', { id: 'lr-1', status: 'approved' });
    // 5 working days in H1 from the existing leave; new request is in H2.
    const result = halfYearPlanning(
      urlaubReq('2026-08-10', '2026-08-21'),
      ctx({ existingLeaves: [existing] }),
    );
    // 5 < 12.5 → warn with "Aktuell geplant: 5".
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('5');
  });

  it('includes carriedOver in the entitlement total', () => {
    // entitled 25 + carriedOver 5 = 30, threshold = 15.
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-24'),
      ctx({
        today: '2026-04-01',
        leaveBalances: [
          { employeeId: stefan.id, year: 2026, leaveTypeCode: 'urlaub', entitled: 25, carriedOver: 5 },
        ],
      }),
    );
    // Apr 13 (Mon) – Apr 24 (Fri): 10 working days. 10 < 15 → warn.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('15');
    expect(result.warnings[0].message).toContain('30');
  });

  it('passes when entitlement is 0 (e.g. apprentice with no balance yet)', () => {
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17'),
      ctx({
        leaveBalances: [
          { employeeId: stefan.id, year: 2026, leaveTypeCode: 'urlaub', entitled: 0, carriedOver: 0 },
        ],
      }),
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('respects half-day flags when computing H1 days', () => {
    const result = halfYearPlanning(
      urlaubReq('2026-04-13', '2026-04-17', { halfDayStart: true }),
      ctx({ today: '2026-04-01' }),
    );
    // Apr 13 (Mon) – Apr 17 (Fri): 5 days, half-start = 4.5.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('4.5');
  });
});
