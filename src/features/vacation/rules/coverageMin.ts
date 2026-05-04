import type {
  CoverageRule,
  Employee,
  EmployeeRole,
  LeaveRequest,
  RuleContext,
  RuleResult,
  RuleViolation,
} from '../types';
import { rangesOverlap } from './dateUtils';

// Per-Standort and per-Abteilung capacity rules. Rules with an
// applies_to_employees scope are handled by the hardBlock rule
// — this function deliberately ignores those.
//
// kind='hard' violations block the request; kind='soft' becomes a
// warning. The count includes the requester (their leave is
// the +1 going on top of any existing overlapping leaves).
//
// We treat existingLeaves with status='rejected'|'cancelled' as
// not present.
export function coverageMin(request: LeaveRequest, ctx: RuleContext): RuleResult {
  const requester = ctx.employees.find((e) => e.id === request.employeeId);
  if (!requester) return { ok: true, violations: [], warnings: [] };

  const requesterAbteilungIds = ctx.roles
    .filter((r) => r.employeeId === requester.id)
    .map((r) => r.abteilungId);

  const violations: RuleViolation[] = [];
  const warnings: RuleViolation[] = [];

  for (const rule of ctx.coverageRules) {
    if (!rule.active) continue;
    if (rule.appliesToEmployees && rule.appliesToEmployees.length > 0) continue;
    if (!ruleAppliesTo(rule, requester, requesterAbteilungIds)) continue;

    const overlappers = ctx.existingLeaves.filter((other) => {
      if (other.id === request.id) return false;
      if (other.status === 'rejected' || other.status === 'cancelled') return false;
      const otherEmp = ctx.employees.find((e) => e.id === other.employeeId);
      if (!otherEmp) return false;
      const otherAbteilungIds = ctx.roles
        .filter((r) => r.employeeId === otherEmp.id)
        .map((r) => r.abteilungId);
      if (!ruleAppliesTo(rule, otherEmp, otherAbteilungIds)) return false;
      return rangesOverlap(request.startDate, request.endDate, other.startDate, other.endDate);
    });

    if (overlappers.length + 1 > rule.maxConcurrentOnLeave) {
      const conflictNames = overlappers
        .map((o) => ctx.employees.find((e) => e.id === o.employeeId)?.name ?? o.employeeId)
        .join(', ');
      const entry: RuleViolation = {
        rule: 'coverageMin',
        message:
          `${rule.name}: ${overlappers.length + 1} gleichzeitig im Urlaub ` +
          `(max ${rule.maxConcurrentOnLeave}). Überschneidung mit ${conflictNames}.`,
      };
      if (rule.kind === 'hard') violations.push(entry);
      else warnings.push(entry);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings,
  };
}

function ruleAppliesTo(rule: CoverageRule, employee: Employee, abteilungIds: number[]): boolean {
  if (rule.scopeStandortId !== undefined && rule.scopeStandortId !== employee.standortId) {
    return false;
  }
  if (rule.scopeAbteilungId !== undefined && !abteilungIds.includes(rule.scopeAbteilungId)) {
    return false;
  }
  return true;
}
