import { describe, it, expect } from 'vitest';
import { blackout } from '../blackout';
import type {
  BlackoutPeriod,
  Employee,
  EmployeeRole,
  LeaveRequest,
  RuleContext,
} from '../../types';

const klagenfurtKassen: Employee = {
  id: 'emp-klu',
  code: 'klu1',
  name: 'KLU Kassen',
  standortId: 1, // Klagenfurt
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

const kluRole: EmployeeRole = {
  id: 'role-1',
  employeeId: klagenfurtKassen.id,
  abteilungId: 1, // Kassen
  standortId: 1,
  kind: 'primary',
};

const wolfsbergMfp: Employee = {
  id: 'emp-wo',
  code: 'wo1',
  name: 'WO MFP',
  standortId: 2,
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

const woMfpRole: EmployeeRole = {
  id: 'role-2',
  employeeId: wolfsbergMfp.id,
  abteilungId: 5, // MFP
  standortId: 2,
  kind: 'primary',
};

const woerthersee: BlackoutPeriod = {
  id: 'bo-1',
  name: 'Wörthersee Saison',
  startDate: '2026-04-25',
  endDate: '2026-06-30',
  appliesToStandortIds: [1], // Klagenfurt only
  severity: 'block',
  active: true,
};

const skiBlackoutWarn: BlackoutPeriod = {
  id: 'bo-2',
  name: 'Skigebiete (Vorlauf)',
  startDate: '2026-11-15',
  endDate: '2026-12-15',
  severity: 'warn',
  active: true,
};

const ctx: RuleContext = {
  today: '2026-05-04',
  employees: [klagenfurtKassen, wolfsbergMfp],
  roles: [kluRole, woMfpRole],
  existingLeaves: [],
  coverageRules: [],
  blackouts: [woerthersee, skiBlackoutWarn],
};

describe('blackout', () => {
  it('blocks a Klagenfurt employee whose Urlaub overlaps the Wörthersee period', () => {
    const req: LeaveRequest = {
      employeeId: klagenfurtKassen.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-22',
    };
    const result = blackout(req, ctx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('Wörthersee');
  });

  it('does not block when standort scope excludes the employee', () => {
    const req: LeaveRequest = {
      employeeId: wolfsbergMfp.id, // Wolfsberg
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-22',
    };
    expect(blackout(req, ctx).ok).toBe(true);
  });

  it('warns but does not block on severity=warn periods', () => {
    const req: LeaveRequest = {
      employeeId: wolfsbergMfp.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-11-20',
      endDate: '2026-11-27',
    };
    const result = blackout(req, ctx);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain('Skigebiete');
  });

  it('exempts Krankenstand from blackouts', () => {
    const req: LeaveRequest = {
      employeeId: klagenfurtKassen.id,
      leaveTypeCode: 'krankenstand',
      startDate: '2026-05-15',
      endDate: '2026-05-22',
    };
    const result = blackout(req, ctx);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('does not flag a request that ends before the blackout starts', () => {
    const req: LeaveRequest = {
      employeeId: klagenfurtKassen.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-04-01',
      endDate: '2026-04-20',
    };
    expect(blackout(req, ctx).ok).toBe(true);
  });

  it('skips inactive blackout rows', () => {
    const inactiveCtx = {
      ...ctx,
      blackouts: [{ ...woerthersee, active: false }],
    };
    const req: LeaveRequest = {
      employeeId: klagenfurtKassen.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-22',
    };
    expect(blackout(req, inactiveCtx).ok).toBe(true);
  });

  it('respects Abteilung scope when present', () => {
    const buroOnlyBlackout: BlackoutPeriod = {
      id: 'bo-3',
      name: 'Büro-Inventur',
      startDate: '2026-12-27',
      endDate: '2026-12-31',
      appliesToAbteilungIds: [4], // Büro only
      severity: 'block',
      active: true,
    };
    const ctxWithBuro = { ...ctx, blackouts: [buroOnlyBlackout] };
    // Kassen employee is not in scope
    const req: LeaveRequest = {
      employeeId: klagenfurtKassen.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-12-28',
      endDate: '2026-12-30',
    };
    expect(blackout(req, ctxWithBuro).ok).toBe(true);
  });
});
