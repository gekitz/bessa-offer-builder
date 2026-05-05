import { describe, it, expect } from 'vitest';
import { leadTime } from '../leadTime';
import type { LeaveRequest, RuleContext } from '../../types';

const baseCtx: RuleContext = {
  today: '2026-05-04',
  employees: [],
  roles: [],
  existingLeaves: [],
  coverageRules: [],
  blackouts: [],
};

const baseRequest: LeaveRequest = {
  employeeId: 'emp-1',
  leaveTypeCode: 'urlaub',
  startDate: '2026-06-15',
  endDate: '2026-06-19',
};

describe('leadTime', () => {
  it('passes when Urlaub starts > 28 days from today', () => {
    expect(leadTime(baseRequest, baseCtx).ok).toBe(true);
  });

  it('passes at exactly 28 days', () => {
    const exactly28 = { ...baseRequest, startDate: '2026-06-01' }; // 28 days after 2026-05-04
    expect(leadTime(exactly28, baseCtx).ok).toBe(true);
  });

  it('fails when Urlaub starts in less than 28 days', () => {
    const tooSoon = { ...baseRequest, startDate: '2026-05-20' }; // 16 days
    const result = leadTime(tooSoon, baseCtx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.rule).toBe('leadTime');
    expect(result.violations[0]?.message).toContain('16');
  });

  it('reports past-date requests with the in-the-past wording', () => {
    const past = { ...baseRequest, startDate: '2026-05-01' };
    const result = leadTime(past, baseCtx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('Vergangenheit');
  });

  it('exempts non-Urlaub leave types', () => {
    const tomorrow: LeaveRequest = { ...baseRequest, startDate: '2026-05-05' };
    expect(leadTime({ ...tomorrow, leaveTypeCode: 'krankenstand' }, baseCtx).ok).toBe(true);
    expect(leadTime({ ...tomorrow, leaveTypeCode: 'pflege' }, baseCtx).ok).toBe(true);
    expect(leadTime({ ...tomorrow, leaveTypeCode: 'zeitausgleich' }, baseCtx).ok).toBe(true);
    expect(leadTime({ ...tomorrow, leaveTypeCode: 'schule' }, baseCtx).ok).toBe(true);
    expect(leadTime({ ...tomorrow, leaveTypeCode: 'schulung' }, baseCtx).ok).toBe(true);
    expect(leadTime({ ...tomorrow, leaveTypeCode: 'sonderurlaub' }, baseCtx).ok).toBe(true);
  });
});
