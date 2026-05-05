// Static list of Austrian "Fenstertage" — bridge days between a public
// holiday and a weekend. On these days, demand is very high so the
// fenstertage50pct rule warns when more than half of a Standort+
// Abteilung group is on leave.
//
// The list is per-year and curated by hand. Computing it from
// Easter-relative holidays is possible but adds complexity for marginal
// benefit (only ~5 dates per year). Update this list each November
// for the next year.

import type { IsoDate } from '../types';

const FENSTERTAGE_BY_YEAR: Record<number, IsoDate[]> = {
  // 2026 — Austrian public holidays falling Tue / Thu produce a bridge.
  2026: [
    '2026-01-02', // Fri after Neujahr (Thu)
    '2026-01-05', // Mon before Hl. 3 Könige (Tue)
    '2026-05-15', // Fri after Christi Himmelfahrt (Thu)
    '2026-06-05', // Fri after Fronleichnam (Thu)
    '2026-11-02', // Mon before Allerseelen (Allerheiligen Sun, but the day after is observed)
    '2026-12-07', // Mon before Mariä Empfängnis (Tue)
  ],
  // 2027 — placeholder; refine when the calendar firms up.
  2027: [
    '2027-05-07', // Fri after Christi Himmelfahrt 2027-05-06 (Thu)
    '2027-05-28', // placeholder; verify
  ],
};

export function getFenstertageForYear(year: number): IsoDate[] {
  return FENSTERTAGE_BY_YEAR[year] ?? [];
}

// Convenience for the rule context loader: include current + next year
// so a request that crosses Dec 31 still gets evaluated correctly.
export function getFenstertageForRange(rangeStartYear: number, rangeEndYear: number): IsoDate[] {
  const out: IsoDate[] = [];
  for (let y = rangeStartYear; y <= rangeEndYear; y += 1) {
    out.push(...getFenstertageForYear(y));
  }
  return out;
}
