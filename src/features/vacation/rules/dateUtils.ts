import type { IsoDate } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parse an ISO 'YYYY-MM-DD' as a UTC midnight Date. We deliberately
// avoid local-time interpretation: rule outcomes must be the same on
// every developer machine and on the server.
export function parseIsoDate(d: IsoDate): Date {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) throw new Error(`Invalid ISO date: ${d}`);
  return new Date(Date.UTC(y, m - 1, day));
}

export function diffInDays(start: IsoDate, end: IsoDate): number {
  return Math.round((parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / MS_PER_DAY);
}

// True when the two ranges share at least one day (inclusive on both ends).
export function rangesOverlap(
  aStart: IsoDate,
  aEnd: IsoDate,
  bStart: IsoDate,
  bEnd: IsoDate,
): boolean {
  return parseIsoDate(aStart) <= parseIsoDate(bEnd) && parseIsoDate(bStart) <= parseIsoDate(aEnd);
}
