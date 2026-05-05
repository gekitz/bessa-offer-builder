import type { LeaveRequest, RuleContext, RuleResult } from '../types';
import { diffInDays } from './dateUtils';

const URLAUB_LEAD_DAYS = 28; // 4 weeks per Konzept v4

// Vacation requests must be filed at least 4 weeks before the start
// date. Other leave types are exempt: Krankenstand and Pflege are
// reactive by nature; Schulung lead time is handled by the trainer
// scheduling the course; Sonderurlaub is case-by-case.
export function leadTime(request: LeaveRequest, ctx: RuleContext): RuleResult {
  if (request.leaveTypeCode !== 'urlaub') {
    return { ok: true, violations: [], warnings: [] };
  }
  const days = diffInDays(ctx.today, request.startDate);
  if (days < URLAUB_LEAD_DAYS) {
    return {
      ok: false,
      violations: [
        {
          rule: 'leadTime',
          message:
            `Urlaubsantrag muss mindestens ${URLAUB_LEAD_DAYS} Tage im Voraus eingereicht werden ` +
            `(aktuell ${days < 0 ? `${-days} Tage in der Vergangenheit` : `${days} Tage Vorlauf`}).`,
        },
      ],
      warnings: [],
    };
  }
  return { ok: true, violations: [], warnings: [] };
}
