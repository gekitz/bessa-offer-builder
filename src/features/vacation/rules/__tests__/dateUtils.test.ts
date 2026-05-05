import { describe, it, expect } from 'vitest';
import { parseIsoDate, diffInDays, rangesOverlap } from '../dateUtils';

describe('parseIsoDate', () => {
  it('parses a YYYY-MM-DD as UTC midnight', () => {
    const d = parseIsoDate('2026-05-04');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(4);
    expect(d.getUTCHours()).toBe(0);
  });

  it('throws on a malformed input', () => {
    expect(() => parseIsoDate('nonsense')).toThrow();
    expect(() => parseIsoDate('2026/05/04')).toThrow();
  });
});

describe('diffInDays', () => {
  it('returns positive for end > start', () => {
    expect(diffInDays('2026-05-04', '2026-05-11')).toBe(7);
  });

  it('returns 0 for same day', () => {
    expect(diffInDays('2026-05-04', '2026-05-04')).toBe(0);
  });

  it('returns negative for end < start', () => {
    expect(diffInDays('2026-05-11', '2026-05-04')).toBe(-7);
  });

  it('handles month and year boundaries', () => {
    expect(diffInDays('2026-01-31', '2026-02-01')).toBe(1);
    expect(diffInDays('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('rangesOverlap', () => {
  it('detects overlapping ranges', () => {
    expect(rangesOverlap('2026-05-01', '2026-05-10', '2026-05-05', '2026-05-15')).toBe(true);
  });

  it('detects edge-touching ranges as overlapping (inclusive)', () => {
    expect(rangesOverlap('2026-05-01', '2026-05-10', '2026-05-10', '2026-05-15')).toBe(true);
  });

  it('returns false for disjoint ranges', () => {
    expect(rangesOverlap('2026-05-01', '2026-05-10', '2026-05-11', '2026-05-15')).toBe(false);
  });

  it('handles fully nested ranges', () => {
    expect(rangesOverlap('2026-05-01', '2026-05-31', '2026-05-15', '2026-05-20')).toBe(true);
  });
});
