import { describe, it, expect } from 'vitest';
import {
  TIERS,
  TIER_MONTHS,
  TIER_LABEL,
  TIER_SHORT,
  TIER_LABEL_OFFER,
  TKEY,
  TKEY_REV,
  type TierKey,
} from '../tiers';

const ALL_TIERS: TierKey[] = ['12mo', '6mo', '2mo', 'event'];

describe('TIERS', () => {
  it('lists every tier in display order', () => {
    expect([...TIERS]).toEqual(ALL_TIERS);
  });
});

describe('TIER_MONTHS', () => {
  it('maps each tier to its billing duration in months', () => {
    expect(TIER_MONTHS).toEqual({ '12mo': 12, '6mo': 6, '2mo': 2, event: 1 });
  });

  it.each(ALL_TIERS)('has a numeric value for %s', (tier) => {
    expect(typeof TIER_MONTHS[tier]).toBe('number');
    expect(TIER_MONTHS[tier]).toBeGreaterThan(0);
  });
});

describe('TIER_LABEL / TIER_SHORT / TIER_LABEL_OFFER', () => {
  it.each([
    ['TIER_LABEL', TIER_LABEL],
    ['TIER_SHORT', TIER_SHORT],
    ['TIER_LABEL_OFFER', TIER_LABEL_OFFER],
  ])('%s has a non-empty German string for every tier', (_name, map) => {
    for (const tier of ALL_TIERS) {
      expect(map[tier]).toBeTruthy();
      expect(typeof map[tier]).toBe('string');
    }
  });
});

describe('TKEY / TKEY_REV', () => {
  it('round-trips between PriceKey and TierKey', () => {
    for (const tier of ALL_TIERS) {
      expect(TKEY[TKEY_REV[tier]]).toBe(tier);
    }
  });

  it('TKEY maps the legacy y/s/m/e codes to the public tier keys', () => {
    expect(TKEY).toEqual({ y: '12mo', s: '6mo', m: '2mo', e: 'event' });
  });
});
