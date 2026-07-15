import { describe, it, expect } from 'vitest';
import { offerIdFromDeepLink } from '../offerDeepLink';

const UUID = '1d4ca0ea-a478-467b-9157-29ce0a9f66f7';

describe('offerIdFromDeepLink', () => {
  it('returns the id for a bare ?offer=<uuid> deep link', () => {
    expect(offerIdFromDeepLink(`?offer=${UUID}`)).toBe(UUID);
  });

  it('accepts a URLSearchParams as well as a string', () => {
    expect(offerIdFromDeepLink(new URLSearchParams({ offer: UUID }))).toBe(UUID);
  });

  it('ignores the legacy base64-encoded ?offer= blob', () => {
    // btoa(encodeURIComponent(JSON.stringify({cart:{}}))) style blob — not a UUID.
    const blob = 'JTdCJTIyY2FydCUyMiUzQSU3QiU3RCU3RA==';
    expect(offerIdFromDeepLink(`?offer=${blob}`)).toBeNull();
  });

  it('defers to the action flow when ?action= owns the offer id', () => {
    expect(offerIdFromDeepLink(`?action=send-followup&offer=${UUID}`)).toBeNull();
  });

  it('returns null when there is no offer param', () => {
    expect(offerIdFromDeepLink('?tab=angebot')).toBeNull();
    expect(offerIdFromDeepLink('')).toBeNull();
  });

  it('rejects a malformed uuid', () => {
    expect(offerIdFromDeepLink('?offer=not-a-uuid')).toBeNull();
    expect(offerIdFromDeepLink('?offer=1d4ca0ea')).toBeNull();
  });
});
