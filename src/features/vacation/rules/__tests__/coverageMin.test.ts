import { describe, it, expect } from 'vitest';
import { coverageMin } from '../coverageMin';
import type {
  CoverageRule,
  Employee,
  EmployeeRole,
  LeaveRequest,
  RuleContext,
} from '../../types';

function emp(id: string, name: string, standortId: number): Employee {
  return {
    id,
    code: id,
    name,
    standortId,
    weeklyHours: 38.5,
    employmentType: 'fulltime',
    active: true,
  };
}

function role(employeeId: string, abteilungId: number, standortId: number): EmployeeRole {
  return {
    id: `r-${employeeId}-${abteilungId}`,
    employeeId,
    abteilungId,
    standortId,
    kind: 'primary',
  };
}

const a = emp('a', 'A WO Büro', 2);
const b = emp('b', 'B WO Büro', 2);
const c = emp('c', 'C WO Büro', 2);
const d = emp('d', 'D KLU Büro', 1);

const woBuroMin1: CoverageRule = {
  id: 'cov-1',
  name: 'Wolfsberg Büro: max 2 gleichzeitig',
  scopeStandortId: 2,
  scopeAbteilungId: 4,
  maxConcurrentOnLeave: 2,
  kind: 'hard',
  active: true,
};

const baseCtx: RuleContext = {
  today: '2026-05-04',
  employees: [a, b, c, d],
  roles: [role('a', 4, 2), role('b', 4, 2), role('c', 4, 2), role('d', 4, 1)],
  existingLeaves: [],
  coverageRules: [woBuroMin1],
  blackouts: [],
};

const requestA: LeaveRequest = {
  employeeId: a.id,
  leaveTypeCode: 'urlaub',
  startDate: '2026-07-01',
  endDate: '2026-07-10',
};

describe('coverageMin', () => {
  it('passes with no overlapping leaves', () => {
    expect(coverageMin(requestA, baseCtx).ok).toBe(true);
  });

  it('passes when one other employee in scope overlaps (under cap)', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        { id: 'b-1', employeeId: b.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-05', endDate: '2026-07-08', status: 'approved' as const },
      ],
    };
    expect(coverageMin(requestA, ctx).ok).toBe(true);
  });

  it('fails when adding the requester would exceed the cap', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        { id: 'b-1', employeeId: b.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-05', endDate: '2026-07-08', status: 'approved' as const },
        { id: 'c-1', employeeId: c.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-02', endDate: '2026-07-12', status: 'pending' as const },
      ],
    };
    const result = coverageMin(requestA, ctx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('B WO Büro');
    expect(result.violations[0]?.message).toContain('C WO Büro');
  });

  it('warns instead of blocks when rule kind is soft', () => {
    const ctx = {
      ...baseCtx,
      coverageRules: [{ ...woBuroMin1, kind: 'soft' as const }],
      existingLeaves: [
        { id: 'b-1', employeeId: b.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-05', endDate: '2026-07-08', status: 'approved' as const },
        { id: 'c-1', employeeId: c.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-02', endDate: '2026-07-12', status: 'pending' as const },
      ],
    };
    const result = coverageMin(requestA, ctx);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it('does not count leaves from outside the rule scope', () => {
    // d is Klagenfurt Büro — outside Wolfsberg scope of the rule.
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        { id: 'b-1', employeeId: b.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-05', endDate: '2026-07-08', status: 'approved' as const },
        { id: 'd-1', employeeId: d.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-02', endDate: '2026-07-12', status: 'approved' as const },
      ],
    };
    expect(coverageMin(requestA, ctx).ok).toBe(true);
  });

  it('skips rules with an applies_to_employees scope (those are hardBlock territory)', () => {
    const ctx = {
      ...baseCtx,
      coverageRules: [
        { ...woBuroMin1, appliesToEmployees: [a.id, b.id], maxConcurrentOnLeave: 1 },
      ],
      existingLeaves: [
        { id: 'b-1', employeeId: b.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-05', endDate: '2026-07-08', status: 'approved' as const },
      ],
    };
    expect(coverageMin(requestA, ctx).ok).toBe(true);
  });

  it('ignores rejected and cancelled leaves', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        { id: 'b-1', employeeId: b.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-05', endDate: '2026-07-08', status: 'rejected' as const },
        { id: 'c-1', employeeId: c.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-02', endDate: '2026-07-12', status: 'cancelled' as const },
      ],
    };
    expect(coverageMin(requestA, ctx).ok).toBe(true);
  });

  it('skips inactive coverage rules', () => {
    const ctx = {
      ...baseCtx,
      coverageRules: [{ ...woBuroMin1, active: false, maxConcurrentOnLeave: 0 }],
      existingLeaves: [
        { id: 'b-1', employeeId: b.id, leaveTypeCode: 'urlaub' as const, startDate: '2026-07-05', endDate: '2026-07-08', status: 'approved' as const },
      ],
    };
    expect(coverageMin(requestA, ctx).ok).toBe(true);
  });
});
