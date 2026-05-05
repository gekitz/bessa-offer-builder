import type { LeaveRequest, RuleContext, RuleResult, RuleViolation } from '../types';
import { rangesOverlap } from './dateUtils';

// Coverage rules with kind='hard' that have an explicit
// applies_to_employees scope. Implements the global Stefan ↔ Mario
// MFP block: at most one of them on leave at any time.
//
// Generic per-Abteilung / per-Standort coverage minimums (also stored
// in coverage_rules) are handled separately by the coverageMin rule
// — this function deliberately only looks at applies_to_employees.
export function hardBlock(request: LeaveRequest, ctx: RuleContext): RuleResult {
  const violations: RuleViolation[] = [];

  for (const rule of ctx.coverageRules) {
    if (!rule.active) continue;
    if (rule.kind !== 'hard') continue;
    if (!rule.appliesToEmployees || rule.appliesToEmployees.length === 0) continue;

    // Rule only applies to requests from the listed employees.
    if (!rule.appliesToEmployees.includes(request.employeeId)) continue;

    const otherScopedIds = rule.appliesToEmployees.filter((id) => id !== request.employeeId);
    if (otherScopedIds.length === 0) continue;

    const conflicting = ctx.existingLeaves.filter((other) => {
      if (other.id === request.id) return false; // editing this same request
      if (other.status === 'rejected' || other.status === 'cancelled') return false;
      if (!otherScopedIds.includes(other.employeeId)) return false;
      return rangesOverlap(request.startDate, request.endDate, other.startDate, other.endDate);
    });

    // max_concurrent_on_leave counts the entire scope, including the
    // requester. We treat the requester as "+1 going on leave" — so
    // if max=1 and any other scoped employee already overlaps, block.
    if (conflicting.length + 1 > rule.maxConcurrentOnLeave) {
      const conflictNames = conflicting
        .map((c) => ctx.employees.find((e) => e.id === c.employeeId)?.name ?? c.employeeId)
        .join(', ');
      violations.push({
        rule: 'hardBlock',
        message:
          `${rule.name}: Überschneidung mit ${conflictNames} ` +
          `(max ${rule.maxConcurrentOnLeave} gleichzeitig).`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings: [],
  };
}
