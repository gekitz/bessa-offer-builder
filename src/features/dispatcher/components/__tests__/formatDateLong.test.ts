// Unit tests for the relative-date label helper used in the
// dispatcher's availability panel. Keeping these in a separate file
// (rather than inside the component test) so the component test stays
// focused on integration behaviour.

import { describe, expect, it } from 'vitest';
import { formatDateLong } from '../DispatcherAvailabilityPanel';

describe('formatDateLong', () => {
  it('prefixes "Heute" when the ISO date equals today', () => {
    expect(formatDateLong('2026-05-13', '2026-05-13')).toMatch(/^Heute · /);
  });

  it('prefixes "Morgen" when the ISO date equals today + 1', () => {
    expect(formatDateLong('2026-05-14', '2026-05-13')).toMatch(/^Morgen · /);
  });

  it('returns the plain weekday + date for any other day', () => {
    const out = formatDateLong('2026-05-18', '2026-05-13');
    expect(out).not.toMatch(/^Heute · /);
    expect(out).not.toMatch(/^Morgen · /);
    // de-AT formatting: "Mo., 18.05" (locale-dependent but always
    // contains 18 and 05).
    expect(out).toMatch(/18/);
    expect(out).toMatch(/05/);
  });

  it('handles month rollover for tomorrow', () => {
    expect(formatDateLong('2026-06-01', '2026-05-31')).toMatch(/^Morgen · /);
  });

  it('handles year rollover for tomorrow', () => {
    expect(formatDateLong('2027-01-01', '2026-12-31')).toMatch(/^Morgen · /);
  });
});
