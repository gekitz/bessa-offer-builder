import { supabase } from '../../../lib/supabase';
import type {
  BlackoutPeriod,
  CoverageRule,
  Employee,
  EmployeeRole,
  IsoDate,
  LeaveRequest,
  LeaveStatus,
  LeaveTypeCode,
  RuleContext,
} from '../types';

// ID <-> code mapping for leave_types. The IDs come from the seed
// in supabase/migrations/20260504120000_create_workforce.sql and must
// stay in sync with that migration. Centralised here so the rest of
// the app talks in codes.
export const LEAVE_TYPE_ID_BY_CODE: Record<LeaveTypeCode, number> = {
  urlaub: 1,
  zeitausgleich: 2,
  krankenstand: 3,
  schule: 4,
  pflege: 5,
  schulung: 6,
  sonderurlaub: 7,
};

const LEAVE_TYPE_CODE_BY_ID = Object.fromEntries(
  Object.entries(LEAVE_TYPE_ID_BY_CODE).map(([code, id]) => [id, code]),
) as Record<number, LeaveTypeCode>;

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// ---------------------------------------------------------
// Audit log
// ---------------------------------------------------------
//
// Append-only trail of who changed what on a leave request. Required
// for AK / Betriebsrat traceability (Konzept v4 §audit). We write
// best-effort: the mutation that triggered the audit has already
// succeeded by the time we get here, so an audit failure logs a
// warning rather than rolling back the user-facing action. The
// append-only invariant is enforced at the SQL layer (no UPDATE /
// DELETE policies).

export type AuditAction =
  | 'leave.created'
  | 'leave.updated'
  | 'leave.decided'
  | 'leave.cancelled';

interface WriteAuditOpts {
  actorId?: string | null;
  action: AuditAction;
  entityType: 'leave_request';
  entityId: string;
  details?: Record<string, unknown>;
}

async function writeAuditLog(opts: WriteAuditOpts): Promise<void> {
  const sb = requireSupabase();
  try {
    const { error } = await sb.from('workforce_audit_log').insert({
      actor_id: opts.actorId ?? null,
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      details: opts.details ?? null,
    });
    if (error) console.warn('audit log write failed:', error.message);
  } catch (err) {
    console.warn('audit log write failed:', err);
  }
}

// ---------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------

export interface Standort { id: number; name: string }
export interface Abteilung { id: number; name: string }
export interface LeaveType { id: number; code: LeaveTypeCode; label: string; deductsFromBalance: boolean }

export async function listStandorte(): Promise<Standort[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('standorte').select('id, name').order('id');
  if (error) throw error;
  return (data ?? []) as Standort[];
}

export async function listAbteilungen(): Promise<Abteilung[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('abteilungen').select('id, name').order('id');
  if (error) throw error;
  return (data ?? []) as Abteilung[];
}

export async function listLeaveTypes(): Promise<LeaveType[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('leave_types')
    .select('id, code, label, deducts_from_balance')
    .order('id');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    code: row.code as LeaveTypeCode,
    label: row.label,
    deductsFromBalance: row.deducts_from_balance,
  }));
}

// ---------------------------------------------------------
// Employees
// ---------------------------------------------------------

function rowToEmployee(row: any): Employee {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email ?? null,
    standortId: row.standort_id,
    hireDate: row.hire_date ?? undefined,
    weeklyHours: Number(row.weekly_hours),
    employmentType: row.employment_type,
    active: row.active,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

const EMPLOYEE_COLUMNS = 'id, code, name, email, standort_id, hire_date, weekly_hours, employment_type, active, tags';

export async function listEmployees(opts: { activeOnly?: boolean } = {}): Promise<Employee[]> {
  const sb = requireSupabase();
  let q = sb.from('employees').select(EMPLOYEE_COLUMNS).order('name');
  if (opts.activeOnly !== false) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToEmployee);
}

export async function getEmployeeByCode(code: string): Promise<Employee | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEmployee(data) : null;
}

// Per-employee subscription token used as auth on the public ICS
// feed endpoint. Returns the existing token; the column is NOT NULL
// in the schema so every employee row has one.
export async function getCalendarToken(employeeId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('get_employee_calendar_token', {
    p_employee_id: employeeId,
  });
  if (error) throw error;
  if (!data) throw new Error('Kalendertoken nicht verfügbar');
  return String(data);
}

// Rotate the employee's calendar token. Any existing calendar
// subscriptions set up against the old URL stop receiving updates.
export async function regenerateCalendarToken(employeeId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('rotate_employee_calendar_token', {
    p_employee_id: employeeId,
  });
  if (error) throw error;
  if (!data) throw new Error('Kalendertoken nicht verfügbar');
  return String(data);
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<Employee> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.hireDate !== undefined) dbPatch.hire_date = patch.hireDate;
  if (patch.weeklyHours !== undefined) dbPatch.weekly_hours = patch.weeklyHours;
  if (patch.employmentType !== undefined) dbPatch.employment_type = patch.employmentType;
  if (patch.active !== undefined) dbPatch.active = patch.active;
  if (patch.standortId !== undefined) dbPatch.standort_id = patch.standortId;
  if (patch.tags !== undefined) dbPatch.tags = patch.tags;

  const { data, error } = await sb
    .from('employees')
    .update(dbPatch)
    .eq('id', id)
    .select(EMPLOYEE_COLUMNS)
    .single();
  if (error) throw error;
  return rowToEmployee(data);
}

// ---------------------------------------------------------
// Employee roles
// ---------------------------------------------------------

function rowToRole(row: any): EmployeeRole {
  return {
    id: row.id,
    employeeId: row.employee_id,
    abteilungId: row.abteilung_id,
    standortId: row.standort_id,
    kind: row.kind,
    supervisorEmployeeId: row.supervisor_employee_id ?? undefined,
    qualifier: row.qualifier ?? undefined,
    validFrom: row.valid_from ?? undefined,
    validTo: row.valid_to ?? undefined,
  };
}

export async function listEmployeeRoles(): Promise<EmployeeRole[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('employee_roles')
    .select('id, employee_id, abteilung_id, standort_id, kind, supervisor_employee_id, qualifier, valid_from, valid_to');
  if (error) throw error;
  return (data ?? []).map(rowToRole);
}

// ---------------------------------------------------------
// Substitutes
// ---------------------------------------------------------

export interface Substitute {
  id: string;
  employeeId: string;
  substituteEmployeeId: string;
  priority: number;
}

export async function listSubstitutes(employeeId?: string): Promise<Substitute[]> {
  const sb = requireSupabase();
  let q = sb.from('substitutes').select('id, employee_id, substitute_employee_id, priority').order('priority');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    employeeId: row.employee_id,
    substituteEmployeeId: row.substitute_employee_id,
    priority: row.priority,
  }));
}

// ---------------------------------------------------------
// Coverage rules
// ---------------------------------------------------------

function rowToCoverageRule(row: any): CoverageRule {
  return {
    id: row.id,
    name: row.name,
    scopeStandortId: row.scope_standort_id ?? undefined,
    scopeAbteilungId: row.scope_abteilung_id ?? undefined,
    appliesToEmployees: row.applies_to_employees ?? undefined,
    maxConcurrentOnLeave: row.max_concurrent_on_leave,
    kind: row.kind,
    active: row.active,
  };
}

export async function listCoverageRules(opts: { activeOnly?: boolean } = {}): Promise<CoverageRule[]> {
  const sb = requireSupabase();
  let q = sb
    .from('coverage_rules')
    .select('id, name, scope_standort_id, scope_abteilung_id, applies_to_employees, max_concurrent_on_leave, kind, active');
  if (opts.activeOnly !== false) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToCoverageRule);
}

// ---------------------------------------------------------
// Blackout periods
// ---------------------------------------------------------

function rowToBlackout(row: any): BlackoutPeriod {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    appliesToStandortIds: row.applies_to_standort_ids ?? undefined,
    appliesToAbteilungIds: row.applies_to_abteilung_ids ?? undefined,
    severity: row.severity,
    active: row.active,
  };
}

export async function listBlackoutPeriods(opts: { activeOnly?: boolean } = {}): Promise<BlackoutPeriod[]> {
  const sb = requireSupabase();
  let q = sb
    .from('blackout_periods')
    .select('id, name, start_date, end_date, applies_to_standort_ids, applies_to_abteilung_ids, severity, active')
    .order('start_date');
  if (opts.activeOnly !== false) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToBlackout);
}

// ---------------------------------------------------------
// Leave requests
// ---------------------------------------------------------

function rowToLeaveRequest(row: any): LeaveRequest & { id: string } {
  return {
    id: row.id,
    employeeId: row.employee_id,
    leaveTypeCode: LEAVE_TYPE_CODE_BY_ID[row.leave_type_id]!,
    startDate: row.start_date,
    endDate: row.end_date,
    halfDayStart: row.half_day_start,
    halfDayEnd: row.half_day_end,
    status: row.status,
    reason: row.reason ?? undefined,
    substituteId: row.substitute_id ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    decidedBy: row.decided_by ?? undefined,
    decisionNote: row.decision_note ?? undefined,
    attachmentPath: row.attachment_path ?? null,
  };
}

const LEAVE_REQUEST_COLUMNS =
  'id, employee_id, leave_type_id, start_date, end_date, half_day_start, half_day_end, status, reason, substitute_id, created_at, decided_at, decided_by, decision_note, attachment_path';

const LEAVE_ATTACHMENTS_BUCKET = 'leave-attachments';

export interface ListLeavesFilter {
  status?: LeaveStatus | LeaveStatus[];
  employeeId?: string;
  // Inclusive — matches any leave whose [start_date, end_date] overlaps.
  rangeStart?: IsoDate;
  rangeEnd?: IsoDate;
}

export async function listLeaveRequests(filter: ListLeavesFilter = {}): Promise<Array<LeaveRequest & { id: string }>> {
  const sb = requireSupabase();
  let q = sb.from('leave_requests').select(LEAVE_REQUEST_COLUMNS).order('start_date');
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.status) {
    if (Array.isArray(filter.status)) q = q.in('status', filter.status);
    else q = q.eq('status', filter.status);
  }
  if (filter.rangeStart) q = q.gte('end_date', filter.rangeStart);
  if (filter.rangeEnd) q = q.lte('start_date', filter.rangeEnd);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToLeaveRequest);
}

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeCode: LeaveTypeCode;
  startDate: IsoDate;
  endDate: IsoDate;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
  reason?: string;
  substituteId?: string;
}

export async function createLeaveRequest(
  input: CreateLeaveRequestInput,
  opts: {
    actorId?: string | null;
    // When set, the row is inserted as status='approved' with the
    // decided_* fields populated inline. Used by the approver
    // override path on the form (admin entering on behalf of an
    // employee + skipping the pending → decide round-trip). No
    // notify-leave-decision email fires for inline approvals — the
    // employee already knows about the entry.
    directlyApprove?: {
      decidedBy: string;
      note?: string;
      // When true, the audit details flag `overrideViolations: true`
      // so the trail records that the approver saved despite rule
      // violations.
      overrodeViolations?: boolean;
    };
  } = {},
): Promise<LeaveRequest & { id: string }> {
  const sb = requireSupabase();
  const directly = opts.directlyApprove;
  const row: Record<string, unknown> = {
    employee_id: input.employeeId,
    leave_type_id: LEAVE_TYPE_ID_BY_CODE[input.leaveTypeCode],
    start_date: input.startDate,
    end_date: input.endDate,
    half_day_start: input.halfDayStart ?? false,
    half_day_end: input.halfDayEnd ?? false,
    reason: input.reason ?? null,
    substitute_id: input.substituteId ?? null,
    status: directly ? 'approved' : 'pending',
  };
  if (directly) {
    row.decided_at = new Date().toISOString();
    row.decided_by = directly.decidedBy;
    row.decision_note = directly.note ?? null;
  }
  const { data, error } = await sb
    .from('leave_requests')
    .insert(row)
    .select(LEAVE_REQUEST_COLUMNS)
    .single();
  if (error) throw error;
  const created = rowToLeaveRequest(data);
  await writeAuditLog({
    actorId: opts.actorId ?? directly?.decidedBy ?? input.employeeId,
    action: 'leave.created',
    entityType: 'leave_request',
    entityId: created.id,
    details: {
      employeeId: created.employeeId,
      leaveTypeCode: created.leaveTypeCode,
      startDate: created.startDate,
      endDate: created.endDate,
      halfDayStart: created.halfDayStart,
      halfDayEnd: created.halfDayEnd,
      reason: created.reason ?? null,
      substituteId: created.substituteId ?? null,
      directlyApproved: !!directly,
      overrodeViolations: directly?.overrodeViolations ?? false,
    },
  });
  return created;
}

export type UpdateLeaveRequestPatch = Partial<CreateLeaveRequestInput>;

// Update a leave request. Status / decided_* fields are not
// editable here — use decideLeaveRequest / cancelLeaveRequest for
// transitions. Caller is expected to scope this to status='pending'
// rows (a UI concern); the server permits any status to be patched.
export async function updateLeaveRequest(
  id: string,
  patch: UpdateLeaveRequestPatch,
  opts: { actorId?: string | null } = {},
): Promise<LeaveRequest & { id: string }> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.employeeId !== undefined) dbPatch.employee_id = patch.employeeId;
  if (patch.leaveTypeCode !== undefined) dbPatch.leave_type_id = LEAVE_TYPE_ID_BY_CODE[patch.leaveTypeCode];
  if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate;
  if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate;
  if (patch.halfDayStart !== undefined) dbPatch.half_day_start = patch.halfDayStart;
  if (patch.halfDayEnd !== undefined) dbPatch.half_day_end = patch.halfDayEnd;
  if (patch.reason !== undefined) dbPatch.reason = patch.reason || null;
  if (patch.substituteId !== undefined) dbPatch.substitute_id = patch.substituteId || null;

  const { data, error } = await sb
    .from('leave_requests')
    .update(dbPatch)
    .eq('id', id)
    .select(LEAVE_REQUEST_COLUMNS)
    .single();
  if (error) throw error;
  const updated = rowToLeaveRequest(data);
  await writeAuditLog({
    actorId: opts.actorId ?? null,
    action: 'leave.updated',
    entityType: 'leave_request',
    entityId: id,
    details: { patch },
  });
  return updated;
}

// decidedBy is optional today because we don't have a Microsoft-SSO ->
// employees.id mapping yet. The `decided_by` column is nullable in the
// schema; once the mapping lands, callers should pass the approver's
// employee.id and the column can be tightened to NOT NULL via a follow-up
// migration.
export async function decideLeaveRequest(
  id: string,
  decision: 'approved' | 'rejected',
  decidedBy?: string | null,
  note?: string,
): Promise<LeaveRequest & { id: string }> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('leave_requests')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy ?? null,
      decision_note: note ?? null,
    })
    .eq('id', id)
    .select(LEAVE_REQUEST_COLUMNS)
    .single();
  if (error) throw error;

  await writeAuditLog({
    actorId: decidedBy ?? null,
    action: 'leave.decided',
    entityType: 'leave_request',
    entityId: id,
    details: { decision, note: note ?? null },
  });

  // Fire-and-forget notification. We deliberately do not await so an
  // email/Resend outage cannot rollback or fail the decision; the
  // approver already saw the row update succeed in their UI.
  void sb.functions.invoke('notify-leave-decision', { body: { leaveRequestId: id } })
    .catch((err) => {
      console.warn('notify-leave-decision invoke failed:', err);
    });

  return rowToLeaveRequest(data);
}

export async function cancelLeaveRequest(
  id: string,
  opts: { actorId?: string | null } = {},
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
  await writeAuditLog({
    actorId: opts.actorId ?? null,
    action: 'leave.cancelled',
    entityType: 'leave_request',
    entityId: id,
  });
}

// ---------------------------------------------------------
// Leave attachments (Krankmeldung)
// ---------------------------------------------------------

// Upload a Krankmeldung (or any attachment) for a leave request.
// File is stored at `${leaveRequestId}/${filename}` in the private
// `leave-attachments` bucket. The returned path is also persisted on
// the leave_requests row so subsequent fetches can render the link.
//
// Replaces any existing attachment on the same row (the new path
// overwrites the column; the old object stays in storage but
// becomes unreferenced — fine for the audit trail, can be GC'd
// later via a cron if storage cost matters).
export async function uploadLeaveAttachment(
  leaveRequestId: string,
  file: File,
): Promise<string> {
  const sb = requireSupabase();
  const cleanName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${leaveRequestId}/${Date.now()}-${cleanName}`;
  const { error: uploadError } = await sb.storage
    .from(LEAVE_ATTACHMENTS_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: updateError } = await sb
    .from('leave_requests')
    .update({ attachment_path: path })
    .eq('id', leaveRequestId);
  if (updateError) throw updateError;

  return path;
}

// Mint a short-lived signed URL for an attachment path. Callers
// pass the value of leave_requests.attachment_path; we hand back a
// URL the browser can open directly. ttlSeconds defaults to 300 so
// the link goes stale quickly if it leaks.
export async function getLeaveAttachmentSignedUrl(
  attachmentPath: string,
  ttlSeconds = 300,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.storage
    .from(LEAVE_ATTACHMENTS_BUCKET)
    .createSignedUrl(attachmentPath, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------
// Leave balances
// ---------------------------------------------------------

export interface LeaveBalance {
  id: string;
  employeeId: string;
  year: number;
  leaveTypeCode: LeaveTypeCode;
  entitled: number;
  carriedOver: number;
  used: number;
  planned: number;
}

function rowToBalance(row: any): LeaveBalance {
  return {
    id: row.id,
    employeeId: row.employee_id,
    year: row.year,
    leaveTypeCode: LEAVE_TYPE_CODE_BY_ID[row.leave_type_id]!,
    entitled: Number(row.entitled),
    carriedOver: Number(row.carried_over),
    used: Number(row.used),
    planned: Number(row.planned),
  };
}

export async function listLeaveBalances(employeeId: string, year: number): Promise<LeaveBalance[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('leave_balances')
    .select('id, employee_id, year, leave_type_id, entitled, carried_over, used, planned')
    .eq('employee_id', employeeId)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).map(rowToBalance);
}

// ---------------------------------------------------------
// Rule context loader
// ---------------------------------------------------------

// Convenience: fetch everything the rules engine needs in parallel.
// `today` defaults to the system date in the caller's locale —
// callers in tests should pass an explicit value.
export interface LoadRuleContextOpts {
  today?: IsoDate;
  // Used to filter existingLeaves so we only load overlapping records.
  rangeStart?: IsoDate;
  rangeEnd?: IsoDate;
  // When set, the loader populates leaveBalances for this employee
  // for the current year. Used by the halfYearPlanning rule.
  forEmployeeId?: string;
}

export async function loadRuleContext(opts: LoadRuleContextOpts = {}): Promise<RuleContext> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const { listShifts } = await import('../../shifts/api/shiftApi');
  const [employees, roles, existingLeaves, coverageRules, blackouts, substitutes, shiftRows] = await Promise.all([
    listEmployees({ activeOnly: true }),
    listEmployeeRoles(),
    listLeaveRequests({
      status: ['pending', 'approved'],
      rangeStart: opts.rangeStart,
      rangeEnd: opts.rangeEnd,
    }),
    listCoverageRules({ activeOnly: true }),
    listBlackoutPeriods({ activeOnly: true }),
    listSubstitutes(),
    // Only the active statuses are relevant for the shiftOverlap rule.
    // If no range is supplied, fall back to "no shift filter" — the
    // rule is a no-op when shifts array is empty anyway.
    opts.rangeStart && opts.rangeEnd
      ? listShifts({
          rangeStart: opts.rangeStart,
          rangeEnd: opts.rangeEnd,
          status: ['assigned', 'swap_pending'],
        })
      : Promise.resolve([]),
  ]);
  // Static Fenstertage list — covers the year of `today` plus the next
  // year so requests crossing year-end still get evaluated.
  const { getFenstertageForRange } = await import('../lib/fenstertage');
  const startYear = Number(today.slice(0, 4));
  const fenstertage = getFenstertageForRange(startYear, startYear + 1);

  // Optionally load this employee's balance row(s) for the current
  // year — the halfYearPlanning rule needs entitlement to compute
  // the 50%-by-mid-year threshold.
  let leaveBalances: RuleContext['leaveBalances'];
  if (opts.forEmployeeId) {
    const rows = await listLeaveBalances(opts.forEmployeeId, startYear);
    leaveBalances = rows.map((r) => ({
      employeeId: r.employeeId,
      year: r.year,
      leaveTypeCode: r.leaveTypeCode,
      entitled: r.entitled,
      carriedOver: r.carriedOver,
    }));
  }

  return {
    today,
    employees,
    roles,
    existingLeaves,
    coverageRules,
    blackouts,
    fenstertage,
    leaveBalances,
    substitutes: substitutes.map((s) => ({
      employeeId: s.employeeId,
      substituteEmployeeId: s.substituteEmployeeId,
      priority: s.priority,
    })),
    shifts: shiftRows.map((s) => ({
      id: s.id,
      date: s.date,
      employeeId: s.employeeId,
      status: s.status,
    })),
  };
}
