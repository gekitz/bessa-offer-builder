// Pure normalisation: takes raw rows from the 4 data sources and
// flattens them to a uniform CalendarEvent[]. Has no React or
// Supabase dependency so it's straightforward to test in isolation.

import type { LeaveRequest, LeaveTypeCode } from '../../vacation/types';
import type { BankHoliday, Shift } from '../../shifts/types';
import type { Appointment } from '../../tickets/types';
import {
  type CalendarEvent,
  LAYER_COLOR_BY_TYPE,
} from '../types';

// Date helpers --------------------------------------------------------

// All-day events span [startDay 00:00 local, endDay+1 00:00 local).
// We encode that as plain ISO strings so consumers don't need to know
// the timezone — they just compare to the cell's day.
function isoStartOfDay(day: string): string {
  return `${day}T00:00:00`;
}
function isoEndOfDay(day: string): string {
  return `${day}T23:59:59`;
}

// ── Appointments ────────────────────────────────────────────────────

function appointmentTitle(a: Appointment): string {
  if (a.customerName) return `${a.title} — ${a.customerName}`;
  return a.title;
}

export function normaliseAppointments(rows: Appointment[]): CalendarEvent[] {
  return rows.map((a) => {
    const assigneeIds = (a.assignees ?? []).map((x) => x.employeeId);
    return {
      id: `appointment:${a.id}`,
      type: 'appointment',
      title: appointmentTitle(a),
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      allDay: a.allDay,
      color: LAYER_COLOR_BY_TYPE.appointment,
      employeeIds: assigneeIds,
      metadata: {
        appointmentId: a.id,
        ticketId: a.ticketId,
        status: a.status,
        kind: a.kind,
        location: a.location,
      },
    };
  });
}

// ── Leaves ──────────────────────────────────────────────────────────

const LEAVE_LABELS_DE: Record<LeaveTypeCode, string> = {
  urlaub: 'Urlaub',
  zeitausgleich: 'Zeitausgleich',
  krankenstand: 'Krankenstand',
  schule: 'Schule',
  pflege: 'Pflege',
  schulung: 'Schulung',
  sonderurlaub: 'Sonderurlaub',
};

export function normaliseLeaves(
  rows: Array<LeaveRequest & { id: string }>,
  employeeNameById?: Map<string, string>,
): CalendarEvent[] {
  return rows.map((r) => {
    const emp = employeeNameById?.get(r.employeeId);
    const label = LEAVE_LABELS_DE[r.leaveTypeCode] ?? r.leaveTypeCode;
    return {
      id: `leave:${r.id}`,
      type: 'leave',
      title: emp ? `${emp} — ${label}` : label,
      startsAt: isoStartOfDay(r.startDate),
      endsAt: isoEndOfDay(r.endDate),
      allDay: true,
      color: LAYER_COLOR_BY_TYPE.leave,
      employeeIds: [r.employeeId],
      metadata: {
        leaveRequestId: r.id,
        leaveTypeCode: r.leaveTypeCode,
        status: r.status ?? 'pending',
        halfDayStart: r.halfDayStart ?? false,
        halfDayEnd: r.halfDayEnd ?? false,
      },
    };
  });
}

// ── Shifts ──────────────────────────────────────────────────────────

export function normaliseShifts(
  rows: Shift[],
  employeeNameById?: Map<string, string>,
  slotLabelById?: Map<number, string>,
): CalendarEvent[] {
  return rows.map((s) => {
    const emp = s.employeeId ? employeeNameById?.get(s.employeeId) : undefined;
    const slotLabel = slotLabelById?.get(s.slotKindId);
    const title = [emp, slotLabel].filter(Boolean).join(' — ') || `Schicht ${s.slotKindCode}`;
    return {
      id: `shift:${s.id}`,
      type: 'shift',
      title,
      startsAt: isoStartOfDay(s.date),
      endsAt: isoEndOfDay(s.date),
      allDay: true,
      color: LAYER_COLOR_BY_TYPE.shift,
      employeeIds: s.employeeId ? [s.employeeId] : [],
      metadata: {
        shiftId: s.id,
        slotKindId: s.slotKindId,
        slotKindCode: s.slotKindCode,
        status: s.status,
      },
    };
  });
}

// ── Holidays ────────────────────────────────────────────────────────

export function normaliseHolidays(rows: BankHoliday[]): CalendarEvent[] {
  return rows.map((h) => ({
    id: `holiday:${h.date}`,
    type: 'holiday',
    title: h.name,
    startsAt: isoStartOfDay(h.date),
    endsAt: isoEndOfDay(h.date),
    allDay: true,
    color: LAYER_COLOR_BY_TYPE.holiday,
    employeeIds: [],
    metadata: {
      name: h.name,
    },
  }));
}

// ── Unified ─────────────────────────────────────────────────────────

export interface NormaliseInputs {
  appointments?: Appointment[];
  leaves?: Array<LeaveRequest & { id: string }>;
  shifts?: Shift[];
  holidays?: BankHoliday[];
  employeeNameById?: Map<string, string>;
  slotLabelById?: Map<number, string>;
}

export function normaliseAll(inputs: NormaliseInputs): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  if (inputs.appointments) out.push(...normaliseAppointments(inputs.appointments));
  if (inputs.leaves) out.push(...normaliseLeaves(inputs.leaves, inputs.employeeNameById));
  if (inputs.shifts) out.push(...normaliseShifts(inputs.shifts, inputs.employeeNameById, inputs.slotLabelById));
  if (inputs.holidays) out.push(...normaliseHolidays(inputs.holidays));
  // Sort by start, then type so they paint deterministically.
  out.sort((a, b) => {
    if (a.startsAt !== b.startsAt) return a.startsAt < b.startsAt ? -1 : 1;
    return a.type.localeCompare(b.type);
  });
  return out;
}
