import { describe, expect, it } from 'vitest';
import {
  appointmentIntervalsByEmployee,
  bucketIntoSlots,
  defaultBusinessWindows,
  findFreeSlots,
  hasConflict,
  leaveIntervalsByEmployee,
  subtractBusy,
  windowsForEmployee,
  type FindFreeSlotsInput,
  type Interval,
} from './availability';
import type { Appointment } from '../../tickets/types';
import type { Employee, LeaveRequest } from '../../vacation/types';
import type { BankHoliday, Shift, ShiftSlotKind } from '../../shifts/types';

// All fixtures use local time. The browser running the test treats
// `new Date(y, m, d, h)` as local — same as the production app.
function localMs(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}
function localIso(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

const EMP_A: Employee = {
  id: 'emp-a',
  code: 'A',
  name: 'Hannes Huber',
  standortId: 1,
  weeklyHours: 40,
  employmentType: 'fulltime',
  active: true,
};
const EMP_B: Employee = { ...EMP_A, id: 'emp-b', code: 'B', name: 'Klaus Weber' };

const SLOT_KINDS: ShiftSlotKind[] = [
  { id: 1, code: 'fri_pm', label: 'Fr Nachmittag', startTime: '13:00', endTime: '18:00' },
  { id: 2, code: 'sat', label: 'Sa', startTime: '09:00', endTime: '12:00' },
  { id: 3, code: 'sun', label: 'So', startTime: '09:00', endTime: '12:00' },
  { id: 4, code: 'holiday', label: 'Feiertag', startTime: '09:00', endTime: '12:00' },
];
const slotKindsByCode = new Map(SLOT_KINDS.map((k) => [k.code, k]));

describe('subtractBusy', () => {
  it('returns the full window when busy is empty', () => {
    const w: Interval = { startMs: 0, endMs: 100 };
    expect(subtractBusy(w, [])).toEqual([{ startMs: 0, endMs: 100 }]);
  });

  it('returns [] when busy fully covers the window', () => {
    const w: Interval = { startMs: 10, endMs: 50 };
    expect(subtractBusy(w, [{ startMs: 0, endMs: 100 }])).toEqual([]);
  });

  it('splits a window into two intervals when busy is in the middle', () => {
    const w: Interval = { startMs: 0, endMs: 100 };
    expect(subtractBusy(w, [{ startMs: 40, endMs: 60 }])).toEqual([
      { startMs: 0, endMs: 40 },
      { startMs: 60, endMs: 100 },
    ]);
  });

  it('merges overlapping busy intervals before subtracting', () => {
    const w: Interval = { startMs: 0, endMs: 100 };
    const busy: Interval[] = [
      { startMs: 20, endMs: 50 },
      { startMs: 40, endMs: 70 },
    ];
    expect(subtractBusy(w, busy)).toEqual([
      { startMs: 0, endMs: 20 },
      { startMs: 70, endMs: 100 },
    ]);
  });
});

describe('defaultBusinessWindows', () => {
  it('returns 08–17 local on a Wednesday', () => {
    const out = defaultBusinessWindows('2026-05-13', []);
    expect(out).toEqual([{ startMs: localMs(2026, 5, 13, 8), endMs: localMs(2026, 5, 13, 17) }]);
  });

  it('returns [] on a Saturday', () => {
    expect(defaultBusinessWindows('2026-05-16', [])).toEqual([]);
  });

  it('returns [] on a bank holiday even when it is a weekday', () => {
    // 2026-05-14 is a Thursday — pretend it is a holiday.
    const holidays: BankHoliday[] = [{ date: '2026-05-14', name: 'Christi Himmelfahrt' }];
    expect(defaultBusinessWindows('2026-05-14', holidays)).toEqual([]);
  });
});

describe('windowsForEmployee', () => {
  it('returns the default weekday window when no shift exists', () => {
    const out = windowsForEmployee('emp-a', '2026-05-13', [], slotKindsByCode, []);
    expect(out).toEqual([{ startMs: localMs(2026, 5, 13, 8), endMs: localMs(2026, 5, 13, 17) }]);
  });

  it('returns the shift kind window on a Saturday when employee has an assigned shift', () => {
    const shifts: Shift[] = [
      {
        id: 's1',
        date: '2026-05-16',
        slotKindId: 2,
        slotKindCode: 'sat',
        employeeId: 'emp-a',
        status: 'assigned',
        notes: null,
      },
    ];
    const out = windowsForEmployee('emp-a', '2026-05-16', shifts, slotKindsByCode, []);
    expect(out).toEqual([{ startMs: localMs(2026, 5, 16, 9), endMs: localMs(2026, 5, 16, 12) }]);
  });

  it('returns [] on Saturday when the employee has no shift assigned', () => {
    expect(windowsForEmployee('emp-a', '2026-05-16', [], slotKindsByCode, [])).toEqual([]);
  });

  it('ignores shifts in cancelled or unassigned status', () => {
    const shifts: Shift[] = [
      {
        id: 's1',
        date: '2026-05-16',
        slotKindId: 2,
        slotKindCode: 'sat',
        employeeId: 'emp-a',
        status: 'unassigned',
        notes: null,
      },
    ];
    expect(windowsForEmployee('emp-a', '2026-05-16', shifts, slotKindsByCode, [])).toEqual([]);
  });
});

describe('appointmentIntervalsByEmployee', () => {
  it('fans out one appointment across all assignees', () => {
    const a: Appointment = {
      id: 'a1',
      ticketId: null,
      mesonicCustomerId: null,
      customerName: null,
      title: 'Vor-Ort',
      description: null,
      kind: 'reparatur',
      startsAt: localIso(2026, 5, 13, 9),
      endsAt: localIso(2026, 5, 13, 11),
      allDay: false,
      location: null,
      status: 'geplant',
      standortId: null,
      notes: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      assignees: [
        { id: 'aa1', appointmentId: 'a1', employeeId: 'emp-a', role: 'lead', createdAt: '' },
        { id: 'aa2', appointmentId: 'a1', employeeId: 'emp-b', role: 'lehrling', createdAt: '' },
      ],
    };
    const map = appointmentIntervalsByEmployee([a]);
    expect(map.get('emp-a')).toHaveLength(1);
    expect(map.get('emp-b')).toHaveLength(1);
  });

  it('skips cancelled appointments', () => {
    const a: Appointment = {
      id: 'a1',
      ticketId: null,
      mesonicCustomerId: null,
      customerName: null,
      title: 'Cancelled',
      description: null,
      kind: 'reparatur',
      startsAt: localIso(2026, 5, 13, 9),
      endsAt: localIso(2026, 5, 13, 11),
      allDay: false,
      location: null,
      status: 'abgesagt',
      standortId: null,
      notes: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      assignees: [{ id: 'aa1', appointmentId: 'a1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
    };
    expect(appointmentIntervalsByEmployee([a]).size).toBe(0);
  });
});

describe('leaveIntervalsByEmployee', () => {
  it('blocks the full business window for a full-day approved leave', () => {
    const l: LeaveRequest = {
      employeeId: 'emp-a',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-13',
      endDate: '2026-05-13',
      status: 'approved',
    };
    const map = leaveIntervalsByEmployee([l], '2026-05-13');
    expect(map.get('emp-a')).toEqual([
      { startMs: localMs(2026, 5, 13, 8), endMs: localMs(2026, 5, 13, 17) },
    ]);
  });

  it('halfDayStart blocks only the afternoon on the start day', () => {
    const l: LeaveRequest = {
      employeeId: 'emp-a',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-13',
      endDate: '2026-05-15',
      halfDayStart: true,
      status: 'approved',
    };
    expect(leaveIntervalsByEmployee([l], '2026-05-13').get('emp-a')).toEqual([
      { startMs: localMs(2026, 5, 13, 12, 30), endMs: localMs(2026, 5, 13, 17) },
    ]);
  });

  it('halfDayEnd blocks only the morning on the end day', () => {
    const l: LeaveRequest = {
      employeeId: 'emp-a',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-13',
      endDate: '2026-05-15',
      halfDayEnd: true,
      status: 'approved',
    };
    expect(leaveIntervalsByEmployee([l], '2026-05-15').get('emp-a')).toEqual([
      { startMs: localMs(2026, 5, 15, 8), endMs: localMs(2026, 5, 15, 12, 30) },
    ]);
  });

  it('ignores rejected and cancelled leaves', () => {
    const rejected: LeaveRequest = {
      employeeId: 'emp-a',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-13',
      endDate: '2026-05-13',
      status: 'rejected',
    };
    expect(leaveIntervalsByEmployee([rejected], '2026-05-13').size).toBe(0);
  });
});

describe('bucketIntoSlots', () => {
  it('buckets a 4h free interval into four 60-min slots', () => {
    const free: Interval = { startMs: localMs(2026, 5, 13, 13), endMs: localMs(2026, 5, 13, 17) };
    const slots = bucketIntoSlots(free, 60, free.startMs);
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ startMs: localMs(2026, 5, 13, 13), endMs: localMs(2026, 5, 13, 14) });
    expect(slots[3]).toEqual({ startMs: localMs(2026, 5, 13, 16), endMs: localMs(2026, 5, 13, 17) });
  });

  it('respects slotMinutes=30 and trims a partial trailing slot', () => {
    const free: Interval = { startMs: localMs(2026, 5, 13, 13), endMs: localMs(2026, 5, 13, 14, 45) };
    const slots = bucketIntoSlots(free, 30, free.startMs);
    expect(slots).toHaveLength(3);
    expect(slots.at(-1)).toEqual({
      startMs: localMs(2026, 5, 13, 14),
      endMs: localMs(2026, 5, 13, 14, 30),
    });
  });

  it('starts no earlier than earliestStart', () => {
    const free: Interval = { startMs: localMs(2026, 5, 13, 8), endMs: localMs(2026, 5, 13, 12) };
    const earliest = localMs(2026, 5, 13, 10, 15);
    const slots = bucketIntoSlots(free, 60, earliest);
    expect(slots[0]).toEqual({
      startMs: localMs(2026, 5, 13, 10, 15),
      endMs: localMs(2026, 5, 13, 11, 15),
    });
  });
});

describe('findFreeSlots', () => {
  const baseInput = (overrides: Partial<FindFreeSlotsInput> = {}): FindFreeSlotsInput => ({
    employees: [EMP_A],
    appointments: [],
    leaves: [],
    shifts: [],
    slotKinds: SLOT_KINDS,
    holidays: [],
    // Tuesday 2026-05-12 07:00 local — well before business hours, so
    // the whole 08–17 window for that day is reachable.
    now: new Date(2026, 4, 12, 7, 0),
    daysAhead: 1,
    slotMinutes: 60,
  });

  it('returns 9 hourly slots in an empty 08–17 weekday window', () => {
    const slots = findFreeSlots(baseInput());
    expect(slots).toHaveLength(6); // capped at maxPerEmployeePerDay default
    expect(slots[0].startsAt).toBe(localIso(2026, 5, 12, 8));
  });

  it('starts no earlier than the next 15-min boundary after now', () => {
    // 09:07 local → next 15-min boundary is 09:15.
    const slots = findFreeSlots({ ...baseInput(), now: new Date(2026, 4, 12, 9, 7) });
    expect(slots[0].startsAt).toBe(localIso(2026, 5, 12, 9, 15));
  });

  it('omits an employee fully covered by approved leave on the only day in range', () => {
    const leave: LeaveRequest = {
      employeeId: 'emp-a',
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-12',
      endDate: '2026-05-12',
      status: 'approved',
    };
    const slots = findFreeSlots({ ...baseInput(), leaves: [leave] });
    expect(slots).toHaveLength(0);
  });

  it('subtracts a mid-day appointment from the free slots', () => {
    const appt: Appointment = {
      id: 'a1',
      ticketId: null,
      mesonicCustomerId: null,
      customerName: null,
      title: 'Block',
      description: null,
      kind: 'reparatur',
      startsAt: localIso(2026, 5, 12, 10),
      endsAt: localIso(2026, 5, 12, 12),
      allDay: false,
      location: null,
      status: 'geplant',
      standortId: null,
      notes: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      assignees: [{ id: 'aa1', appointmentId: 'a1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
    };
    const slots = findFreeSlots({ ...baseInput(), appointments: [appt], maxPerEmployeePerDay: 99 });
    const startTimes = slots.map((s) => s.startsAt);
    expect(startTimes).toContain(localIso(2026, 5, 12, 8));
    expect(startTimes).toContain(localIso(2026, 5, 12, 9));
    expect(startTimes).not.toContain(localIso(2026, 5, 12, 10));
    expect(startTimes).not.toContain(localIso(2026, 5, 12, 11));
    expect(startTimes).toContain(localIso(2026, 5, 12, 12));
  });

  it('produces sorted output by startsAt then employeeId', () => {
    const slots = findFreeSlots({
      ...baseInput(),
      employees: [EMP_B, EMP_A], // input order reversed
    });
    expect(slots[0].employeeId).toBe('emp-a'); // sorted alpha after same startsAt
    expect(slots[1].employeeId).toBe('emp-b');
  });

  it('filters by employeeIds when provided', () => {
    const slots = findFreeSlots({
      ...baseInput(),
      employees: [EMP_A, EMP_B],
      employeeIds: ['emp-b'],
    });
    expect(slots.every((s) => s.employeeId === 'emp-b')).toBe(true);
  });

  it('uses shift window on Saturday when an assigned shift exists', () => {
    const shifts: Shift[] = [
      {
        id: 's1',
        date: '2026-05-16',
        slotKindId: 2,
        slotKindCode: 'sat',
        employeeId: 'emp-a',
        status: 'assigned',
        notes: null,
      },
    ];
    const slots = findFreeSlots({
      ...baseInput(),
      now: new Date(2026, 4, 16, 7, 0),
      daysAhead: 1,
      shifts,
    });
    // Saturday shift 09–12 = 3 hourly slots.
    expect(slots).toHaveLength(3);
    expect(slots[0].startsAt).toBe(localIso(2026, 5, 16, 9));
    expect(slots[2].endsAt).toBe(localIso(2026, 5, 16, 12));
  });
});

describe('hasConflict', () => {
  const overlapping: Appointment = {
    id: 'a1',
    ticketId: null,
    mesonicCustomerId: null,
    customerName: null,
    title: 'Existing',
    description: null,
    kind: 'reparatur',
    startsAt: localIso(2026, 5, 13, 10),
    endsAt: localIso(2026, 5, 13, 12),
    allDay: false,
    location: null,
    status: 'geplant',
    standortId: null,
    notes: null,
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    assignees: [{ id: 'aa1', appointmentId: 'a1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
  };

  it('flags overlap when starts_at falls inside an existing appointment for the same employee', () => {
    const conflicts = hasConflict(
      ['emp-a'],
      localIso(2026, 5, 13, 11),
      localIso(2026, 5, 13, 13),
      [overlapping],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].employeeId).toBe('emp-a');
  });

  it('ignores employees not in the requested set', () => {
    const conflicts = hasConflict(
      ['emp-b'],
      localIso(2026, 5, 13, 11),
      localIso(2026, 5, 13, 13),
      [overlapping],
    );
    expect(conflicts).toHaveLength(0);
  });

  it('ignores back-to-back appointments (no overlap when end === next start)', () => {
    const conflicts = hasConflict(
      ['emp-a'],
      localIso(2026, 5, 13, 12),
      localIso(2026, 5, 13, 13),
      [overlapping],
    );
    expect(conflicts).toHaveLength(0);
  });

  it('skips the appointment matching excludeAppointmentId (for edit flows)', () => {
    const conflicts = hasConflict(
      ['emp-a'],
      localIso(2026, 5, 13, 11),
      localIso(2026, 5, 13, 13),
      [overlapping],
      'a1',
    );
    expect(conflicts).toHaveLength(0);
  });
});
