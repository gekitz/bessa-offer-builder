import type { LeaveRequest, RuleContext, RuleResult } from '../types';
import { diffInDays, parseIsoDate } from './dateUtils';

// Per Konzept v4: vacation entitlement is only earned starting the
// 7th employment month (i.e. the first 6 months of employment cannot
// be drawn down as Urlaub). Other leave types are unaffected.
//
// We treat the threshold as "request start date >= hire_date + 6
// calendar months". An employee without a hire_date in the system
// passes (the rule cannot evaluate, so it does not block — admin's
// problem to fill in the date).
export function entitlement(request: LeaveRequest, ctx: RuleContext): RuleResult {
  if (request.leaveTypeCode !== 'urlaub') {
    return { ok: true, violations: [], warnings: [] };
  }

  const employee = ctx.employees.find((e) => e.id === request.employeeId);
  if (!employee || !employee.hireDate) {
    return { ok: true, violations: [], warnings: [] };
  }

  const hire = parseIsoDate(employee.hireDate);
  const eligibleFrom = new Date(hire.getTime());
  eligibleFrom.setUTCMonth(eligibleFrom.getUTCMonth() + 6);

  const eligibleFromIso = formatIso(eligibleFrom);
  if (diffInDays(eligibleFromIso, request.startDate) < 0) {
    return {
      ok: false,
      violations: [
        {
          rule: 'entitlement',
          message:
            `Urlaubsanspruch beginnt erst ab ${eligibleFromIso} ` +
            `(6 Monate nach Eintrittsdatum ${employee.hireDate}).`,
        },
      ],
      warnings: [],
    };
  }
  return { ok: true, violations: [], warnings: [] };
}

function formatIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
