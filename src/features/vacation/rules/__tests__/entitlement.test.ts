import { describe, it, expect } from 'vitest';
import { entitlement } from '../entitlement';
import type { Employee, LeaveRequest, RuleContext } from '../../types';

function withEmployee(emp: Employee, request: LeaveRequest): RuleContext {
  return {
    today: '2026-05-04',
    employees: [emp],
    roles: [],
    existingLeaves: [],
    coverageRules: [],
    blackouts: [],
  };
}

const baseEmployee: Employee = {
  id: 'e-1',
  code: 'e1',
  name: 'New Hire',
  standortId: 1,
  weeklyHours: 38.5,
  employmentType: 'fulltime',
  active: true,
};

describe('entitlement', () => {
  it('passes when the request is exactly at the 6-month mark', () => {
    const emp = { ...baseEmployee, hireDate: '2026-01-15' };
    const request: LeaveRequest = {
      employeeId: emp.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-07-15',
      endDate: '2026-07-20',
    };
    expect(entitlement(request, withEmployee(emp, request)).ok).toBe(true);
  });

  it('blocks when start date is before hire_date + 6 months', () => {
    const emp = { ...baseEmployee, hireDate: '2026-01-15' };
    const request: LeaveRequest = {
      employeeId: emp.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-06-15',
      endDate: '2026-06-20',
    };
    const result = entitlement(request, withEmployee(emp, request));
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.rule).toBe('entitlement');
    expect(result.violations[0]?.message).toContain('2026-07-15');
  });

  it('passes for non-Urlaub leave types regardless of tenure', () => {
    const emp = { ...baseEmployee, hireDate: '2026-04-01' };
    const request: LeaveRequest = {
      employeeId: emp.id,
      leaveTypeCode: 'krankenstand',
      startDate: '2026-05-05',
      endDate: '2026-05-06',
    };
    expect(entitlement(request, withEmployee(emp, request)).ok).toBe(true);
  });

  it('passes when hire_date is missing (admin data gap, not employee fault)', () => {
    const emp = { ...baseEmployee, hireDate: undefined };
    const request: LeaveRequest = {
      employeeId: emp.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-20',
    };
    expect(entitlement(request, withEmployee(emp, request)).ok).toBe(true);
  });

  it('passes when the employee is missing from context (no harm, no violation)', () => {
    const request: LeaveRequest = {
      employeeId: 'unknown',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-15',
      endDate: '2026-05-20',
    };
    const ctx: RuleContext = {
      today: '2026-05-04',
      employees: [],
      roles: [],
      existingLeaves: [],
      coverageRules: [],
      blackouts: [],
    };
    expect(entitlement(request, ctx).ok).toBe(true);
  });
});
