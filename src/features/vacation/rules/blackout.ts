import type { LeaveRequest, RuleContext, RuleResult, RuleViolation } from '../types';
import { rangesOverlap } from './dateUtils';

// Apply blackout periods (e.g. Wörthersee Apr-end → June for
// Klagenfurt, Skigebiete mid-Nov → mid-Dec).
//
// Scoping:
//   * appliesToStandortIds   — empty/undefined = all Standorte
//   * appliesToAbteilungIds  — empty/undefined = all Abteilungen
//
// severity='block' becomes a violation; 'warn' becomes a warning.
//
// Krankenstand is exempt from blackouts (you don't choose to be sick).
export function blackout(request: LeaveRequest, ctx: RuleContext): RuleResult {
  if (request.leaveTypeCode === 'krankenstand') {
    return { ok: true, violations: [], warnings: [] };
  }

  const employee = ctx.employees.find((e) => e.id === request.employeeId);
  if (!employee) return { ok: true, violations: [], warnings: [] };

  const employeeAbteilungIds = ctx.roles
    .filter((r) => r.employeeId === employee.id)
    .map((r) => r.abteilungId);

  const violations: RuleViolation[] = [];
  const warnings: RuleViolation[] = [];

  for (const period of ctx.blackouts) {
    if (!period.active) continue;
    if (!rangesOverlap(request.startDate, request.endDate, period.startDate, period.endDate)) continue;

    const standortMatches =
      !period.appliesToStandortIds
      || period.appliesToStandortIds.length === 0
      || period.appliesToStandortIds.includes(employee.standortId);
    if (!standortMatches) continue;

    const abteilungMatches =
      !period.appliesToAbteilungIds
      || period.appliesToAbteilungIds.length === 0
      || employeeAbteilungIds.some((id) => period.appliesToAbteilungIds!.includes(id));
    if (!abteilungMatches) continue;

    const entry = {
      rule: 'blackout',
      message: `Sperrzeitraum „${period.name}" (${period.startDate} – ${period.endDate}).`,
    };
    if (period.severity === 'block') violations.push(entry);
    else warnings.push(entry);
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings,
  };
}
