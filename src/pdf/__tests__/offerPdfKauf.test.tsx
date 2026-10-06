import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from '../OfferPdfDocument';
import { computeTotals } from '../../lib/totals';
import { buildLineItems } from '../../lib/offerLineItems';
import { yearlyServicePerUnit } from '../../lib/pricing';
import { ALL } from '../../features/offers/data/catalogs';

// bessa Kauf positions are one-time (t='o') licences that also carry a yearly
// Wartung (servicePercent:15, the permanent Umstiegs-Aktion rate). They must
// flow through BOTH the EINMALIGE KOSTEN table and the Wartung-pro-Jahr table
// of the PDF — exactly like the MELZER / GastroTouch positions. vitest.setup
// hydrates ALL from catalogSeed, so the real catalog data is under test here.

// Mirror OfferBuilderPage.buildWartungItems for the Kauf cart entries.
function buildWartungItems(entries: [string, { qty?: number; discountQty?: number }][]) {
  return entries
    .filter(([id]) => (ALL[id]?.servicePercent ?? 0) > 0)
    .map(([id, c]) => {
      const item = ALL[id]!;
      const fullQty = c.qty || 0;
      const discQty = c.discountQty || 0;
      const unit = yearlyServicePerUnit(item);
      return {
        id,
        qty: fullQty,
        discountQty: discQty,
        code: item.code || '',
        name: item.name,
        servicePercent: item.servicePercent,
        wartungUnit: unit,
        wartungLine: unit * (fullQty + discQty),
      };
    });
}

// Mobile Kassa (479,- Kauf) + Kleiner Gastrobetrieb (1.134,- Kauf), each qty 1.
const cart = {
  'bk-100': { qty: 1, discountQty: 0 },
  'bk-120': { qty: 1, discountQty: 0 },
};
const entries = Object.entries(cart);

describe('bessa Kauf — totals', () => {
  it('sums the one-time Kauf price into `once` and the 15% Aktion-Wartung into `yearly`', () => {
    const t = computeTotals(cart, ALL);
    expect(t.once).toBe(479 + 1134);
    // 15% of each purchase price, charged once per year.
    expect(t.yearly).toBeCloseTo(479 * 0.15 + 1134 * 0.15, 2);
    // periodTotal folds in the first year's Wartung alongside the once-off cost.
    expect(t.periodTotal).toBeCloseTo(479 + 1134 + t.yearly, 2);
    expect(t.monthly).toBe(0);
  });
});

describe('bessa Kauf — PDF rendering', () => {
  it('renders the EINMALIGE KOSTEN + Wartung tables for Kauf items without throwing', async () => {
    const { onceItems, monthlyItems } = buildLineItems(entries, ALL);
    const wartungItems = buildWartungItems(entries);
    const totals = computeTotals(cart, ALL);

    // Both Kauf licences land in the once (einmalig) bucket, none monthly.
    expect(onceItems.map((r) => r.id).sort()).toEqual(['bk-100', 'bk-120']);
    expect(monthlyItems).toHaveLength(0);
    // Each gets a Wartung row carrying 15% and the per-line yearly fee.
    expect(wartungItems).toHaveLength(2);
    expect(wartungItems.every((w) => w.servicePercent === 15)).toBe(true);
    expect(wartungItems.find((w) => w.id === 'bk-100')!.wartungLine).toBeCloseTo(71.85, 2);

    const render = (wartung: typeof wartungItems) =>
      pdf(
        <OfferPdfDocument
          {...({
            customer: { company: 'Gasthaus Test', name: 'Max Muster' },
            monthlyItems: [],
            onceItems,
            wartungItems: wartung,
            autoTerms: [],
            totals,
            notes: '',
            raten: 12,
          } as any)}
        />,
      ).toBlob();

    const withWartung = await render(wartungItems);
    const withoutWartung = await render([]);
    // A real PDF is produced, and the Wartung-pro-Jahr block adds visible rows.
    expect(withWartung.size).toBeGreaterThan(0);
    expect(withWartung.size).toBeGreaterThan(withoutWartung.size);
  }, 30000);
});
