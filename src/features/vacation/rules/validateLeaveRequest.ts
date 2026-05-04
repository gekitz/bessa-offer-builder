import type { LeaveRequest, RuleContext, RuleResult, RuleViolation } from '../types';
import { leadTime } from './leadTime';
import { hardBlock } from './hardBlock';
import { blackout } from './blackout';
import { coverageMin } from './coverageMin';
import { entitlement } from './entitlement';
import { fenstertage50pct } from './fenstertage50pct';

type Rule = (req: LeaveRequest, ctx: RuleContext) => RuleResult;

// Order matters only for readability of the violation list — every
// rule runs regardless. Cheap rules (no DB-data lookups) come first.
const ALL_RULES: Rule[] = [
  leadTime,
  entitlement,
  hardBlock,
  coverageMin,
  blackout,
  fenstertage50pct,
];

export function validateLeaveRequest(request: LeaveRequest, ctx: RuleContext): RuleResult {
  const violations: RuleViolation[] = [];
  const warnings: RuleViolation[] = [];
  for (const rule of ALL_RULES) {
    const result = rule(request, ctx);
    violations.push(...result.violations);
    warnings.push(...result.warnings);
  }
  return {
    ok: violations.length === 0,
    violations,
    warnings,
  };
}
