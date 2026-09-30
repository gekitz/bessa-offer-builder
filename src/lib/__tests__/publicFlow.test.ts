import { describe, it, expect } from 'vitest';

import { isPublicFlow, PUBLIC_FLOW_PARAMS } from '../publicFlow';

const sp = (qs: string) => new URLSearchParams(qs);

describe('isPublicFlow', () => {
  it('treats each customer-facing param as public (bypasses the SSO wall)', () => {
    expect(isPublicFlow(sp('a=SHARE'))).toBe(true);   // offer accept
    expect(isPublicFlow(sp('t=SHARE'))).toBe(true);   // ticket portal
    expect(isPublicFlow(sp('c=TOKEN'))).toBe(true);   // campaign landing — the regression this guards
  });

  it('is false for the authenticated app (no public param)', () => {
    expect(isPublicFlow(sp(''))).toBe(false);
    expect(isPublicFlow(sp('section=angebote'))).toBe(false);
    expect(isPublicFlow(sp('foo=c'))).toBe(false); // value 'c', not param 'c'
  });

  it('is true when a public param is mixed with others', () => {
    expect(isPublicFlow(sp('c=TOKEN&utm_source=mail'))).toBe(true);
  });

  it('PUBLIC_FLOW_PARAMS is the documented set', () => {
    expect([...PUBLIC_FLOW_PARAMS]).toEqual(['a', 't', 'c']);
  });
});
