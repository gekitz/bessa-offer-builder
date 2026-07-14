// Vacation / Workforce domain types.
//
// These mirror the database schema in
// supabase/migrations/20260504120000_create_workforce.sql but use the
// app's preferred camelCase + ISO date string convention. Mapping
// to/from the supabase rows happens in the API layer (to come).

export type IsoDate = string; // 'YYYY-MM-DD'

export type LeaveTypeCode =
  | 'urlaub'
  | 'zeitausgleich'
  | 'krankenstand'
  | 'schule'
  | 'pflege'
  | 'schulung'
  | 'sonderurlaub';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type EmploymentType = 'fulltime' | 'parttime' | 'apprentice' | 'marginal';

export interface Employee {
  id: string;
  code: string;
  name: string;
  // Canonical / SSO email. Used to match the signed-in Microsoft user
  // to their employee row (see lib/ssoMatch). Optional so existing test
  // fixtures constructing Employee literals need no change.
  email?: string | null;
  standortId: number;
  hireDate?: IsoDate;
  weeklyHours: number;
  employmentType: EmploymentType;
  active: boolean;
  // Free-text tags ("techniker", "verkauf", ...) used by the dispatcher
  // view to filter the next-free-slot search. Optional in the type so
  // older test fixtures and call sites that construct Employee
  // literals do not need to be updated; rowToEmployee always sets it
  // to [] when the column is empty, so production reads see a stable
  // array.
  tags?: string[];
}

export interface EmployeeRole {
  id: string;
  employeeId: string;
  abteilungId: number;
  standortId: number;
  kind: 'primary' | 'secondary';
  supervisorEmployeeId?: string;
  qualifier?: string;
  validFrom?: IsoDate;
  validTo?: IsoDate;
}

export interface CoverageRule {
  id: string;
  name: string;
  scopeStandortId?: number;
  scopeAbteilungId?: number;
  appliesToEmployees?: string[];
  maxConcurrentOnLeave: number;
  kind: 'hard' | 'soft';
  active: boolean;
}

export interface BlackoutPeriod {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  appliesToStandortIds?: number[];
  appliesToAbteilungIds?: number[];
  severity: 'block' | 'warn';
  active: boolean;
}

export interface LeaveRequest {
  id?: string;
  employeeId: string;
  leaveTypeCode: LeaveTypeCode;
  startDate: IsoDate;
  endDate: IsoDate;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
  status?: LeaveStatus;
  reason?: string;
  substituteId?: string;
  // Populated by decideLeaveRequest. ISO timestamp of the decision.
  decidedAt?: string;
  // employees.id of the approver who decided.
  decidedBy?: string;
  // Optional note attached to the approve/reject decision.
  decisionNote?: string;
  // Storage object key for an uploaded Krankmeldung (doctor's note).
  // Format: `${leaveRequestId}/${filename}` inside the
  // 'leave-attachments' private bucket. null/undefined when no file
  // is attached (the common case for non-Krankenstand entries).
  attachmentPath?: string | null;
}

export interface RuleContext {
  // Frozen "today" — pass it explicitly so rule tests are deterministic.
  today: IsoDate;
  employees: Employee[];
  roles: EmployeeRole[];
  // approved + pending requests in the system that overlap with the
  // request's window. The caller is responsible for filtering — rules
  // assume any request in this list could conflict.
  existingLeaves: LeaveRequest[];
  coverageRules: CoverageRule[];
  blackouts: BlackoutPeriod[];
  // Bridge days between holidays and weekends (e.g. Fri after Christi
  // Himmelfahrt). Used by the fenstertage50pct rule to flag high-demand
  // dates. Empty/undefined disables the rule.
  fenstertage?: IsoDate[];
  // Per-employee leave balance rows (any year). Used by halfYearPlanning
  // to know each employee's entitlement. Optional — rule passes when
  // missing.
  leaveBalances?: { employeeId: string; year: number; leaveTypeCode: LeaveTypeCode; entitled: number; carriedOver: number }[];
  // Configured substitute mappings. Used by the substituteRequired
  // rule to know which employees should pick a substitute on Urlaub /
  // Zeitausgleich.
  substitutes?: { employeeId: string; substituteEmployeeId: string; priority: number }[];
  // Shifts (weekend / holiday duty) overlapping the request window.
  // Used by the shiftOverlap rule to block leave that conflicts with
  // an assigned shift. Empty/undefined disables the rule.
  shifts?: { id: string; date: IsoDate; employeeId: string | null; status: 'unassigned' | 'assigned' | 'swap_pending' | 'completed' | 'cancelled' }[];
}

export interface RuleViolation {
  rule: string;
  message: string;
}

export interface RuleResult {
  ok: boolean;
  violations: RuleViolation[];
  warnings: RuleViolation[];
}

export const PASS: RuleResult = { ok: true, violations: [], warnings: [] };
