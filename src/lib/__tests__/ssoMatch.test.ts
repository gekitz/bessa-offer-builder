import { describe, it, expect } from 'vitest';
import { findIdBySsoEmail } from '../ssoMatch';

const TEAM = [
  { id: 'gkitz',         email: 'g.kitz@kitz.co.at' },
  { id: 'hkitz',         email: 'h.kitz@kitz.co.at' },
  { id: 'hbauer',        email: 'h.bauer@kitz.co.at' },
  { id: 'dscharf',       email: 'd.scharf@kitz.co.at' },
  { id: 'thuber',        email: 't.huber@kitz.co.at' },
  { id: 'no-email',      email: null },
  { id: 'foreign-domain', email: 'georg@example.com' },
];

describe('findIdBySsoEmail', () => {
  it('returns null for empty/null/undefined input', () => {
    expect(findIdBySsoEmail('', TEAM)).toBeNull();
    expect(findIdBySsoEmail(null, TEAM)).toBeNull();
    expect(findIdBySsoEmail(undefined, TEAM)).toBeNull();
  });

  it('matches exact emails (case-insensitive)', () => {
    expect(findIdBySsoEmail('g.kitz@kitz.co.at', TEAM)).toBe('gkitz');
    expect(findIdBySsoEmail('G.KITZ@KITZ.CO.AT', TEAM)).toBe('gkitz');
    expect(findIdBySsoEmail('h.bauer@kitz.co.at', TEAM)).toBe('hbauer');
  });

  it('derives the SSO format <last_initial><first_initial>', () => {
    // g.kitz -> kg
    expect(findIdBySsoEmail('kg@kitz.co.at', TEAM)).toBe('gkitz');
    // h.kitz -> kh
    expect(findIdBySsoEmail('kh@kitz.co.at', TEAM)).toBe('hkitz');
    // h.bauer -> bh
    expect(findIdBySsoEmail('bh@kitz.co.at', TEAM)).toBe('hbauer');
    // d.scharf -> sd
    expect(findIdBySsoEmail('sd@kitz.co.at', TEAM)).toBe('dscharf');
    // t.huber -> ht
    expect(findIdBySsoEmail('ht@kitz.co.at', TEAM)).toBe('thuber');
  });

  it('returns null when neither exact nor SSO-format matches', () => {
    expect(findIdBySsoEmail('unknown@kitz.co.at', TEAM)).toBeNull();
    expect(findIdBySsoEmail('xx@kitz.co.at', TEAM)).toBeNull();
  });

  it('does not match candidates from a different domain', () => {
    // 'kg' is the SSO variant of g.kitz; try it against a different
    // domain — must not match.
    expect(findIdBySsoEmail('kg@example.com', TEAM)).toBeNull();
  });

  it('skips candidates whose email is null/missing', () => {
    // Just make sure null-email entries don't crash the heuristic.
    const result = findIdBySsoEmail('kg@kitz.co.at', TEAM);
    expect(result).toBe('gkitz');
  });

  it('handles malformed SSO input gracefully', () => {
    expect(findIdBySsoEmail('no-at-sign', TEAM)).toBeNull();
    expect(findIdBySsoEmail('@kitz.co.at', TEAM)).toBeNull();
  });

  it('skips candidates whose canonical email has no dot in the local part', () => {
    const team = [
      { id: 'noformat', email: 'gkitz@kitz.co.at' },     // no dot
      { id: 'emptyfirst', email: '.lastonly@kitz.co.at' }, // dot at index 0
    ];
    expect(findIdBySsoEmail('kg@kitz.co.at', team)).toBeNull();
  });
});
