import { describe, expect, it } from 'vitest';
import { countByTag, deviceMatchesTags, tagLabel, TAG_VOCAB } from './deviceTags';

const d = (...tags: string[]) => ({ tags });

describe('deviceMatchesTags', () => {
  it('matches everything when nothing is selected', () => {
    expect(deviceMatchesTags(['mobil'], [])).toBe(true);
    expect(deviceMatchesTags([], [])).toBe(true);
    expect(deviceMatchesTags(null, [])).toBe(true);
  });

  it('requires ALL selected tags (AND semantics)', () => {
    // A mobile POS with a printer.
    const dev = ['mobil', 'kassa', 'drucker'];
    expect(deviceMatchesTags(dev, ['mobil'])).toBe(true);
    expect(deviceMatchesTags(dev, ['mobil', 'drucker'])).toBe(true);
    expect(deviceMatchesTags(dev, ['mobil', 'drucker', 'kassa'])).toBe(true);
    // Missing tag → no match.
    expect(deviceMatchesTags(dev, ['mobil', 'router'])).toBe(false);
  });

  it('separates a mobile printer from a mobile POS via the kassa tag', () => {
    const mobilePrinter = ['mobil', 'drucker'];
    const mobilePos = ['mobil', 'kassa', 'drucker'];
    // mobil + drucker (no kassa) selects both — they both print and are mobile.
    expect(deviceMatchesTags(mobilePrinter, ['mobil', 'drucker'])).toBe(true);
    expect(deviceMatchesTags(mobilePos, ['mobil', 'drucker'])).toBe(true);
    // Adding kassa narrows to the POS only.
    expect(deviceMatchesTags(mobilePrinter, ['mobil', 'drucker', 'kassa'])).toBe(false);
    expect(deviceMatchesTags(mobilePos, ['mobil', 'drucker', 'kassa'])).toBe(true);
  });

  it('treats a null/undefined tag list as untagged', () => {
    expect(deviceMatchesTags(null, ['mobil'])).toBe(false);
    expect(deviceMatchesTags(undefined, ['mobil'])).toBe(false);
  });
});

describe('countByTag', () => {
  it('counts each device once per tag it carries (overlapping by design)', () => {
    const devices = [
      d('mobil', 'kassa'), // handheld POS
      d('mobil', 'kassa', 'drucker'), // handheld POS w/ printer
      d('mobil', 'drucker'), // mobile printer
      d('drucker', 'stationaer'), // stationary printer
      d('access-point'),
    ];
    const c = countByTag(devices);
    expect(c.mobil).toBe(3);
    expect(c.drucker).toBe(3);
    expect(c.kassa).toBe(2);
    expect(c['access-point']).toBe(1);
    expect(c.router).toBe(0);
  });

  it('initialises every vocabulary tag to zero', () => {
    const c = countByTag([]);
    for (const t of TAG_VOCAB) expect(c[t.value]).toBe(0);
  });

  it('ignores unknown/legacy tags not in the vocabulary', () => {
    const c = countByTag([d('mobil', 'legacy-unknown-tag')]);
    expect(c.mobil).toBe(1);
    expect(c['legacy-unknown-tag']).toBeUndefined();
  });
});

describe('tagLabel', () => {
  it('returns the German label for a known slug', () => {
    expect(tagLabel('access-point')).toBe('Access Point');
    expect(tagLabel('kassa')).toBe('Kassengerät');
  });
  it('falls back to the raw slug for an unknown tag', () => {
    expect(tagLabel('legacy-unknown-tag')).toBe('legacy-unknown-tag');
  });
});
