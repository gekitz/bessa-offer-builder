import type { IsoDate } from '../types';

// Render an ISO date as German DD.MM.YYYY for display.
export function formatGermanDate(iso: IsoDate): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// Render a date range. Collapses to a single date when start === end.
// Optional half-day flags get appended as parenthetical markers.
export function formatRange(
  start: IsoDate,
  end: IsoDate,
  halfStart?: boolean,
  halfEnd?: boolean,
): string {
  const base = start === end
    ? formatGermanDate(start)
    : `${formatGermanDate(start)} – ${formatGermanDate(end)}`;
  if (!halfStart && !halfEnd) return base;
  const markers: string[] = [];
  if (halfStart) markers.push('½ Anfang');
  if (halfEnd) markers.push('½ Ende');
  return `${base} (${markers.join(', ')})`;
}
