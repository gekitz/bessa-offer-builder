import { describe, it, expect } from 'vitest';
import { offerActionReason, needsActionOffers, DRAFT_STALE_DAYS, SENT_STALE_DAYS } from '../needsAction';

const NOW = new Date('2026-08-31T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('offerActionReason', () => {
  it('flags a draft never sent, older than the threshold', () => {
    expect(offerActionReason({ id: '1', status: 'draft', created_at: daysAgo(DRAFT_STALE_DAYS + 1) }, NOW)).toBe('draft_unsent');
  });

  it('leaves a fresh draft alone', () => {
    expect(offerActionReason({ id: '1', status: 'draft', created_at: daysAgo(1) }, NOW)).toBeNull();
  });

  it('flags a sent offer with no activity past the threshold', () => {
    expect(offerActionReason({ id: '2', stage: 'offer_sent', status: 'sent', sent_at: daysAgo(SENT_STALE_DAYS + 1) }, NOW)).toBe('sent_no_action');
  });

  it('leaves a sent offer alone if it had recent activity', () => {
    expect(offerActionReason({ id: '2', stage: 'offer_sent', sent_at: daysAgo(30), last_activity_at: daysAgo(1) }, NOW)).toBeNull();
  });

  it('ignores closed/lost/accepted (not stage offer_sent, not draft)', () => {
    expect(offerActionReason({ id: '3', stage: 'closed', status: 'accepted', sent_at: daysAgo(60) }, NOW)).toBeNull();
    expect(offerActionReason({ id: '4', stage: 'lost', status: 'rejected', sent_at: daysAgo(60) }, NOW)).toBeNull();
  });

  it('ignores decided offers even if stage is still offer_sent', () => {
    // accepted/rejected/expired change status but not always the stage
    for (const status of ['accepted', 'rejected', 'expired']) {
      expect(offerActionReason({ id: 'x', stage: 'offer_sent', status, sent_at: daysAgo(60) }, NOW)).toBeNull();
    }
  });

  it('ignores a recently sent offer', () => {
    expect(offerActionReason({ id: '5', stage: 'offer_sent', sent_at: daysAgo(2) }, NOW)).toBeNull();
  });
});

describe('needsActionOffers', () => {
  const offers = [
    { id: 'a', status: 'draft', created_at: daysAgo(5), creator_id: 'anna' },
    { id: 'b', stage: 'offer_sent', sent_at: daysAgo(10), creator_id: 'bob' },
    { id: 'c', status: 'draft', created_at: daysAgo(1), creator_id: 'anna' }, // fresh
    { id: 'd', stage: 'offer_sent', sent_at: daysAgo(2), creator_id: 'anna' }, // fresh
  ];

  it('returns only stale offers', () => {
    expect(needsActionOffers(offers, { now: NOW }).map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('filters by creator', () => {
    expect(needsActionOffers(offers, { creatorId: 'anna', now: NOW }).map((o) => o.id)).toEqual(['a']);
    expect(needsActionOffers(offers, { creatorId: 'bob', now: NOW }).map((o) => o.id)).toEqual(['b']);
  });
});
