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
  standortId: number;
  hireDate?: IsoDate;
  weeklyHours: number;
  employmentType: EmploymentType;
  active: boolean;
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
