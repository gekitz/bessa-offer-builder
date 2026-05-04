// Pure helpers for computing leave balances from the persisted
// `leave_balances` row plus the live `leave_requests` feed.
//
// We keep the entitlement value persisted (HR sets it once a year)
// but compute used + planned at read time from leave_requests so
// the dashboard always matches the request list. This avoids a
// trigger-shaped sync layer for now.

import type { IsoDate, LeaveRequest, LeaveTypeCode } from '../types';
import { parseIsoDate } from '../rules/dateUtils';

// Count Monday-through-Friday days in [start, end] inclusive,
// applying half-day deductions on the start / end day.
//
// We don't subtract public holidays — the company-wide blackouts
// already prevent booking on those, and even if a single day is
// counted as a working day on a public holiday, the user can adjust
// downstream. Keeping this dependency-free.
export function countWorkingDays(
  startDate: IsoDate,
  endDate: IsoDate,
  halfDayStart = false,
  halfDayEnd = false,
): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (end.getTime() < start.getTime()) return 0;

  let days = 0;
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    const wd = cursor.getUTCDay();
    if (wd !== 0 && wd !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Half-day flags only count when the start / end day itself is
  // a working day. A half-day on a Saturday is meaningless.
  if (halfDayStart && days > 0 && isWeekday(start)) days -= 0.5;
  if (halfDayEnd && days > 0 && isWeekday(end)) days -= 0.5;

  return days;
}

function isWeekday(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6;
}

export interface BalanceSummary {
  leaveTypeCode: LeaveTypeCode;
  entitled: number;
  carriedOver: number;
  // Already taken — approved + the leave's end_date <= today.
  used: number;
  // Future / pending — approved with end_date > today, plus all
  // pending requests regardless of date.
  planned: number;
  // entitled + carriedOver - used - planned. Can go negative if HR
  // approved more than is available (we just display the number).
  remaining: number;
}

export interface BalanceInputs {
  leaveTypeCode: LeaveTypeCode;
  entitled: number;
  carriedOver: number;
  // The full set of this employee's leaves for the year. Caller is
  // responsible for filtering by employee_id and year.
  leaves: LeaveRequest[];
  today: IsoDate;
}

export function summarizeBalance(input: BalanceInputs): BalanceSummary {
  const { leaveTypeCode, entitled, carriedOver, leaves, today } = input;
  let used = 0;
  let planned = 0;

  for (const leave of leaves) {
    if (leave.leaveTypeCode !== leaveTypeCode) continue;
    if (leave.status === 'rejected' || leave.status === 'cancelled') continue;

    const days = countWorkingDays(
      leave.startDate,
      leave.endDate,
      leave.halfDayStart,
      leave.halfDayEnd,
    );
    if (days <= 0) continue;

    const isPast = leave.endDate <= today;
    if (leave.status === 'approved' && isPast) {
      used += days;
    } else {
      planned += days;
    }
  }

  return {
    leaveTypeCode,
    entitled,
    carriedOver,
    used,
    planned,
    remaining: entitled + carriedOver - used - planned,
  };
}
