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
async function renderSize(periodMonthly: number): Promise<number> {
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
        totals: { ...totals, monthly: 19, periodMonthly, periodTotal: periodMonthly, maxMonths: 12 },
        notes: '',
        raten: 12,
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
});
