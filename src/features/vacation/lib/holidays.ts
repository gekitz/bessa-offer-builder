// Austrian national public holidays (Feiertage), curated per year like
// the Fenstertage list — extend each November for the next year.
//
// Used by the takeFridayToo rule to decide whether a "stranded" Friday
// is actually a lost work day: a Friday that is itself a public holiday
// must not be forced into the leave request.

import type { IsoDate } from '../types';

const HOLIDAYS_BY_YEAR: Record<number, IsoDate[]> = {
  2026: [
    '2026-01-01', // Neujahr
    '2026-01-06', // Heilige Drei Könige
    '2026-04-06', // Ostermontag
    '2026-05-01', // Staatsfeiertag
    '2026-05-14', // Christi Himmelfahrt
    '2026-05-25', // Pfingstmontag
    '2026-06-04', // Fronleichnam
    '2026-08-15', // Mariä Himmelfahrt
    '2026-10-26', // Nationalfeiertag
    '2026-11-01', // Allerheiligen
    '2026-12-08', // Mariä Empfängnis
    '2026-12-25', // Christtag
    '2026-12-26', // Stefanitag
  ],
  2027: [
    '2027-01-01', // Neujahr
    '2027-01-06', // Heilige Drei Könige
    '2027-03-29', // Ostermontag
    '2027-05-01', // Staatsfeiertag
    '2027-05-06', // Christi Himmelfahrt
    '2027-05-17', // Pfingstmontag
    '2027-05-27', // Fronleichnam
    '2027-08-15', // Mariä Himmelfahrt
    '2027-10-26', // Nationalfeiertag
    '2027-11-01', // Allerheiligen
    '2027-12-08', // Mariä Empfängnis
    '2027-12-25', // Christtag
    '2027-12-26', // Stefanitag
  ],
};

export function getPublicHolidaysForYear(year: number): IsoDate[] {
  return HOLIDAYS_BY_YEAR[year] ?? [];
}

// Current + next year, matching the Fenstertage loader — so a request
// crossing the year boundary still resolves its Friday correctly.
export function getPublicHolidaysForRange(startYear: number, endYear: number): IsoDate[] {
  const out: IsoDate[] = [];
  for (let y = startYear; y <= endYear; y += 1) out.push(...getPublicHolidaysForYear(y));
  return out;
}
