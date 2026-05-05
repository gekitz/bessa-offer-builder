// RFC 5545 (iCalendar) export of leave requests. Produces an
// all-day-event calendar that can be downloaded and imported into
// Outlook / Apple Calendar / Google Calendar.

import type { Employee, LeaveRequest, LeaveTypeCode } from '../types';
import type { LeaveType } from '../api/vacationApi';

interface BuildOpts {
  leaves: ReadonlyArray<LeaveRequest & { id: string }>;
  employeesById: ReadonlyMap<string, Employee>;
  leaveTypesByCode: ReadonlyMap<LeaveTypeCode, LeaveType>;
  // Stable timestamp used for DTSTAMP. Tests pass a fixed value;
  // production callers omit and we use the current time.
  now?: Date;
  // Calendar name shown in the importing client.
  calendarName?: string;
}

const PRODID = '-//KITZ Computer + Office GmbH//Urlaubsplaner//DE';

// RFC 5545 §3.3.11: text values escape backslash, comma,
// semicolon, and newlines. Order matters — escape backslash first.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// 'YYYY-MM-DD' -> 'YYYYMMDD' (the iCal DATE form).
function toIcsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

// Add one day to an ISO 'YYYY-MM-DD' string; returns iCal DATE form.
// DTEND on an all-day event is exclusive — a 10..15 leave needs
// DTEND = 16.
function icsDatePlusOne(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y!, (m! - 1), d! + 1));
  return `${next.getUTCFullYear()}${pad2(next.getUTCMonth() + 1)}${pad2(next.getUTCDate())}`;
}

function toIcsTimestamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
    + 'T'
    + `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending:   'Offen',
  approved:  'Genehmigt',
  rejected:  'Abgelehnt',
  cancelled: 'Storniert',
};

const ICS_STATUS: Record<string, 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'> = {
  pending:   'TENTATIVE',
  approved:  'CONFIRMED',
  rejected:  'CANCELLED',
  cancelled: 'CANCELLED',
};

// Build an iCalendar text body from the given leaves. Output uses
// CRLF line endings as RFC 5545 requires. Returns the full
// VCALENDAR string (caller wraps it in a Blob for download).
export function buildICalendar({
  leaves,
  employeesById,
  leaveTypesByCode,
  now,
  calendarName = 'KITZ Urlaubsplaner',
}: BuildOpts): string {
  const dtstamp = toIcsTimestamp(now ?? new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const leave of leaves) {
    const emp = employeesById.get(leave.employeeId);
    const type = leaveTypesByCode.get(leave.leaveTypeCode);
    const empName = emp?.name ?? leave.employeeId;
    const typeLabel = type?.label ?? leave.leaveTypeCode;
    const statusKey = leave.status ?? 'pending';
    const statusLabel = STATUS_LABEL[statusKey] ?? statusKey;
    const icsStatus = ICS_STATUS[statusKey] ?? 'TENTATIVE';

    const descriptionParts: string[] = [`Status: ${statusLabel}`];
    if (leave.halfDayStart || leave.halfDayEnd) {
      const halves: string[] = [];
      if (leave.halfDayStart) halves.push('½ Anfang');
      if (leave.halfDayEnd) halves.push('½ Ende');
      descriptionParts.push(`Halbtag: ${halves.join(', ')}`);
    }
    if (leave.reason) descriptionParts.push(`Anmerkung: ${leave.reason}`);
    if (leave.decisionNote) descriptionParts.push(`Entscheidung: ${leave.decisionNote}`);
    if (leave.substituteId) {
      const sub = employeesById.get(leave.substituteId);
      descriptionParts.push(`Vertretung: ${sub?.name ?? leave.substituteId}`);
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${leave.id}@kitz.co.at`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(leave.startDate)}`,
      `DTEND;VALUE=DATE:${icsDatePlusOne(leave.endDate)}`,
      `SUMMARY:${escapeText(`${empName} — ${typeLabel}`)}`,
      `DESCRIPTION:${escapeText(descriptionParts.join('\n'))}`,
      `STATUS:${icsStatus}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
