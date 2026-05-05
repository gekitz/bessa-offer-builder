import { describe, it, expect } from 'vitest';
import { countWorkingDays, summarizeBalance } from '../balance';
import type { LeaveRequest } from '../../types';

describe('countWorkingDays', () => {
  it('counts a single weekday as 1 day', () => {
    // Monday 2026-08-10
    expect(countWorkingDays('2026-08-10', '2026-08-10')).toBe(1);
  });

  it('returns 0 for a single Saturday', () => {
    // Saturday 2026-08-15
    expect(countWorkingDays('2026-08-15', '2026-08-15')).toBe(0);
  });

  it('returns 0 for a single Sunday', () => {
    // Sunday 2026-08-16
    expect(countWorkingDays('2026-08-16', '2026-08-16')).toBe(0);
  });

  it('counts a Mon-Fri full work week as 5 days', () => {
    // 2026-08-10 (Mon) – 2026-08-14 (Fri)
    expect(countWorkingDays('2026-08-10', '2026-08-14')).toBe(5);
  });

  it('skips the weekend in a Mon-Mon range (8 calendar / 6 working days)', () => {
    // 2026-08-10 (Mon) – 2026-08-17 (Mon)
    expect(countWorkingDays('2026-08-10', '2026-08-17')).toBe(6);
  });

  it('returns 0 when end is before start', () => {
    expect(countWorkingDays('2026-08-15', '2026-08-10')).toBe(0);
  });

  it('subtracts 0.5 when halfDayStart is set on a weekday start', () => {
    expect(countWorkingDays('2026-08-10', '2026-08-14', true, false)).toBe(4.5);
  });

  it('subtracts 0.5 when halfDayEnd is set on a weekday end', () => {
    expect(countWorkingDays('2026-08-10', '2026-08-14', false, true)).toBe(4.5);
  });

  it('subtracts 1 when both half-day flags are set', () => {
    expect(countWorkingDays('2026-08-10', '2026-08-14', true, true)).toBe(4);
  });

  it('treats both half-day flags on the same weekday as one full day', () => {
    expect(countWorkingDays('2026-08-10', '2026-08-10', true, true)).toBe(1);
  });

  it('ignores halfDayStart when the start date is a weekend', () => {
    // 2026-08-15 (Sat) – 2026-08-17 (Mon): 1 working day, half flag on Sat ignored
    expect(countWorkingDays('2026-08-15', '2026-08-17', true, false)).toBe(1);
  });
});

describe('summarizeBalance', () => {
  const today = '2026-05-04';

  function leave(overrides: Partial<LeaveRequest> & Pick<LeaveRequest, 'startDate' | 'endDate'>): LeaveRequest {
    return {
      employeeId: 'emp-1',
      leaveTypeCode: 'urlaub',
      status: 'approved',
      ...overrides,
    };
  }

  it('returns entitled untouched when there are no leaves', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [],
      today,
    });
    expect(s).toEqual({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      used: 0,
      planned: 0,
      remaining: 25,
    });
  });

  it('includes carried_over in the remaining total', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 3,
      leaves: [],
      today,
    });
    expect(s.remaining).toBe(28);
  });

  it('counts approved past leaves as used', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [leave({ startDate: '2026-04-13', endDate: '2026-04-17', status: 'approved' })],
      today,
    });
    expect(s.used).toBe(5);
    expect(s.planned).toBe(0);
    expect(s.remaining).toBe(20);
  });

  it('counts approved future leaves as planned', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [leave({ startDate: '2026-08-10', endDate: '2026-08-14', status: 'approved' })],
      today,
    });
    expect(s.used).toBe(0);
    expect(s.planned).toBe(5);
    expect(s.remaining).toBe(20);
  });

  it('counts pending leaves as planned regardless of date', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [
        leave({ startDate: '2026-04-06', endDate: '2026-04-10', status: 'pending' }),
        leave({ startDate: '2026-08-10', endDate: '2026-08-14', status: 'pending' }),
      ],
      today,
    });
    expect(s.used).toBe(0);
    expect(s.planned).toBe(10);
  });

  it('ignores rejected and cancelled leaves', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [
        leave({ startDate: '2026-04-06', endDate: '2026-04-10', status: 'rejected' }),
        leave({ startDate: '2026-04-13', endDate: '2026-04-17', status: 'cancelled' }),
      ],
      today,
    });
    expect(s.used).toBe(0);
    expect(s.planned).toBe(0);
    expect(s.remaining).toBe(25);
  });

  it('ignores leaves of other types', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [
        leave({ startDate: '2026-04-06', endDate: '2026-04-10', leaveTypeCode: 'krankenstand', status: 'approved' }),
      ],
      today,
    });
    expect(s.remaining).toBe(25);
  });

  it('respects half-day flags when totalling', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [leave({ startDate: '2026-08-10', endDate: '2026-08-14', halfDayStart: true, status: 'approved' })],
      today,
    });
    expect(s.planned).toBe(4.5);
    expect(s.remaining).toBe(20.5);
  });

  it('treats today as the boundary — leaves ending today are still used', () => {
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 25,
      carriedOver: 0,
      leaves: [leave({ startDate: '2026-04-27', endDate: '2026-05-04', status: 'approved' })],
      today: '2026-05-04',
    });
    expect(s.used).toBe(6); // Mon-Fri + Mon = 6 working days
    expect(s.planned).toBe(0);
  });

  it('can produce a negative remaining balance', () => {
    // Edge case: HR approved more than available (e.g. carry-over not yet entered).
    const s = summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: 5,
      carriedOver: 0,
      leaves: [leave({ startDate: '2026-08-10', endDate: '2026-08-21', status: 'approved' })],
      today,
    });
    expect(s.remaining).toBe(-5);
  });
});
