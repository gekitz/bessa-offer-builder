import type { LeaveRequest, RuleContext, RuleResult } from '../types';
import { countWorkingDays } from '../lib/balance';

// Per Konzept v4: by mid-year (June 30) at least 50% of an employee's
// yearly Urlaub entitlement should be planned (i.e. submitted as
// approved or pending). This rule fires from April 1 onwards — before
// that, planning is open and a warning would just be noise.
//
// It only ever produces a warning, never a violation. The warning
// reads as a reminder, not a block.
//
// Skipped when:
//   * leave type is not Urlaub
//   * the requester has no balance row for the request's year (HR
//     hasn't seeded entitlement yet — nothing to compare against)
//   * today is before April 1 of the request's year
export function halfYearPlanning(request: LeaveRequest, ctx: RuleContext): RuleResult {
  if (request.leaveTypeCode !== 'urlaub') {
    return { ok: true, violations: [], warnings: [] };
  }

  const year = Number(request.startDate.slice(0, 4));
  if (!Number.isFinite(year)) return { ok: true, violations: [], warnings: [] };

  const balance = ctx.leaveBalances?.find(
    (b) => b.employeeId === request.employeeId && b.year === year && b.leaveTypeCode === 'urlaub',
  );
  if (!balance) return { ok: true, violations: [], warnings: [] };

  const totalEntitled = balance.entitled + balance.carriedOver;
  if (totalEntitled <= 0) return { ok: true, violations: [], warnings: [] };

  // Suppress the nag in Q1 — most people start booking around Easter.
  const graceCutoff = `${year}-04-01`;
  if (ctx.today < graceCutoff) return { ok: true, violations: [], warnings: [] };

  // Build the set of H1 leaves: existing approved/pending requests
  // (excluding the one being edited) plus the new request.
  const h1Days = sumH1WorkingDays(
    [
      ...ctx.existingLeaves.filter((l) => {
        if (l.id === request.id) return false;
        if (l.employeeId !== request.employeeId) return false;
        if (l.leaveTypeCode !== 'urlaub') return false;
        if (l.status === 'rejected' || l.status === 'cancelled') return false;
        return true;
      }),
      request,
    ],
    year,
  );

  const required = totalEntitled * 0.5;
  if (h1Days >= required) {
    return { ok: true, violations: [], warnings: [] };
  }

  return {
    ok: true,
    violations: [],
    warnings: [
      {
        rule: 'halfYearPlanning',
        message:
          `Bis Jahresmitte sollten 50% des Urlaubs (${formatDays(required)} von ${formatDays(totalEntitled)} Tagen) geplant sein. `
          + `Aktuell geplant: ${formatDays(h1Days)} Tage.`,
      },
    ],
  };
}

function sumH1WorkingDays(leaves: LeaveRequest[], year: number): number {
  const h1Start = `${year}-01-01`;
  const h1End = `${year}-06-30`;
  let total = 0;
  for (const leave of leaves) {
    total += workingDaysInRange(leave, h1Start, h1End);
  }
  return total;
}

function workingDaysInRange(leave: LeaveRequest, clipStart: string, clipEnd: string): number {
  if (leave.endDate < clipStart || leave.startDate > clipEnd) return 0;
  const start = leave.startDate < clipStart ? clipStart : leave.startDate;
  const end = leave.endDate > clipEnd ? clipEnd : leave.endDate;
  // Half-day flags only count when the original boundary survives the clip.
  const halfDayStart = (leave.halfDayStart ?? false) && leave.startDate === start;
  const halfDayEnd = (leave.halfDayEnd ?? false) && leave.endDate === end;
  return countWorkingDays(start, end, halfDayStart, halfDayEnd);
}

function formatDays(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
