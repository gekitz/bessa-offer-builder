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
    standortId: row.standort_id,
    hireDate: row.hire_date ?? undefined,
    weeklyHours: Number(row.weekly_hours),
    employmentType: row.employment_type,
    active: row.active,
  };
}

const EMPLOYEE_COLUMNS = 'id, code, name, standort_id, hire_date, weekly_hours, employment_type, active';

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
  const { data, error } = await sb
    .from('employees')
    .select('calendar_token')
    .eq('id', employeeId)
    .single();
  if (error) throw error;
  return (data as { calendar_token: string }).calendar_token;
}

// Rotate the employee's calendar token. Any existing calendar
// subscriptions set up against the old URL stop receiving updates.
export async function regenerateCalendarToken(employeeId: string): Promise<string> {
  const sb = requireSupabase();
  const fresh = crypto.randomUUID();
  const { data, error } = await sb
    .from('employees')
    .update({ calendar_token: fresh })
    .eq('id', employeeId)
    .select('calendar_token')
    .single();
  if (error) throw error;
  return (data as { calendar_token: string }).calendar_token;
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
  };
}

const LEAVE_REQUEST_COLUMNS =
  'id, employee_id, leave_type_id, start_date, end_date, half_day_start, half_day_end, status, reason, substitute_id, created_at, decided_at, decided_by, decision_note';

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

export async function createLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequest & { id: string }> {
  const sb = requireSupabase();
  const row = {
    employee_id: input.employeeId,
    leave_type_id: LEAVE_TYPE_ID_BY_CODE[input.leaveTypeCode],
    start_date: input.startDate,
    end_date: input.endDate,
    half_day_start: input.halfDayStart ?? false,
    half_day_end: input.halfDayEnd ?? false,
    reason: input.reason ?? null,
    substitute_id: input.substituteId ?? null,
    status: 'pending',
  };
  const { data, error } = await sb
    .from('leave_requests')
    .insert(row)
    .select(LEAVE_REQUEST_COLUMNS)
    .single();
  if (error) throw error;
  return rowToLeaveRequest(data);
}

export type UpdateLeaveRequestPatch = Partial<CreateLeaveRequestInput>;

// Update a leave request. Status / decided_* fields are not
// editable here — use decideLeaveRequest / cancelLeaveRequest for
// transitions. Caller is expected to scope this to status='pending'
// rows (a UI concern); the server permits any status to be patched.
export async function updateLeaveRequest(
  id: string,
  patch: UpdateLeaveRequestPatch,
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
  return rowToLeaveRequest(data);
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

  // Fire-and-forget notification. We deliberately do not await so an
  // email/Resend outage cannot rollback or fail the decision; the
  // approver already saw the row update succeed in their UI.
  void sb.functions.invoke('notify-leave-decision', { body: { leaveRequestId: id } })
    .catch((err) => {
      console.warn('notify-leave-decision invoke failed:', err);
    });

  return rowToLeaveRequest(data);
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
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
  const [employees, roles, existingLeaves, coverageRules, blackouts] = await Promise.all([
    listEmployees({ activeOnly: true }),
    listEmployeeRoles(),
    listLeaveRequests({
      status: ['pending', 'approved'],
      rangeStart: opts.rangeStart,
      rangeEnd: opts.rangeEnd,
    }),
    listCoverageRules({ activeOnly: true }),
    listBlackoutPeriods({ activeOnly: true }),
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
  };
}
