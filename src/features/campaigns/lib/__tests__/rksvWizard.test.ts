import { describe, it, expect } from 'vitest';
import { nextStep, parseVersion, versionOk, VERSION_THRESHOLD } from '../rksvWizard';
import type { RksvAnswers, RksvKnown } from '../rksvWizard';

const step = (known: RksvKnown, answers: RksvAnswers = {}) => nextStep(known, answers);

describe('nextStep — hardwareNeeded known-true', () => {
  it('asks setup_size when no setupSize answered', () => {
    expect(step({ hardwareNeeded: true })).toEqual({ kind: 'question', id: 'setup_size' });
  });
  it('goes to request_quote once setupSize is answered (einzelplatz)', () => {
    expect(step({ hardwareNeeded: true }, { setupSize: 'einzelplatz' }))
      .toEqual({ kind: 'terminal', id: 'request_quote' });
  });
  it('goes to request_quote once setupSize is answered (mehrplatz)', () => {
    expect(step({ hardwareNeeded: true }, { setupSize: 'mehrplatz' }))
      .toEqual({ kind: 'terminal', id: 'request_quote' });
  });
});

describe('nextStep — hardware unknown / false → Win10 branch', () => {
  it('asks has_win10 when hardware unknown and no answer', () => {
    expect(step({})).toEqual({ kind: 'question', id: 'has_win10' });
  });
  it('hasWin10=ja → authorize', () => {
    expect(step({}, { hasWin10: 'ja' })).toEqual({ kind: 'terminal', id: 'authorize' });
  });
  it('hasWin10=nein → setup_size, then request_quote', () => {
    expect(step({}, { hasWin10: 'nein' })).toEqual({ kind: 'question', id: 'setup_size' });
    expect(step({}, { hasWin10: 'nein', setupSize: 'einzelplatz' }))
      .toEqual({ kind: 'terminal', id: 'request_quote' });
    expect(step({}, { hasWin10: 'nein', setupSize: 'mehrplatz' }))
      .toEqual({ kind: 'terminal', id: 'request_quote' });
  });
  it('hasWin10=weiss_nicht → soft_check (first-class)', () => {
    expect(step({}, { hasWin10: 'weiss_nicht' })).toEqual({ kind: 'terminal', id: 'soft_check' });
  });
});

describe('nextStep — zero-question fast path', () => {
  it('hardwareNeeded=false AND versionOk=true → authorize with zero questions', () => {
    expect(step({ hardwareNeeded: false, versionOk: true }))
      .toEqual({ kind: 'terminal', id: 'authorize' });
  });
  it('hardwareNeeded=false + versionOk unknown → falls through to has_win10 (NOT authorize)', () => {
    expect(step({ hardwareNeeded: false })).toEqual({ kind: 'question', id: 'has_win10' });
  });
  it('hardwareNeeded=false + versionOk=false → has_win10 (do not over-trust default false)', () => {
    expect(step({ hardwareNeeded: false, versionOk: false }))
      .toEqual({ kind: 'question', id: 'has_win10' });
  });
  it('versionOk=true but hardwareNeeded unknown → still asks has_win10', () => {
    expect(step({ versionOk: true })).toEqual({ kind: 'question', id: 'has_win10' });
  });
  it('fast path does NOT fire once the user answered has_win10', () => {
    // Answering ja on the fast-path context still authorizes, but via the
    // Win10 branch — either way terminal authorize; the guard requires
    // !answers.hasWin10 so an explicit answer takes the normal path.
    expect(step({ hardwareNeeded: false, versionOk: true }, { hasWin10: 'nein' }))
      .toEqual({ kind: 'question', id: 'setup_size' });
  });
});

describe('nextStep — idempotent / monotonic', () => {
  it('re-calling with identical inputs returns the identical step', () => {
    const known: RksvKnown = { hardwareNeeded: true };
    const answers: RksvAnswers = { setupSize: 'mehrplatz' };
    expect(nextStep(known, answers)).toEqual(nextStep(known, answers));
  });
});

describe('parseVersion', () => {
  it('parses numeric-prefixed free text', () => {
    expect(parseVersion('67.24')).toBe(67.24);
    expect(parseVersion('67.25')).toBe(67.25);
    expect(parseVersion('66.00')).toBe(66);
    expect(parseVersion(' 67.19 ')).toBe(67.19);
  });
  it('returns null for null/undefined/junk', () => {
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(parseVersion('n/a')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('versionOk', () => {
  it('true at and above the threshold', () => {
    expect(versionOk('67.25')).toBe(true);
    expect(versionOk('68.00')).toBe(true);
    expect(VERSION_THRESHOLD).toBe(67.25);
  });
  it('false below the threshold', () => {
    expect(versionOk('67.24')).toBe(false);
    expect(versionOk('66.00')).toBe(false);
  });
  it('undefined (unknown) for null / junk', () => {
    expect(versionOk(null)).toBeUndefined();
    expect(versionOk('n/a')).toBeUndefined();
  });
});
