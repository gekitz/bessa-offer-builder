import { describe, it, expect } from 'vitest';
import { hardBlock } from '../hardBlock';
import type {
  CoverageRule,
  Employee,
  LeaveRequest,
  RuleContext,
} from '../../types';

const stefan: Employee = {
  id: 'sbauer-id',
  code: 'sbauer',
  name: 'Stefan Bauer',
  standortId: 2,
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

const mario: Employee = {
  id: 'mgraf-id',
  code: 'mgraf',
  name: 'Mario Graf',
  standortId: 2,
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

const stefanMarioBlock: CoverageRule = {
  id: 'rule-1',
  name: 'Stefan ↔ Mario MFP Wolfsberg (hard block)',
  appliesToEmployees: [stefan.id, mario.id],
  maxConcurrentOnLeave: 1,
  kind: 'hard',
  active: true,
};

const baseCtx: RuleContext = {
  today: '2026-05-04',
  employees: [stefan, mario],
  roles: [],
  existingLeaves: [],
  coverageRules: [stefanMarioBlock],
  blackouts: [],
};

const stefanRequest: LeaveRequest = {
  employeeId: stefan.id,
  leaveTypeCode: 'urlaub',
  startDate: '2026-07-01',
  endDate: '2026-07-10',
};

const marioOverlap: LeaveRequest = {
  id: 'mario-existing',
  employeeId: mario.id,
  leaveTypeCode: 'urlaub',
  startDate: '2026-07-05',
  endDate: '2026-07-15',
  status: 'approved',
};

describe('hardBlock — Stefan ↔ Mario', () => {
  it('passes when no overlapping leave exists', () => {
    expect(hardBlock(stefanRequest, baseCtx).ok).toBe(true);
  });

  it('blocks when the other employee in the rule scope overlaps', () => {
    const ctx = { ...baseCtx, existingLeaves: [marioOverlap] };
    const result = hardBlock(stefanRequest, ctx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.rule).toBe('hardBlock');
    expect(result.violations[0]?.message).toContain('Mario Graf');
  });

  it('passes when the existing leave is rejected/cancelled', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [{ ...marioOverlap, status: 'rejected' as const }],
    };
    expect(hardBlock(stefanRequest, ctx).ok).toBe(true);
  });

  it('does not flag a request from someone outside the rule scope', () => {
    const outsider: LeaveRequest = {
      employeeId: 'outsider-id',
      leaveTypeCode: 'urlaub',
      startDate: '2026-07-01',
      endDate: '2026-07-10',
    };
    const ctx = { ...baseCtx, existingLeaves: [marioOverlap] };
    expect(hardBlock(outsider, ctx).ok).toBe(true);
  });

  it('ignores soft coverage rules', () => {
    const ctx = {
      ...baseCtx,
      coverageRules: [{ ...stefanMarioBlock, kind: 'soft' as const }],
      existingLeaves: [marioOverlap],
    };
    expect(hardBlock(stefanRequest, ctx).ok).toBe(true);
  });

  it('skips inactive rules', () => {
    const ctx = {
      ...baseCtx,
      coverageRules: [{ ...stefanMarioBlock, active: false }],
      existingLeaves: [marioOverlap],
    };
    expect(hardBlock(stefanRequest, ctx).ok).toBe(true);
  });

  it('does not block self when editing the same request', () => {
    const editing = { ...stefanRequest, id: 'stefan-existing' };
    const ctx = {
      ...baseCtx,
      existingLeaves: [{ ...stefanRequest, id: 'stefan-existing', status: 'approved' as const }],
    };
    expect(hardBlock(editing, ctx).ok).toBe(true);
  });
});
