import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from '../OfferPdfDocument';
import { computeTotals } from '../../lib/totals';
import { ALL } from '../../features/offers/data/catalogs';

// The LAUFENDE KOSTEN table has two price columns per line — Monatlich (single)
// and Jährlich (monthly × Laufzeit). The footer TotalsBox must sum BOTH: the
// monthly Netto/USt/Brutto AND the accumulated Netto/Jahr–Brutto/Jahr block.
// Fonts are subsetted (see offerPdfCustomer.test.tsx), so we assert on output
// size: the accumulated block (three extra rows) makes the PDF strictly larger.
async function renderSize(periodMonthly: number, maxMonths = 12): Promise<number> {
  const totals = computeTotals({}, ALL);
  const blob = await pdf(
    <OfferPdfDocument
      {...({
        customer: { company: 'ACME GmbH', name: 'Max Muster' },
        monthlyItems: [
          { id: 'x', qty: 1, discountQty: 0, code: '100', name: 'Mobile Kassa', type: 'm', tier: '12mo', unitPrice: 19, discountPrice: 19, hasDiscount: false, lineTotal: 19, monthly: true },
        ],
        onceItems: [],
        wartungItems: [],
        autoTerms: [],
        totals: { ...totals, monthly: 19, periodMonthly, periodTotal: periodMonthly, maxMonths },
        notes: '',
        raten: 12,
        laufzeitMonths: maxMonths === 12 ? null : maxMonths,
      } as any)}
    />,
  ).toBlob();
  return blob.size;
}

describe('OfferPdfDocument — running-costs accumulated total', () => {
  it('adds the accumulated (Jährlich) total block to the footer when periodMonthly > 0', async () => {
    const withAccumulated = await renderSize(228);
    const withoutAccumulated = await renderSize(0);
    expect(withAccumulated).toBeGreaterThan(withoutAccumulated);
  }, 30000);

  it('renders the running-costs table over a non-12-month term (Gesamt column)', async () => {
    // 36-month term: the period column/footer relabel to "Gesamt" (monthly × 36).
    // Smoke test — fonts are subsetted so we only assert it renders successfully.
    const size = await renderSize(19 * 36, 36);
    expect(size).toBeGreaterThan(0);
  }, 30000);
});
