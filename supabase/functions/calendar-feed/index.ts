// Public ICS feed for the team's leave calendar.
//
// URL format:
//   GET /functions/v1/calendar-feed?token=<UUID>
//
// The token is the per-employee secret stored in
// employees.calendar_token. Anyone holding it can read the team
// calendar — it is the only auth, so revoking the token
// invalidates the subscription.
//
// Output: RFC 5545 VCALENDAR with one VEVENT per
// approved-or-pending leave across the whole team. Outlook /
// Apple Calendar / Google Calendar poll this URL on their own
// schedule (typically every few hours) and reflect changes
// automatically.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PRODID = '-//KITZ Computer + Office GmbH//Urlaubsplaner//DE';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Offen', approved: 'Genehmigt', rejected: 'Abgelehnt', cancelled: 'Storniert',
};
const ICS_STATUS: Record<string, string> = {
  pending: 'TENTATIVE', approved: 'CONFIRMED', rejected: 'CANCELLED', cancelled: 'CANCELLED',
};

// RFC 5545 §3.3.11 text escaping.
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

function toIcsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function icsDatePlusOne(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${pad2(next.getUTCMonth() + 1)}${pad2(next.getUTCDate())}`;
}

function toIcsTimestamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
    + 'T'
    + `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

// Convert a timestamptz to the ICS format DTSTART/DTEND uses for
// timed events ('YYYYMMDDTHHMMSSZ', UTC).
function toIcsUtcStamp(iso: string): string {
  return toIcsTimestamp(new Date(iso));
}

interface LeaveRow {
  id: string;
  employee_id: string;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  half_day_start: boolean;
  half_day_end: boolean;
  status: string;
  reason: string | null;
  decision_note: string | null;
  substitute_id: string | null;
}

interface EmployeeRow { id: string; name: string }
interface LeaveTypeRow { id: number; label: string }

interface AppointmentRow {
  id: string;
  ticket_id: string | null;
  title: string;
  description: string | null;
  kind: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: string;
}

const APPT_STATUS_LABEL: Record<string, string> = {
  geplant: 'Geplant',
  bestaetigt: 'Bestätigt',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
  abgesagt: 'Abgesagt',
};
const APPT_ICS_STATUS: Record<string, string> = {
  geplant: 'TENTATIVE',
  bestaetigt: 'CONFIRMED',
  in_arbeit: 'CONFIRMED',
  erledigt: 'CONFIRMED',
  abgesagt: 'CANCELLED',
};

function buildICalendar(
  leaves: LeaveRow[],
  appointments: AppointmentRow[],
  employeesById: Map<string, EmployeeRow>,
  leaveTypesById: Map<number, LeaveTypeRow>,
): string {
  const dtstamp = toIcsTimestamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:KITZ Urlaubsplaner',
  ];

  for (const leave of leaves) {
    const emp = employeesById.get(leave.employee_id);
    const type = leaveTypesById.get(leave.leave_type_id);
    const empName = emp?.name ?? leave.employee_id;
    const typeLabel = type?.label ?? String(leave.leave_type_id);
    const statusKey = leave.status ?? 'pending';
    const statusLabel = STATUS_LABEL[statusKey] ?? statusKey;
    const icsStatus = ICS_STATUS[statusKey] ?? 'TENTATIVE';

    const desc: string[] = [`Status: ${statusLabel}`];
    if (leave.half_day_start || leave.half_day_end) {
      const halves: string[] = [];
      if (leave.half_day_start) halves.push('½ Anfang');
      if (leave.half_day_end) halves.push('½ Ende');
      desc.push(`Halbtag: ${halves.join(', ')}`);
    }
    if (leave.reason) desc.push(`Anmerkung: ${leave.reason}`);
    if (leave.decision_note) desc.push(`Entscheidung: ${leave.decision_note}`);
    if (leave.substitute_id) {
      const sub = employeesById.get(leave.substitute_id);
      desc.push(`Vertretung: ${sub?.name ?? leave.substitute_id}`);
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${leave.id}@kitz.co.at`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(leave.start_date)}`,
      `DTEND;VALUE=DATE:${icsDatePlusOne(leave.end_date)}`,
      `SUMMARY:${escapeText(`${empName} — ${typeLabel}`)}`,
      `DESCRIPTION:${escapeText(desc.join('\n'))}`,
      `STATUS:${icsStatus}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  // Appointments come scoped to the requesting employee — see the
  // caller. Each event uses real start/end timestamps (not all-day
  // like leaves).
  for (const a of appointments) {
    const statusLabel = APPT_STATUS_LABEL[a.status] ?? a.status;
    const icsStatus = APPT_ICS_STATUS[a.status] ?? 'TENTATIVE';
    const desc: string[] = [`Status: ${statusLabel}`];
    if (a.description) desc.push(a.description);
    if (a.ticket_id) desc.push(`Ticket-Ref: ${a.ticket_id}`);
    lines.push(
      'BEGIN:VEVENT',
      `UID:appt-${a.id}@kitz.co.at`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${toIcsUtcStamp(a.starts_at)}`,
      `DTEND:${toIcsUtcStamp(a.ends_at)}`,
      `SUMMARY:${escapeText(a.title)}`,
      a.location ? `LOCATION:${escapeText(a.location)}` : '',
      `DESCRIPTION:${escapeText(desc.join('\n'))}`,
      `STATUS:${icsStatus}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  // Drop the empty lines that LOCATION-when-absent produced above
  // (LOCATION line was an empty string; ICS readers don't tolerate them).
  return lines.filter((l) => l !== '').join('\r\n');
}

serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('Missing token', { status: 400 });
  }
  // UUIDs are 36 chars (8-4-4-4-12). Reject anything that doesn't
  // match the shape so we don't burn a DB roundtrip on garbage.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('Invalid token', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Validate the token against an existing employee. The team
  // leave calendar is shared across all tokens; appointments are
  // scoped to the token holder so each technician sees their own
  // Vor-Ort-Termine.
  const { data: tokenRow, error: tokenError } = await supabase
    .from('employees')
    .select('id')
    .eq('calendar_token', token)
    .maybeSingle();
  if (tokenError) {
    return new Response('Lookup failed', { status: 500 });
  }
  if (!tokenRow) {
    return new Response('Invalid token', { status: 401 });
  }
  const requestingEmployeeId = (tokenRow as { id: string }).id;

  // Pull approved + pending leaves; skip rejected / cancelled.
  const { data: leaves, error: leavesError } = await supabase
    .from('leave_requests')
    .select('id, employee_id, leave_type_id, start_date, end_date, half_day_start, half_day_end, status, reason, decision_note, substitute_id')
    .in('status', ['pending', 'approved'])
    .order('start_date');
  if (leavesError) {
    return new Response('Read failed', { status: 500 });
  }

  // Pull this employee's appointments — anything where they appear
  // in appointment_assignees and the appointment isn't cancelled.
  const { data: apptAssignments } = await supabase
    .from('appointment_assignees')
    .select('appointment_id')
    .eq('employee_id', requestingEmployeeId);
  const apptIds = (apptAssignments ?? []).map((r: { appointment_id: string }) => r.appointment_id);

  let appointments: AppointmentRow[] = [];
  if (apptIds.length > 0) {
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, ticket_id, title, description, kind, starts_at, ends_at, location, status')
      .in('id', apptIds)
      .neq('status', 'abgesagt')
      .order('starts_at');
    appointments = (appts ?? []) as AppointmentRow[];
  }

  const { data: employees } = await supabase
    .from('employees')
    .select('id, name');
  const { data: leaveTypes } = await supabase
    .from('leave_types')
    .select('id, label');

  const empById = new Map<string, EmployeeRow>(
    (employees ?? []).map((e: EmployeeRow) => [e.id, e]),
  );
  const typeById = new Map<number, LeaveTypeRow>(
    (leaveTypes ?? []).map((t: LeaveTypeRow) => [t.id, t]),
  );

  const ics = buildICalendar(leaves ?? [], appointments, empById, typeById);
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="kitz-urlaub.ics"',
      // Outlook polls on its own schedule; tell it not to cache so
      // changes propagate as fast as the next poll allows.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
