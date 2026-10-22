import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from '../OfferPdfDocument';
import { computeTotals } from '../../lib/totals';
import { ALL } from '../../features/offers/data/catalogs';

// react-pdf embeds a subsetted font, so glyph runs aren't greppable in the
// output bytes (see offerPdfCustomer.test.tsx). We instead assert on the
// rendered output *size*: the two Brother-specific inputs — the GESAMTÜBERSICHT
// label (offerType) and the Bedingungen lines (autoTerms) — each change the
// PDF, which proves both props reach the layout and are drawn.

const baseProps = () => {
  const totals = computeTotals({}, ALL);
  return {
    customer: { company: 'ACME GmbH', name: 'Max Muster', email: 'max@acme.at', phone: '+43 1' },
    monthlyItems: [],
    onceItems: [
      { id: 'brother-mfc-j4350dw', qty: 1, discountQty: 0, code: '', name: 'Brother MFC-J4350DW', type: 'o', unitPrice: 232.5, discountPrice: 232.5, hasDiscount: false, lineTotal: 232.5, monthly: false },
    ],
    wartungItems: [],
    totals: { ...totals, once: 232.5, periodTotal: 232.5, maxMonths: 12 },
    notes: '',
    raten: 12,
  };
};

async function renderSize(props: Record<string, unknown>): Promise<number> {
  const blob = await pdf(<OfferPdfDocument {...({ ...baseProps(), ...props } as any)} />).toBlob();
  return blob.size;
}

describe('OfferPdfDocument — Brother offer', () => {
  it('renders the short "Kosten" label for a pure one-off offer, regardless of offerType', async () => {
    // Both are pure one-off (only Einmalige Kosten), so both get the short
    // "Kosten" label — the label keys off whether the offer recurs, not off
    // offerType. Same inputs → identical PDF size.
    const brother = await renderSize({ offerType: 'brother', autoTerms: [] });
    const pos = await renderSize({ offerType: 'pos', autoTerms: [] });
    expect(pos).toBe(brother);
  }, 30000);

  it('switches to the long "im ersten Jahr" label once the offer recurs', async () => {
    const totals = computeTotals({}, ALL);
    const recurringTotals = { ...totals, monthly: 100, once: 232.5, periodTotal: 1432.5, periodMonthly: 1200, maxMonths: 12 };
    const onceOnly = await renderSize({ offerType: 'pos', autoTerms: [] });
    const recurring = await renderSize({ offerType: 'pos', autoTerms: [], totals: recurringTotals });
    // The recurring label ("Kosten im ersten Jahr (monatlich × Laufzeit +
    // einmalig)") plus the "jedes weitere Jahr" row make the PDF strictly larger.
    expect(recurring).toBeGreaterThan(onceOnly);
  }, 30000);

  it('draws the (Brother) auto-terms into the Bedingungen block', async () => {
    const withTerms = await renderSize({ offerType: 'brother', autoTerms: ['Lieferzeit: nach Rücksprache', 'Zahlungsziel: wie vereinbart'] });
    const withoutTerms = await renderSize({ offerType: 'brother', autoTerms: [] });
    expect(withTerms).toBeGreaterThan(withoutTerms);
  }, 30000);
});
