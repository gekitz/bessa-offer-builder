import { describe, expect, it } from 'vitest';
import {
  normaliseAll,
  normaliseAppointments,
  normaliseHolidays,
  normaliseLeaves,
  normaliseShifts,
} from '../lib/normalizeEvents';
import type { Appointment } from '../../tickets/types';
import type { LeaveRequest } from '../../vacation/types';
import type { BankHoliday, Shift } from '../../shifts/types';

const EMP_NAMES = new Map<string, string>([
  ['emp-a', 'Hannes Huber'],
  ['emp-b', 'Klaus Weber'],
]);

const SLOT_LABELS = new Map<number, string>([
  [1, 'Fr Nachmittag'],
  [2, 'Sa'],
]);

describe('normaliseAppointments', () => {
  it('maps appointments to lila events with assignee ids', () => {
    const a: Appointment = {
      id: 'a-1',
      ticketId: 't-1',
      mesonicCustomerId: null,
      customerName: 'Müller GmbH',
      title: 'Vor-Ort-Reparatur',
      description: null,
      kind: 'reparatur',
      startsAt: '2026-05-12T09:00:00Z',
      endsAt: '2026-05-12T11:00:00Z',
      allDay: false,
      location: 'Klagenfurt',
      status: 'geplant',
      standortId: null,
      notes: null,
      createdBy: null,
      createdAt: '2026-05-11T08:00:00Z',
      updatedAt: '2026-05-11T08:00:00Z',
      assignees: [
        { id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' },
      ],
    };
    const [e] = normaliseAppointments([a]);
    expect(e).toMatchObject({
      id: 'appointment:a-1',
      type: 'appointment',
      title: 'Vor-Ort-Reparatur — Müller GmbH',
      color: 'lila',
      employeeIds: ['emp-a'],
      allDay: false,
    });
    expect(e.metadata.ticketId).toBe('t-1');
  });

  it('falls back to title-only when no customer name', () => {
    const a: Appointment = {
      id: 'a-2',
      ticketId: null,
      mesonicCustomerId: null,
      customerName: null,
      title: 'Internes Meeting',
      description: null,
      kind: 'intern',
      startsAt: '2026-05-12T09:00:00Z',
      endsAt: '2026-05-12T10:00:00Z',
      allDay: false,
      location: null,
      status: 'geplant',
      standortId: null,
      notes: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
    };
    expect(normaliseAppointments([a])[0].title).toBe('Internes Meeting');
  });
});

describe('normaliseLeaves', () => {
  it('maps leaves to all-day rot events spanning start to end', () => {
    const l: LeaveRequest & { id: string } = {
      id: 'l-1',
      employeeId: 'emp-a',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-12',
      endDate: '2026-05-14',
      status: 'approved',
    };
    const [e] = normaliseLeaves([l], EMP_NAMES);
    expect(e).toMatchObject({
      id: 'leave:l-1',
      type: 'leave',
      title: 'Hannes Huber — Urlaub',
      color: 'rot',
      employeeIds: ['emp-a'],
      allDay: true,
    });
    expect(e.startsAt.startsWith('2026-05-12')).toBe(true);
    expect(e.endsAt.startsWith('2026-05-14')).toBe(true);
  });

  it('falls back to type label only when employee unknown', () => {
    const l: LeaveRequest & { id: string } = {
      id: 'l-2',
      employeeId: 'unknown',
      leaveTypeCode: 'krankenstand',
      startDate: '2026-05-12',
      endDate: '2026-05-12',
      status: 'approved',
    };
    expect(normaliseLeaves([l]).at(0)?.title).toBe('Krankenstand');
  });

  it('forwards half-day flags into metadata', () => {
    const l: LeaveRequest & { id: string } = {
      id: 'l-3',
      employeeId: 'emp-a',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-12',
      endDate: '2026-05-12',
      status: 'approved',
      halfDayStart: true,
    };
    const e = normaliseLeaves([l], EMP_NAMES)[0];
    expect(e.metadata.halfDayStart).toBe(true);
    expect(e.metadata.halfDayEnd).toBe(false);
  });
});

describe('normaliseShifts', () => {
  it('maps assigned shifts to orange events', () => {
    const s: Shift = {
      id: 's-1',
      date: '2026-05-16',
      slotKindId: 2,
      slotKindCode: 'sat',
      employeeId: 'emp-b',
      status: 'assigned',
      notes: null,
    };
    const [e] = normaliseShifts([s], EMP_NAMES, SLOT_LABELS);
    expect(e).toMatchObject({
      type: 'shift',
      title: 'Klaus Weber — Sa',
      color: 'orange',
      employeeIds: ['emp-b'],
      allDay: true,
    });
  });

  it('handles unassigned shifts (no employeeIds)', () => {
    const s: Shift = {
      id: 's-2',
      date: '2026-05-17',
      slotKindId: 3,
      slotKindCode: 'sun',
      employeeId: null,
      status: 'unassigned',
      notes: null,
    };
    const e = normaliseShifts([s])[0];
    expect(e.employeeIds).toEqual([]);
    expect(e.title).toContain('sun');
  });
});

describe('normaliseHolidays', () => {
  it('maps holidays to grün all-day events', () => {
    const h: BankHoliday = { date: '2026-05-25', name: 'Pfingstmontag' };
    const e = normaliseHolidays([h])[0];
    expect(e).toMatchObject({
      type: 'holiday',
      title: 'Pfingstmontag',
      color: 'gruen',
      employeeIds: [],
      allDay: true,
    });
  });
});

describe('normaliseAll', () => {
  it('combines and sorts by startsAt then type', () => {
    const events = normaliseAll({
      appointments: [
        {
          id: 'a-1', ticketId: null, mesonicCustomerId: null, customerName: null,
          title: 'Termin', description: null, kind: 'reparatur',
          startsAt: '2026-05-12T10:00:00Z', endsAt: '2026-05-12T11:00:00Z',
          allDay: false, location: null, status: 'geplant', standortId: null,
          notes: null, createdBy: null, createdAt: '', updatedAt: '',
        },
      ],
      leaves: [
        {
          id: 'l-1', employeeId: 'emp-a', leaveTypeCode: 'urlaub',
          startDate: '2026-05-12', endDate: '2026-05-12', status: 'approved',
        },
      ],
      holidays: [{ date: '2026-05-12', name: 'Test-Feiertag' }],
    });
    // All three on the same day; all-day events start at T00:00, the
    // appointment at T10:00 — so all-day items come first, then
    // tie-broken by type alphabetically (holiday < leave).
    expect(events.map((e) => e.type)).toEqual(['holiday', 'leave', 'appointment']);
  });

  it('skips layers that are not provided', () => {
    const events = normaliseAll({ holidays: [{ date: '2026-05-12', name: 'X' }] });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('holiday');
  });
});
