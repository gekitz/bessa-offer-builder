import type { LeaveRequest, RuleContext, RuleResult, RuleViolation } from '../types';

// Block leave requests that overlap with an active shift assignment
// for the same employee. "Active" = status in ('assigned',
// 'swap_pending') — i.e. the employee is on the hook for that day,
// either because they hold the shift or because a pending swap might
// resolve back to them.
//
// Resolution path: the user must either (a) reduce the leave window
// so it no longer covers the shift days, or (b) swap the offending
// shift away first. Both are surfaced in the form's error UI.
export function shiftOverlap(request: LeaveRequest, ctx: RuleContext): RuleResult {
  const violations: RuleViolation[] = [];
  const shifts = ctx.shifts ?? [];
  if (shifts.length === 0) {
    return { ok: true, violations: [], warnings: [] };
  }

  const conflicts = shifts.filter((s) => {
    if (s.employeeId !== request.employeeId) return false;
    if (s.status !== 'assigned' && s.status !== 'swap_pending') return false;
    return s.date >= request.startDate && s.date <= request.endDate;
  });

  if (conflicts.length > 0) {
    const dates = conflicts.map((s) => s.date).join(', ');
    violations.push({
      rule: 'shiftOverlap',
      message:
        `Schichten an folgenden Tagen vorhanden: ${dates}. ` +
        `Bitte zuerst tauschen oder den Antragszeitraum anpassen.`,
    });
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings: [],
  };
}
