// Availability engine for the dispatcher view.
//
// Pure functions only — no React, no Supabase. The dispatcher hook
// fetches employees/appointments/leaves/shifts/holidays/slotKinds and
// passes them in. Everything below operates on plain JS values and
// ms-since-epoch integers so it is trivial to test with frozen `now`.
//
// Time zone note: all interval math is done in ms-since-epoch. ISO
// timestamps from the DB are parsed with `new Date(...)` which yields
// the correct epoch ms regardless of TZ. Business-hour windows are
// built with `new Date(year, month, day, hour, minute)` which uses the
// browser's local TZ — appropriate because the dispatcher and the
// technicians all live in the same timezone (Europe/Vienna).
//
// Locked decisions (see memory/project_dispatcher_view.md):
// - Weekday business hours: Mon–Fri 08:00–17:00, no lunch gap.
// - Weekend / holiday availability: only when the employee has an
//   assigned (or swap_pending) shift on that date; the slot kind's
//   start_time/end_time defines the working window.
// - Half-day leave convention (mirrors LeaveCalendar.tsx:808-815):
//     halfDayStart on start day → afternoon is leave (block 12:30–17)
//     halfDayEnd   on end day   → morning   is leave (block 08–12:30)
// - Slot bucketing starts no earlier than `ceilTo15(now)` so we never
//   suggest "free at 14:03 for 60 min" mid-quarter-hour.

import type { Appointment } from '../../tickets/types';
import type { BankHoliday, Shift, ShiftSlotKind } from '../../shifts/types';
import type { Employee, IsoDate, LeaveRequest } from '../../vacation/types';

export interface Interval {
  startMs: number;
  endMs: number;
}

export interface FreeSlot {
  employeeId: string;
  date: IsoDate;
  startsAt: string;
  endsAt: string;
}

export interface Conflict {
  employeeId: string;
  appointment: Appointment;
}

export interface FindFreeSlotsInput {
  employees: Employee[];
  appointments: Appointment[];
  leaves: LeaveRequest[];
  shifts: Shift[];
  slotKinds: ShiftSlotKind[];
  holidays: BankHoliday[];
  now: Date;
  daysAhead: number;
  slotMinutes: number;
  maxPerEmployeePerDay?: number;
  employeeIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────
// Date / time helpers

const MS_PER_MIN = 60_000;
const WEEKDAY_BUSINESS_START_H = 8;
const WEEKDAY_BUSINESS_END_H = 17;
const HALF_DAY_SPLIT_H = 12;
const HALF_DAY_SPLIT_M = 30;
const DEFAULT_MAX_SLOTS_PER_EMP_PER_DAY = 6;

export function isoDate(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

function localDateTimeMs(date: IsoDate, hour: number, minute = 0): number {
  const { year, month, day } = parseIsoDate(date);
  return new Date(year, month, day, hour, minute, 0, 0).getTime();
}

function parseHmm(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h, minute: m };
}

function ceilTo15Min(ms: number): number {
  const step = 15 * MS_PER_MIN;
  return Math.ceil(ms / step) * step;
}

function dayOfWeek(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return new Date(year, month, day).getDay();
}

function isWeekday(date: IsoDate): boolean {
  const d = dayOfWeek(date);
  return d >= 1 && d <= 5;
}

// ─────────────────────────────────────────────────────────────────────
// Window construction

export function defaultBusinessWindows(date: IsoDate, holidays: BankHoliday[]): Interval[] {
  if (!isWeekday(date)) return [];
  if (holidays.some((h) => h.date === date)) return [];
  return [
    {
      startMs: localDateTimeMs(date, WEEKDAY_BUSINESS_START_H, 0),
      endMs: localDateTimeMs(date, WEEKDAY_BUSINESS_END_H, 0),
    },
  ];
}

function shiftWindows(
  employeeId: string,
  date: IsoDate,
  shifts: Shift[],
  slotKindsByCode: Map<string, ShiftSlotKind>,
): Interval[] {
  const matches = shifts.filter(
    (s) =>
      s.date === date &&
      s.employeeId === employeeId &&
      (s.status === 'assigned' || s.status === 'swap_pending'),
  );
  const out: Interval[] = [];
  for (const s of matches) {
    const kind = slotKindsByCode.get(s.slotKindCode);
    if (!kind) continue;
    const start = parseHmm(kind.startTime);
    const end = parseHmm(kind.endTime);
    out.push({
      startMs: localDateTimeMs(date, start.hour, start.minute),
      endMs: localDateTimeMs(date, end.hour, end.minute),
    });
  }
  return mergeIntervals(out);
}

export function windowsForEmployee(
  employeeId: string,
  date: IsoDate,
  shifts: Shift[],
  slotKindsByCode: Map<string, ShiftSlotKind>,
  holidays: BankHoliday[],
): Interval[] {
  if (isWeekday(date) && !holidays.some((h) => h.date === date)) {
    return defaultBusinessWindows(date, holidays);
  }
  return shiftWindows(employeeId, date, shifts, slotKindsByCode);
}

// ─────────────────────────────────────────────────────────────────────
// Busy intervals

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const out: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, cur.endMs);
    } else {
      out.push(cur);
    }
  }
  return out;
}

export function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  const merged = mergeIntervals(busy.filter((b) => b.endMs > window.startMs && b.startMs < window.endMs));
  const out: Interval[] = [];
  let cursor = window.startMs;
  for (const b of merged) {
    const bStart = Math.max(b.startMs, window.startMs);
    const bEnd = Math.min(b.endMs, window.endMs);
    if (bStart > cursor) out.push({ startMs: cursor, endMs: bStart });
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < window.endMs) out.push({ startMs: cursor, endMs: window.endMs });
  return out;
}

export function appointmentIntervalsByEmployee(
  appointments: Appointment[],
): Map<string, Interval[]> {
  const out = new Map<string, Interval[]>();
  for (const a of appointments) {
    if (a.status === 'abgesagt') continue;
    const startMs = new Date(a.startsAt).getTime();
    const endMs = new Date(a.endsAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    for (const assignee of a.assignees ?? []) {
      const list = out.get(assignee.employeeId) ?? [];
      list.push({ startMs, endMs });
      out.set(assignee.employeeId, list);
    }
  }
  return out;
}

function leaveIntervalsForDate(leave: LeaveRequest, date: IsoDate): Interval[] {
  if (date < leave.startDate || date > leave.endDate) return [];
  const isStart = date === leave.startDate && !!leave.halfDayStart;
  const isEnd = date === leave.endDate && !!leave.halfDayEnd;
  // Both flags on the same single-day request → treat as full-day
  // leave, mirroring LeaveCalendar's `fullTint` fallback.
  const fullTint = isStart && isEnd ? true : !(isStart || isEnd);
  if (fullTint) {
    return [
      {
        startMs: localDateTimeMs(date, WEEKDAY_BUSINESS_START_H, 0),
        endMs: localDateTimeMs(date, WEEKDAY_BUSINESS_END_H, 0),
      },
    ];
  }
  if (isStart) {
    // halfDayStart → afternoon is leave (12:30–17)
    return [
      {
        startMs: localDateTimeMs(date, HALF_DAY_SPLIT_H, HALF_DAY_SPLIT_M),
        endMs: localDateTimeMs(date, WEEKDAY_BUSINESS_END_H, 0),
      },
    ];
  }
  // halfDayEnd → morning is leave (08–12:30)
  return [
    {
      startMs: localDateTimeMs(date, WEEKDAY_BUSINESS_START_H, 0),
      endMs: localDateTimeMs(date, HALF_DAY_SPLIT_H, HALF_DAY_SPLIT_M),
    },
  ];
}

export function leaveIntervalsByEmployee(
  leaves: LeaveRequest[],
  date: IsoDate,
): Map<string, Interval[]> {
  const out = new Map<string, Interval[]>();
  for (const l of leaves) {
    if (l.status && l.status !== 'approved' && l.status !== 'pending') continue;
    const ints = leaveIntervalsForDate(l, date);
    if (ints.length === 0) continue;
    const list = out.get(l.employeeId) ?? [];
    list.push(...ints);
    out.set(l.employeeId, list);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Slot bucketing

export function bucketIntoSlots(
  free: Interval,
  slotMinutes: number,
  earliestStartMs: number,
): Interval[] {
  const slotMs = slotMinutes * MS_PER_MIN;
  const out: Interval[] = [];
  let cursor = Math.max(free.startMs, earliestStartMs);
  while (cursor + slotMs <= free.endMs) {
    out.push({ startMs: cursor, endMs: cursor + slotMs });
    cursor += slotMs;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Top-level: findFreeSlots

function dateRange(now: Date, daysAhead: number): IsoDate[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: IsoDate[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    out.push(isoDate(d));
  }
  return out;
}

export function findFreeSlots(input: FindFreeSlotsInput): FreeSlot[] {
  const {
    employees,
    appointments,
    leaves,
    shifts,
    slotKinds,
    holidays,
    now,
    daysAhead,
    slotMinutes,
    maxPerEmployeePerDay = DEFAULT_MAX_SLOTS_PER_EMP_PER_DAY,
    employeeIds,
  } = input;

  const slotKindsByCode = new Map(slotKinds.map((k) => [k.code, k]));
  const apptByEmp = appointmentIntervalsByEmployee(appointments);
  const nowFloor = ceilTo15Min(now.getTime());
  const dates = dateRange(now, daysAhead);
  const empFilter = employeeIds ? new Set(employeeIds) : null;
  const activeEmployees = employees.filter(
    (e) => e.active && (!empFilter || empFilter.has(e.id)),
  );

  const out: FreeSlot[] = [];
  for (const date of dates) {
    const leavesByEmp = leaveIntervalsByEmployee(leaves, date);
    for (const emp of activeEmployees) {
      const windows = windowsForEmployee(emp.id, date, shifts, slotKindsByCode, holidays);
      if (windows.length === 0) continue;
      const busy: Interval[] = [
        ...(apptByEmp.get(emp.id) ?? []),
        ...(leavesByEmp.get(emp.id) ?? []),
      ];
      const slotsForDay: Interval[] = [];
      for (const w of windows) {
        const free = subtractBusy(w, busy);
        for (const f of free) {
          slotsForDay.push(...bucketIntoSlots(f, slotMinutes, nowFloor));
        }
      }
      const capped = slotsForDay.slice(0, maxPerEmployeePerDay);
      for (const s of capped) {
        out.push({
          employeeId: emp.id,
          date,
          startsAt: new Date(s.startMs).toISOString(),
          endsAt: new Date(s.endMs).toISOString(),
        });
      }
    }
  }
  // Stable ordering: by start time, then employeeId.
  out.sort((a, b) => {
    if (a.startsAt !== b.startsAt) return a.startsAt < b.startsAt ? -1 : 1;
    return a.employeeId < b.employeeId ? -1 : 1;
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Conflict detection (used by the dispatcher quick-book path)

export function hasConflict(
  employeeIds: string[],
  startsAt: string,
  endsAt: string,
  appointments: Appointment[],
  excludeAppointmentId?: string,
): Conflict[] {
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const empSet = new Set(employeeIds);
  const out: Conflict[] = [];
  for (const a of appointments) {
    if (a.id === excludeAppointmentId) continue;
    if (a.status === 'abgesagt') continue;
    const aStart = new Date(a.startsAt).getTime();
    const aEnd = new Date(a.endsAt).getTime();
    if (aEnd <= startMs || aStart >= endMs) continue;
    for (const assignee of a.assignees ?? []) {
      if (empSet.has(assignee.employeeId)) {
        out.push({ employeeId: assignee.employeeId, appointment: a });
      }
    }
  }
  return out;
}
