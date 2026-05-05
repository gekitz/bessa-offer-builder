import { describe, it, expect } from 'vitest';
import { validateLeaveRequest } from '../validateLeaveRequest';
import type {
  BlackoutPeriod,
  CoverageRule,
  Employee,
  EmployeeRole,
  LeaveRequest,
  RuleContext,
} from '../../types';

const stefan: Employee = {
  id: 'sbauer-id', code: 'sbauer', name: 'Stefan Bauer',
  standortId: 2, hireDate: '2020-01-01',
  weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const mario: Employee = {
  id: 'mgraf-id', code: 'mgraf', name: 'Mario Graf',
  standortId: 2, hireDate: '2018-06-01',
  weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const stefanRole: EmployeeRole = {
  id: 'sr', employeeId: stefan.id, abteilungId: 5, standortId: 2, kind: 'primary',
};

const marioRole: EmployeeRole = {
  id: 'mr', employeeId: mario.id, abteilungId: 5, standortId: 2, kind: 'primary',
};

const stefanMarioBlock: CoverageRule = {
  id: 'cr-1',
  name: 'Stefan ↔ Mario MFP Wolfsberg (hard block)',
  appliesToEmployees: [stefan.id, mario.id],
  maxConcurrentOnLeave: 1,
  kind: 'hard',
  active: true,
};

const woerthersee: BlackoutPeriod = {
  id: 'bo-1',
  name: 'Wörthersee Saison',
  startDate: '2026-04-25',
  endDate: '2026-06-30',
  appliesToStandortIds: [1], // Klagenfurt only — not Wolfsberg
  severity: 'block',
  active: true,
};

const ctx: RuleContext = {
  today: '2026-05-04',
  employees: [stefan, mario],
  roles: [stefanRole, marioRole],
  existingLeaves: [],
  coverageRules: [stefanMarioBlock],
  blackouts: [woerthersee],
};

describe('validateLeaveRequest (composer)', () => {
  it('passes a clean request', () => {
    const request: LeaveRequest = {
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-07-15',
      endDate: '2026-07-19',
    };
    const result = validateLeaveRequest(request, ctx);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('aggregates multiple violations from independent rules', () => {
    // Too short notice (leadTime fails) AND clashes with Mario (hardBlock fails)
    const request: LeaveRequest = {
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-10',
      endDate: '2026-05-15',
    };
    const ctxWithMarioOverlap: RuleContext = {
      ...ctx,
      existingLeaves: [
        {
          id: 'mario-existing',
          employeeId: mario.id,
          leaveTypeCode: 'urlaub',
          startDate: '2026-05-12',
          endDate: '2026-05-14',
          status: 'approved',
        },
      ],
    };
    const result = validateLeaveRequest(request, ctxWithMarioOverlap);
    expect(result.ok).toBe(false);
    const ruleNames = result.violations.map((v) => v.rule).sort();
    expect(ruleNames).toEqual(['hardBlock', 'leadTime']);
  });

  it('mixes violations and warnings from different rules', () => {
    // Build a soft-warning blackout overlap + a hard violation from coverage
    const woerthernSoft: BlackoutPeriod = {
      ...woerthersee,
      appliesToStandortIds: [2], // Wolfsberg this time, severity warn
      severity: 'warn',
    };
    const request: LeaveRequest = {
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-06-10',
      endDate: '2026-06-15',
    };
    const ctxMixed: RuleContext = {
      ...ctx,
      blackouts: [woerthernSoft],
      existingLeaves: [
        {
          id: 'mario-existing',
          employeeId: mario.id,
          leaveTypeCode: 'urlaub',
          startDate: '2026-06-12',
          endDate: '2026-06-14',
          status: 'approved',
        },
      ],
    };
    const result = validateLeaveRequest(request, ctxMixed);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'hardBlock')).toBe(true);
    expect(result.warnings.some((w) => w.rule === 'blackout')).toBe(true);
  });
});
