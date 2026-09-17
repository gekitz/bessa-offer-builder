import { describe, it, expect } from 'vitest';
import { takeFridayToo } from '../takeFriday';
import type { LeaveRequest, RuleContext } from '../../types';

// 2026-08-10 is a Monday; 2026-08-13 the Thursday; 2026-08-14 the Friday.
const MON = '2026-08-10';
const THU = '2026-08-13';
const FRI = '2026-08-14';

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    today: '2026-06-01',
    employees: [],
    roles: [],
    existingLeaves: [],
    coverageRules: [],
    blackouts: [],
    requesterRemaining: 20,
    holidays: [],
    ...overrides,
  };
}

function req(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    employeeId: 'e1',
    leaveTypeCode: 'urlaub',
    startDate: MON,
    endDate: THU,
    ...overrides,
  };
}

describe('takeFridayToo', () => {
  it('blocks a full Mon–Thu Urlaub block when the Friday is affordable', () => {
    const r = takeFridayToo(req(), ctx());
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].rule).toBe('takeFridayToo');
    // Mentions the specific Friday in German date format.
    expect(r.violations[0].message).toContain('14.08.2026');
  });

  it('passes when the remaining balance cannot cover the whole week', () => {
    // 4 days left: enough for Mon–Thu, not the Friday on top.
    expect(takeFridayToo(req(), ctx({ requesterRemaining: 4 })).ok).toBe(true);
  });

  it('blocks when exactly 5 days remain (the whole week fits)', () => {
    expect(takeFridayToo(req(), ctx({ requesterRemaining: 5 })).ok).toBe(false);
  });

  it('passes when the stranded Friday is a public holiday', () => {
    expect(takeFridayToo(req(), ctx({ holidays: [FRI] })).ok).toBe(true);
  });

  it('passes when the balance is unknown (no requester context)', () => {
    expect(takeFridayToo(req(), ctx({ requesterRemaining: undefined })).ok).toBe(true);
  });

  it('ignores non-Urlaub leave types', () => {
    expect(takeFridayToo(req({ leaveTypeCode: 'krankenstand' }), ctx()).ok).toBe(true);
  });

  it('does not fire when the block already includes the Friday (Mon–Fri)', () => {
    expect(takeFridayToo(req({ endDate: FRI }), ctx()).ok).toBe(true);
  });

  it('does not fire for a Tue–Thu block (does not start on Monday)', () => {
    // 2026-08-11 Tue → 2026-08-13 Thu.
    expect(takeFridayToo(req({ startDate: '2026-08-11', endDate: THU }), ctx()).ok).toBe(true);
  });

  it('does not fire for a Mon–Wed block (does not end on Thursday)', () => {
    expect(takeFridayToo(req({ endDate: '2026-08-12' }), ctx()).ok).toBe(true);
  });

  it('does not fire when Thursday is only a half day', () => {
    expect(takeFridayToo(req({ halfDayEnd: true }), ctx()).ok).toBe(true);
  });

  it('does not fire when Monday is only a half day', () => {
    expect(takeFridayToo(req({ halfDayStart: true }), ctx()).ok).toBe(true);
  });

  it('does not fire for a multi-week block ending on a Thursday', () => {
    // Mon 2026-08-10 → Thu 2026-08-20 spans two weeks; the first Friday
    // is already inside the block, so nothing is stranded.
    expect(takeFridayToo(req({ endDate: '2026-08-20' }), ctx()).ok).toBe(true);
  });
});
