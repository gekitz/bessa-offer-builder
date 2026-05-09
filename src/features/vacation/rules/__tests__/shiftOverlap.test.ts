import { describe, it, expect } from 'vitest';
import { shiftOverlap } from '../shiftOverlap';
import type { Employee, LeaveRequest, RuleContext } from '../../types';

const heimo: Employee = {
  id: 'emp-heimo',
  code: 'hrussnig',
  name: 'Heimo Russnig',
  standortId: 1,
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

const sandro: Employee = {
  id: 'emp-sandro',
  code: 'skumpusch',
  name: 'Sandro Kumpusch',
  standortId: 2,
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

const baseCtx: RuleContext = {
  today: '2026-05-04',
  employees: [heimo, sandro],
  roles: [],
  existingLeaves: [],
  coverageRules: [],
  blackouts: [],
  shifts: [
    { id: 'sh-1', date: '2026-05-15', employeeId: heimo.id, status: 'assigned' },
    { id: 'sh-2', date: '2026-05-16', employeeId: heimo.id, status: 'assigned' },
    { id: 'sh-3', date: '2026-05-17', employeeId: heimo.id, status: 'assigned' },
    { id: 'sh-4', date: '2026-05-23', employeeId: sandro.id, status: 'assigned' },
  ],
};

describe('shiftOverlap', () => {
  it('blocks leave that overlaps an assigned shift', () => {
    const req: LeaveRequest = {
      employeeId: heimo.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-14',
      endDate: '2026-05-18',
    };
    const result = shiftOverlap(req, baseCtx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('2026-05-15');
    expect(result.violations[0]?.message).toContain('2026-05-16');
    expect(result.violations[0]?.message).toContain('2026-05-17');
  });

  it('blocks leave that overlaps a swap_pending shift (still on the hook)', () => {
    const ctx: RuleContext = {
      ...baseCtx,
      shifts: [
        { id: 'sh-1', date: '2026-05-15', employeeId: heimo.id, status: 'swap_pending' },
      ],
    };
    const req: LeaveRequest = {
      employeeId: heimo.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-15',
    };
    expect(shiftOverlap(req, ctx).ok).toBe(false);
  });

  it("ignores other employees' shifts", () => {
    const req: LeaveRequest = {
      employeeId: heimo.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-23',
      endDate: '2026-05-23',
    };
    expect(shiftOverlap(req, baseCtx).ok).toBe(true);
  });

  it('passes when leave window is entirely outside the shift days', () => {
    const req: LeaveRequest = {
      employeeId: heimo.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-19',
      endDate: '2026-05-22',
    };
    expect(shiftOverlap(req, baseCtx).ok).toBe(true);
  });

  it('is a no-op when shifts is empty/undefined', () => {
    const req: LeaveRequest = {
      employeeId: heimo.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-17',
    };
    expect(shiftOverlap(req, { ...baseCtx, shifts: [] }).ok).toBe(true);
    expect(shiftOverlap(req, { ...baseCtx, shifts: undefined }).ok).toBe(true);
  });

  it('ignores cancelled / completed / unassigned shift rows', () => {
    const ctx: RuleContext = {
      ...baseCtx,
      shifts: [
        { id: 'sh-1', date: '2026-05-15', employeeId: heimo.id, status: 'cancelled' },
        { id: 'sh-2', date: '2026-05-16', employeeId: heimo.id, status: 'completed' },
        { id: 'sh-3', date: '2026-05-17', employeeId: null, status: 'unassigned' },
      ],
    };
    const req: LeaveRequest = {
      employeeId: heimo.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-17',
    };
    expect(shiftOverlap(req, ctx).ok).toBe(true);
  });
});
