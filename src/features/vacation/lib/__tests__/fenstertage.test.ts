import { describe, it, expect } from 'vitest';
import { getFenstertageForYear, getFenstertageForRange } from '../fenstertage';

describe('getFenstertageForYear', () => {
  it('returns the curated 2026 list', () => {
    const days = getFenstertageForYear(2026);
    expect(days).toContain('2026-05-15'); // Fri after Christi Himmelfahrt
    expect(days).toContain('2026-06-05'); // Fri after Fronleichnam
    expect(days.length).toBeGreaterThan(0);
  });

  it('returns an empty list for an unknown year', () => {
    expect(getFenstertageForYear(2099)).toEqual([]);
  });

  it('returns ISO date strings', () => {
    for (const day of getFenstertageForYear(2026)) {
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('getFenstertageForRange', () => {
  it('concatenates years inclusively', () => {
    const days = getFenstertageForRange(2026, 2027);
    const y2026 = getFenstertageForYear(2026);
    const y2027 = getFenstertageForYear(2027);
    expect(days).toEqual([...y2026, ...y2027]);
  });

  it('returns just one year when start === end', () => {
    expect(getFenstertageForRange(2026, 2026)).toEqual(getFenstertageForYear(2026));
  });
});
