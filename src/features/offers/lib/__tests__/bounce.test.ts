import { describe, it, expect } from 'vitest';
import { isActionableBounce } from '../bounce';

describe('isActionableBounce', () => {
  it('flags a bounce while the deal is still open (sent or new)', () => {
    expect(isActionableBounce({ status: 'bounced', stage: 'offer_sent' })).toBe(true);
    expect(isActionableBounce({ status: 'bounced', stage: 'new' })).toBe(true);
  });

  it('ignores a bounce once the deal is won or lost', () => {
    expect(isActionableBounce({ status: 'bounced', stage: 'closed' })).toBe(false);
    expect(isActionableBounce({ status: 'bounced', stage: 'lost' })).toBe(false);
  });

  it('ignores non-bounced offers regardless of stage', () => {
    expect(isActionableBounce({ status: 'delivered', stage: 'offer_sent' })).toBe(false);
    expect(isActionableBounce({ status: 'opened', stage: 'new' })).toBe(false);
    expect(isActionableBounce({ status: null, stage: null })).toBe(false);
  });
});
