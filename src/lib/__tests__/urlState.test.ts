import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeOffer,
  decodeOffer,
  updateURL,
  getOfferFromURL,
  generateShareableURL,
} from '../urlState';

const sampleOffer = {
  cart: { 'kassa-pro': { qty: 2, discountQty: 0, tier: '12mo', mode: 'kauf' } },
  customer: { name: 'Max Müller', company: 'Beispiel GmbH', email: 'max@example.at', phone: '+43 1 1234' },
  creator: 'gk',
  globalTier: '12mo',
  notes: 'Sonderkonditionen für Stammkunden — bis 2026-06-30',
};

beforeEach(() => {
  window.history.replaceState({}, '', 'https://app.kitz.example/');
});

describe('encodeOffer / decodeOffer', () => {
  it('round-trips an arbitrary state object', () => {
    const encoded = encodeOffer(sampleOffer);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('"');
    expect(decodeOffer(encoded)).toEqual(sampleOffer);
  });

  it('handles unicode/umlauts safely', () => {
    const state = { note: 'Käse ✓ — naïve façade 中文' };
    expect(decodeOffer(encodeOffer(state))).toEqual(state);
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(decodeOffer('this-is-not-base64!!!')).toBeNull();
    expect(decodeOffer('')).toBeNull();
    expect(decodeOffer(btoa('not valid json'))).toBeNull();
  });
});

describe('updateURL', () => {
  it('writes the encoded state to the offer query param without reloading', () => {
    updateURL(sampleOffer);
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('offer');
    expect(encoded).toBeTruthy();
    expect(decodeOffer(encoded!)).toEqual(sampleOffer);
  });

  it('preserves the rest of the URL (origin, path, other params)', () => {
    window.history.replaceState({}, '', 'https://app.kitz.example/builder?tab=angebot');
    updateURL(sampleOffer);
    expect(window.location.origin).toBe('https://app.kitz.example');
    expect(window.location.pathname).toBe('/builder');
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('angebot');
  });
});

describe('getOfferFromURL', () => {
  it('returns null when no offer param is present', () => {
    expect(getOfferFromURL()).toBeNull();
  });

  it('returns the decoded state when offer param is present', () => {
    updateURL(sampleOffer);
    expect(getOfferFromURL()).toEqual(sampleOffer);
  });

  it('returns null when offer param is malformed', () => {
    window.history.replaceState({}, '', 'https://app.kitz.example/?offer=garbage!!!');
    expect(getOfferFromURL()).toBeNull();
  });
});

describe('generateShareableURL', () => {
  it('produces a URL containing the encoded offer', () => {
    const url = generateShareableURL(sampleOffer);
    const parsed = new URL(url);
    const encoded = parsed.searchParams.get('offer');
    expect(encoded).toBeTruthy();
    expect(decodeOffer(encoded!)).toEqual(sampleOffer);
  });

  it('does not mutate window.location', () => {
    const before = window.location.href;
    generateShareableURL(sampleOffer);
    expect(window.location.href).toBe(before);
  });
});
