import { describe, expect, it } from 'vitest';
import { bucketize, STALE_AFTER_DAYS } from '../followUpBuckets';

const NOW = new Date('2026-05-05T14:00:00+02:00');
const MS = 24 * 60 * 60 * 1000;

function offer(partial: Partial<Parameters<typeof bucketize>[0][number]> & { id: string }) {
  return {
    stage: 'offer_sent',
    sent_at: null,
    last_activity_at: null,
    next_followup_at: null,
    total_period: 0,
    total_monthly: 0,
    ...partial,
  };
}

describe('bucketize', () => {
  it('returns empty buckets when there are no offers', () => {
    expect(bucketize([], NOW)).toEqual({ overdue: [], dueToday: [], stale: [] });
  });

  it('only considers offers in stage offer_sent', () => {
    const offers = [
      offer({ id: 'a', stage: 'new', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'b', stage: 'closed', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
      offer({ id: 'c', stage: 'lost', next_followup_at: new Date(NOW.getTime() - MS).toISOString() }),
    ];
    const r = bucketize(offers, NOW);
    expect(r.overdue).toHaveLength(0);
    expect(r.dueToday).toHaveLength(0);
    expect(r.stale).toHaveLength(0);
  });

  it('classifies a yesterday follow-up as overdue', () => {
    const o = offer({ id: 'a', next_followup_at: new Date(NOW.getTime() - MS).toISOString() });
    const r = bucketize([o], NOW);
    expect(r.overdue.map(x => x.id)).toEqual(['a']);
    expect(r.dueToday).toEqual([]);
  });

  it('classifies an earlier-today follow-up as due today (still actionable)', () => {
    // 09:00 same day, NOW is 14:00 → past but same calendar day.
    const earlier = new Date('2026-05-05T09:00:00+02:00').toISOString();
    const o = offer({ id: 'a', next_followup_at: earlier });
    const r = bucketize([o], NOW);
    expect(r.dueToday.map(x => x.id)).toEqual(['a']);
    expect(r.overdue).toEqual([]);
  });

  it('classifies a later-today follow-up as due today', () => {
    const later = new Date('2026-05-05T17:00:00+02:00').toISOString();
    const o = offer({ id: 'a', next_followup_at: later });
    const r = bucketize([o], NOW);
    expect(r.dueToday.map(x => x.id)).toEqual(['a']);
  });

  it('ignores future follow-ups (tomorrow is not in any bucket)', () => {
    const tomorrow = new Date(NOW.getTime() + MS).toISOString();
    const o = offer({ id: 'a', next_followup_at: tomorrow });
    const r = bucketize([o], NOW);
    expect(r.overdue).toEqual([]);
    expect(r.dueToday).toEqual([]);
    expect(r.stale).toEqual([]);
  });

  it('classifies as stale when sent old enough and no activity, no follow-up', () => {
    const sent = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 1) * MS).toISOString();
    const o = offer({ id: 'a', sent_at: sent });
    expect(bucketize([o], NOW).stale.map(x => x.id)).toEqual(['a']);
  });

  it('does not mark as stale if there is already a logged activity', () => {
    const sent = new Date(NOW.getTime() - 10 * MS).toISOString();
    const last = new Date(NOW.getTime() - MS).toISOString();
    const o = offer({ id: 'a', sent_at: sent, last_activity_at: last });
    expect(bucketize([o], NOW).stale).toEqual([]);
  });

  it('does not mark as stale if a follow-up is scheduled (overdue or future)', () => {
    const sent = new Date(NOW.getTime() - 10 * MS).toISOString();
    const overdue = new Date(NOW.getTime() - 2 * MS).toISOString();
    const o = offer({ id: 'a', sent_at: sent, next_followup_at: overdue });
    const r = bucketize([o], NOW);
    expect(r.stale).toEqual([]);
    expect(r.overdue.map(x => x.id)).toEqual(['a']);
  });

  it('sorts each bucket by deal value (total_period preferred) descending', () => {
    const overdueAt = new Date(NOW.getTime() - MS).toISOString();
    const offers = [
      offer({ id: 'low',  next_followup_at: overdueAt, total_period: 1000 }),
      offer({ id: 'high', next_followup_at: overdueAt, total_period: 9000 }),
      offer({ id: 'mid',  next_followup_at: overdueAt, total_period: 3000 }),
    ];
    expect(bucketize(offers, NOW).overdue.map(o => o.id)).toEqual(['high', 'mid', 'low']);
  });

  it('falls back to total_monthly for value sort when total_period is missing', () => {
    const overdueAt = new Date(NOW.getTime() - MS).toISOString();
    const offers = [
      offer({ id: 'low',  next_followup_at: overdueAt, total_monthly: 30 }),
      offer({ id: 'high', next_followup_at: overdueAt, total_monthly: 300 }),
    ];
    expect(bucketize(offers, NOW).overdue.map(o => o.id)).toEqual(['high', 'low']);
  });

  it('respects STALE_AFTER_DAYS boundary (exactly the threshold counts as stale)', () => {
    const exactly = new Date(NOW.getTime() - STALE_AFTER_DAYS * MS).toISOString();
    const justUnder = new Date(NOW.getTime() - (STALE_AFTER_DAYS - 1) * MS - 1000).toISOString();
    const offers = [
      offer({ id: 'old', sent_at: exactly }),
      offer({ id: 'fresh', sent_at: justUnder }),
    ];
    expect(bucketize(offers, NOW).stale.map(o => o.id)).toEqual(['old']);
  });
});
