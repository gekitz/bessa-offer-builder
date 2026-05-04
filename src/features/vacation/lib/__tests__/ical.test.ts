import { describe, it, expect } from 'vitest';
import { buildICalendar } from '../ical';
import type { Employee, LeaveRequest, LeaveTypeCode } from '../../types';
import type { LeaveType } from '../../api/vacationApi';

const stefan: Employee = {
  id: 'sbauer-id', code: 'sbauer', name: 'Stefan Bauer',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const mario: Employee = {
  id: 'mgraf-id', code: 'mgraf', name: 'Mario Graf',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const employeesById = new Map<string, Employee>([
  [stefan.id, stefan],
  [mario.id, mario],
]);

const leaveTypesByCode = new Map<LeaveTypeCode, LeaveType>([
  ['urlaub',       { id: 1, code: 'urlaub',       label: 'Urlaub',       deductsFromBalance: true }],
  ['krankenstand', { id: 3, code: 'krankenstand', label: 'Krankenstand', deductsFromBalance: false }],
]);

const FIXED_NOW = new Date('2026-05-04T10:00:00Z');

function build(leaves: ReadonlyArray<LeaveRequest & { id: string }>): string {
  return buildICalendar({ leaves, employeesById, leaveTypesByCode, now: FIXED_NOW });
}

describe('buildICalendar — VCALENDAR envelope', () => {
  it('produces a valid header + footer with no events', () => {
    const ics = build([]);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/\r\nEND:VCALENDAR$/);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//KITZ Computer + Office GmbH//Urlaubsplaner//DE');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('uses CRLF line endings everywhere (RFC 5545)', () => {
    const ics = build([]);
    // Every newline is CRLF, no bare LF allowed.
    const naked = ics.replace(/\r\n/g, '');
    expect(naked).not.toContain('\n');
  });

  it('includes the calendar name in X-WR-CALNAME', () => {
    const ics = buildICalendar({
      leaves: [],
      employeesById,
      leaveTypesByCode,
      now: FIXED_NOW,
      calendarName: 'My Custom Name',
    });
    expect(ics).toContain('X-WR-CALNAME:My Custom Name');
  });
});

describe('buildICalendar — VEVENT generation', () => {
  const oneLeave: LeaveRequest & { id: string } = {
    id: 'lr-1',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-08-10',
    endDate: '2026-08-15',
    status: 'approved',
  };

  it('emits one VEVENT block per leave', () => {
    const ics = build([oneLeave, { ...oneLeave, id: 'lr-2', employeeId: mario.id }]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
  });

  it('uses DATE format for DTSTART and DTEND, with DTEND = end + 1 day (exclusive)', () => {
    const ics = build([oneLeave]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260810');
    expect(ics).toContain('DTEND;VALUE=DATE:20260816'); // 15 + 1
  });

  it('handles single-day requests — DTEND is the next day', () => {
    const single: LeaveRequest & { id: string } = {
      ...oneLeave,
      id: 'lr-single',
      startDate: '2026-12-31',
      endDate: '2026-12-31',
    };
    const ics = build([single]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('uses a stable, scoped UID containing the request id', () => {
    const ics = build([oneLeave]);
    expect(ics).toContain('UID:lr-1@kitz.co.at');
  });

  it('uses the fixed now value for DTSTAMP (deterministic)', () => {
    const ics = build([oneLeave]);
    expect(ics).toContain('DTSTAMP:20260504T100000Z');
  });

  it('summary is "<employee name> — <leave type label>"', () => {
    const ics = build([oneLeave]);
    expect(ics).toContain('SUMMARY:Stefan Bauer — Urlaub');
  });

  it('falls back to raw id and code when employee or leave type is missing', () => {
    const orphan: LeaveRequest & { id: string } = {
      ...oneLeave,
      employeeId: 'unknown',
      leaveTypeCode: 'sonderurlaub',
    };
    const ics = build([orphan]);
    expect(ics).toContain('SUMMARY:unknown — sonderurlaub');
  });

  it('maps statuses: pending -> TENTATIVE, approved -> CONFIRMED, rejected/cancelled -> CANCELLED', () => {
    const cases: Array<[NonNullable<LeaveRequest['status']>, string]> = [
      ['pending',   'STATUS:TENTATIVE'],
      ['approved',  'STATUS:CONFIRMED'],
      ['rejected',  'STATUS:CANCELLED'],
      ['cancelled', 'STATUS:CANCELLED'],
    ];
    for (const [status, expected] of cases) {
      const ics = build([{ ...oneLeave, status }]);
      expect(ics).toContain(expected);
    }
  });

  it('TRANSP:TRANSPARENT — leaves don\'t block free/busy on import', () => {
    const ics = build([oneLeave]);
    expect(ics).toContain('TRANSP:TRANSPARENT');
  });
});

describe('buildICalendar — DESCRIPTION composition + escaping', () => {
  const base: LeaveRequest & { id: string } = {
    id: 'lr-1',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-08-10',
    endDate: '2026-08-15',
    status: 'approved',
  };

  it('always includes the localised status label', () => {
    expect(build([{ ...base, status: 'approved' }])).toContain('DESCRIPTION:Status: Genehmigt');
    expect(build([{ ...base, status: 'pending' }])).toContain('DESCRIPTION:Status: Offen');
    expect(build([{ ...base, status: 'cancelled' }])).toContain('DESCRIPTION:Status: Storniert');
  });

  it('appends the half-day flags when set', () => {
    const ics = build([{ ...base, halfDayStart: true, halfDayEnd: true }]);
    expect(ics).toContain('Halbtag: ½ Anfang\\, ½ Ende');
  });

  it('appends the reason when present, escaping commas and semicolons', () => {
    const ics = build([{ ...base, reason: 'Sommerurlaub, mit Familie; Kärnten' }]);
    expect(ics).toContain('Anmerkung: Sommerurlaub\\, mit Familie\\; Kärnten');
  });

  it('appends the decision note when present', () => {
    const ics = build([{ ...base, status: 'rejected', decisionNote: 'Konflikt mit MFP-Lehrling' }]);
    expect(ics).toContain('Entscheidung: Konflikt mit MFP-Lehrling');
  });

  it('appends the substitute name when set', () => {
    const ics = build([{ ...base, substituteId: mario.id }]);
    expect(ics).toContain('Vertretung: Mario Graf');
  });

  it('joins description segments with literal \\n inside the DESCRIPTION value', () => {
    const ics = build([{
      ...base,
      reason: 'Sommerurlaub',
      substituteId: mario.id,
    }]);
    // Three segments joined with \n -> on the wire that's the literal
    // backslash-n sequence per RFC 5545 escaping (real CRLF would
    // break the property line).
    const desc = ics.split('\r\n').find((l) => l.startsWith('DESCRIPTION:'))!;
    expect(desc).toContain('Status: Genehmigt');
    expect(desc).toContain('\\nAnmerkung: Sommerurlaub');
    expect(desc).toContain('\\nVertretung: Mario Graf');
  });

  it('escapes backslashes in reason text', () => {
    const ics = build([{ ...base, reason: 'C:\\Users\\stefan' }]);
    // backslashes get doubled per RFC 5545.
    expect(ics).toContain('Anmerkung: C:\\\\Users\\\\stefan');
  });
});
