// Pure bucketing logic for the Follow-Up Hub. Splits sent offers
// into action queues so the rep can see what to call today without
// scanning the whole list.
//
// Buckets (in priority order):
//   - overdue:    has next_followup_at and it's before now
//   - dueToday:   has next_followup_at and it's later today (local)
//   - stale:      sent >= STALE_AFTER_DAYS ago AND no logged activity
//
// Only offers in stage 'offer_sent' are considered — closed/lost
// don't need follow-ups, and 'new' (draft) hasn't been sent yet.

export interface OfferLike {
  id: string;
  stage?: string | null;
  sent_at?: string | null;
  last_activity_at?: string | null;
  next_followup_at?: string | null;
  total_period?: number | string | null;
  total_monthly?: number | string | null;
}

export interface FollowUpBuckets<T extends OfferLike> {
  overdue: T[];
  dueToday: T[];
  stale: T[];
}

export const STALE_AFTER_DAYS = 5;

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function dealValue(o: OfferLike): number {
  // Score by total_period when present (covers multi-month value),
  // otherwise fall back to monthly. Keeps highest-EV calls on top.
  const period = Number(o.total_period || 0);
  if (period > 0) return period;
  return Number(o.total_monthly || 0);
}

export function bucketize<T extends OfferLike>(
  offers: T[],
  now: Date = new Date(),
): FollowUpBuckets<T> {
  const overdue: T[] = [];
  const dueToday: T[] = [];
  const stale: T[] = [];
  const staleCutoff = now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

  for (const o of offers) {
    if (o.stage !== 'offer_sent') continue;

    if (o.next_followup_at) {
      const due = new Date(o.next_followup_at);
      if (due.getTime() < now.getTime()) {
        if (isSameLocalDay(due, now)) {
          // Earlier today: still actionable, treat as due today.
          dueToday.push(o);
        } else {
          overdue.push(o);
        }
      } else if (isSameLocalDay(due, now)) {
        dueToday.push(o);
      }
      continue;
    }

    // No follow-up scheduled → stale if sent long ago and no activity.
    if (!o.last_activity_at && o.sent_at) {
      const sent = new Date(o.sent_at).getTime();
      if (sent <= staleCutoff) stale.push(o);
    }
  }

  // Sort each bucket by deal value desc so cash-heavy offers float up.
  const byValue = (a: T, b: T) => dealValue(b) - dealValue(a);
  overdue.sort(byValue);
  dueToday.sort(byValue);
  stale.sort(byValue);

  return { overdue, dueToday, stale };
}
