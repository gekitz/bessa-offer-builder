import { describe, it, expect } from 'vitest';
import { matchOffers, offerImpliesStatus, toSummary } from '../offerLink';

const OFFERS = [
  { id: 'o1', status: 'sent', customer_company: 'Wirt A', customer_email: 'a@wirt.at', mesonic_customer_id: '236000', total_once: 500, sent_at: 't', opened_at: null, created_at: 'c1' },
  { id: 'o2', status: 'draft', customer_company: 'Wirt B', customer_email: 'B@Wirt.at', mesonic_customer_id: null, created_at: 'c2' },
  { id: 'o3', status: 'draft', customer_company: 'Wer anders', customer_email: 'x@y.at', mesonic_customer_id: '999', created_at: 'c3' },
];

describe('matchOffers', () => {
  it('matches by Mesonic customer id', () => {
    const r = matchOffers(OFFERS, { mesonicKdnr: '236000', email: null });
    expect(r.map((o) => o.id)).toEqual(['o1']);
  });

  it('matches by email case-insensitively as a fallback', () => {
    const r = matchOffers(OFFERS, { mesonicKdnr: '', email: 'b@wirt.at' });
    expect(r.map((o) => o.id)).toEqual(['o2']);
  });

  it('returns nothing when neither key matches', () => {
    expect(matchOffers(OFFERS, { mesonicKdnr: '111', email: 'none@none.at' })).toEqual([]);
  });
});

describe('offerImpliesStatus', () => {
  it('maps out-the-door offer states to mailed', () => {
    for (const s of ['sent', 'delivered', 'opened', 'accepted']) {
      expect(offerImpliesStatus(s)).toBe('mailed');
    }
  });
  it('maps draft/other to offer_created', () => {
    expect(offerImpliesStatus('draft')).toBe('offer_created');
    expect(offerImpliesStatus('rejected')).toBe('offer_created');
  });
});

describe('toSummary', () => {
  it('coerces numeric totals and stringifies the mesonic id', () => {
    const s = toSummary(OFFERS[0]);
    expect(s).toMatchObject({ id: 'o1', status: 'sent', totalOnce: 500, mesonicCustomerId: '236000' });
    expect(typeof s.mesonicCustomerId).toBe('string');
  });
});
