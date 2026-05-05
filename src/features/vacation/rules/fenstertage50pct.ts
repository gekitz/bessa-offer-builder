import type { LeaveRequest, RuleContext, RuleResult, RuleViolation } from '../types';
import { parseIsoDate } from './dateUtils';

// Per Konzept v4: on a Fenstertag (bridge day between a public holiday
// and a weekend) no more than 50% of a Standort+Abteilung group may be
// on leave at the same time. This is always a soft warning — approvers
// can override.
//
// "Group" = (employee.standortId, primary employee_role.abteilungId).
// Employees with no primary role can't be grouped, so the rule skips
// them. Single-person groups are exempt (50% of 1 ≈ "no leave at all"
// is silly for a sole specialist).
//
// Krankenstand is exempt — you don't choose to be sick on a bridge day.
export function fenstertage50pct(request: LeaveRequest, ctx: RuleContext): RuleResult {
  if (request.leaveTypeCode === 'krankenstand') {
    return { ok: true, violations: [], warnings: [] };
  }
  const fenstertage = ctx.fenstertage ?? [];
  if (fenstertage.length === 0) {
    return { ok: true, violations: [], warnings: [] };
  }

  const requester = ctx.employees.find((e) => e.id === request.employeeId);
  if (!requester) return { ok: true, violations: [], warnings: [] };

  const requesterPrimary = ctx.roles.find(
    (r) => r.employeeId === requester.id && r.kind === 'primary',
  );
  if (!requesterPrimary) return { ok: true, violations: [], warnings: [] };

  // Build the group: everyone with the same standort + primary
  // abteilung as the requester (active employees only). Excludes the
  // requester themselves from the count of OTHERS.
  const group = ctx.employees.filter((e) => {
    if (!e.active) return false;
    if (e.standortId !== requester.standortId) return false;
    const primary = ctx.roles.find((r) => r.employeeId === e.id && r.kind === 'primary');
    return primary?.abteilungId === requesterPrimary.abteilungId;
  });
  if (group.length < 2) return { ok: true, violations: [], warnings: [] };

  const groupIds = new Set(group.map((e) => e.id));

  const start = parseIsoDate(request.startDate);
  const end = parseIsoDate(request.endDate);

  const warnings: RuleViolation[] = [];
  const triggered: string[] = [];

  for (const day of fenstertage) {
    const d = parseIsoDate(day);
    if (d < start || d > end) continue;

    // Count group members on leave that exact day, including the
    // requester (their leave is +1 going on top).
    const othersOnLeave = ctx.existingLeaves.filter((other) => {
      if (other.id === request.id) return false;
      if (!groupIds.has(other.employeeId)) return false;
      if (other.status === 'rejected' || other.status === 'cancelled') return false;
      return parseIsoDate(other.startDate) <= d && parseIsoDate(other.endDate) >= d;
    });

    const total = othersOnLeave.length + 1;
    const max = Math.ceil(group.length * 0.5);
    if (total > max) {
      triggered.push(`${day} (${total}/${group.length})`);
    }
  }

  if (triggered.length > 0) {
    warnings.push({
      rule: 'fenstertage50pct',
      message:
        `Fenstertag(e) mit hoher Auslastung: ${triggered.join(', ')}. `
        + `Mehr als 50% der Abteilung wären gleichzeitig im Urlaub.`,
    });
  }

  return { ok: true, violations: [], warnings };
}
