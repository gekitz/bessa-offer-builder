import type { LeaveRequest, RuleContext, RuleResult } from '../types';
import { PASS } from '../types';
import { parseIsoDate, diffInDays } from './dateUtils';

// KITZ policy: you may not book a whole week minus the Friday. If an
// employee takes a full Monday–Thursday Urlaub block and still has
// enough balance to cover the Friday, the Friday must be taken too
// (no stranded single work day before the weekend).
//
// Hard rule (produces a violation) — approvers can still override on the
// form, like every other rule. Skipped when:
//   * the leave type is not Urlaub
//   * the block is not exactly a full Mon–Thu (half-days, wrong weekday,
//     or a longer/shorter span all pass)
//   * the Friday is itself a public holiday (not a lost work day)
//   * the employee lacks the balance to also take the Friday, i.e. the
//     whole Mon–Fri week (5 days) does not fit their remaining Urlaub
const MONDAY = 1;
const FULL_WEEK_DAYS = 5; // Mon–Fri; the block already costs 4 (Mon–Thu)

export function takeFridayToo(request: LeaveRequest, ctx: RuleContext): RuleResult {
  if (request.leaveTypeCode !== 'urlaub') return PASS;

  // Exactly a full Mon–Thu block: Monday start, Thursday end (start + 3),
  // no half-day on either boundary.
  if (request.halfDayStart || request.halfDayEnd) return PASS;
  if (parseIsoDate(request.startDate).getUTCDay() !== MONDAY) return PASS;
  if (diffInDays(request.startDate, request.endDate) !== 3) return PASS;

  const fridayIso = addDays(request.startDate, 4);

  // A Friday that is a public holiday is not stranded — everyone is off.
  if (ctx.holidays?.includes(fridayIso)) return PASS;

  // Only enforce when the employee can actually afford the Friday on top
  // of the Mon–Thu they're booking — i.e. the full week fits the balance.
  // Unknown balance (no requester context) → don't force.
  if (ctx.requesterRemaining == null) return PASS;
  if (ctx.requesterRemaining < FULL_WEEK_DAYS) return PASS;

  return {
    ok: false,
    violations: [
      {
        rule: 'takeFridayToo',
        message:
          `Bei einem Urlaub von Montag bis Donnerstag muss auch der Freitag `
          + `(${formatDe(fridayIso)}) genommen werden, solange genügend Urlaub übrig ist.`,
      },
    ],
    warnings: [],
  };
}

function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
