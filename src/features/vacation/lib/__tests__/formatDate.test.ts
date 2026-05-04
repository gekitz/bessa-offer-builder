import { describe, it, expect } from 'vitest';
import { formatGermanDate, formatRange } from '../formatDate';

describe('formatGermanDate', () => {
  it('formats ISO yyyy-mm-dd as DD.MM.YYYY', () => {
    expect(formatGermanDate('2026-08-10')).toBe('10.08.2026');
    expect(formatGermanDate('2026-01-01')).toBe('01.01.2026');
    expect(formatGermanDate('2025-12-31')).toBe('31.12.2025');
  });
});

describe('formatRange', () => {
  it('returns a single date when start === end', () => {
    expect(formatRange('2026-08-10', '2026-08-10')).toBe('10.08.2026');
  });

  it('returns "start – end" for multi-day ranges', () => {
    expect(formatRange('2026-08-10', '2026-08-15')).toBe('10.08.2026 – 15.08.2026');
  });

  it('appends half-day markers when set', () => {
    expect(formatRange('2026-08-10', '2026-08-15', true)).toBe('10.08.2026 – 15.08.2026 (½ Anfang)');
    expect(formatRange('2026-08-10', '2026-08-15', false, true)).toBe('10.08.2026 – 15.08.2026 (½ Ende)');
    expect(formatRange('2026-08-10', '2026-08-15', true, true)).toBe('10.08.2026 – 15.08.2026 (½ Anfang, ½ Ende)');
  });

  it('keeps single-date form even when half flags are set', () => {
    expect(formatRange('2026-08-10', '2026-08-10', true, false)).toBe('10.08.2026 (½ Anfang)');
  });
});
