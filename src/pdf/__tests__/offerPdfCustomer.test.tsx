import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from '../OfferPdfDocument';
import { computeTotals } from '../../lib/totals';
import { ALL } from '../../features/offers/data/catalogs';

// The customer block must print the address (Straße/PLZ/Ort). It was captured
// in the builder and stored, but omitted from the PDF — this asserts it now
// renders by comparing an offer with an address against one without: the extra
// address line makes the PDF strictly larger.
async function renderSize(customer: Record<string, unknown>): Promise<number> {
  const totals = computeTotals({}, ALL);
  const blob = await pdf(
    <OfferPdfDocument
      {...({
        customer,
        monthlyItems: [
          { id: 'x', qty: 1, discountQty: 0, code: '100', name: 'Mobile Kassa', type: 'm', tier: '12mo', unitPrice: 19, discountPrice: 19, hasDiscount: false, lineTotal: 19, monthly: true },
        ],
        onceItems: [],
        wartungItems: [],
        autoTerms: [],
        totals: { ...totals, monthly: 19, periodMonthly: 228, periodTotal: 228, maxMonths: 12 },
        notes: '',
        raten: 12,
      } as any)}
    />,
  ).toBlob();
  return blob.size;
}

describe('OfferPdfDocument — customer block', () => {
  it('renders the customer address when present', async () => {
    const withoutAddress = await renderSize({ company: 'ACME GmbH', name: 'Max Muster', email: 'max@acme.at', phone: '+43 463 12345' });
    const withAddress = await renderSize({ company: 'ACME GmbH', name: 'Max Muster', email: 'max@acme.at', phone: '+43 463 12345', address: 'Hauptplatz 1, 9020 Klagenfurt' });

    expect(withAddress).toBeGreaterThan(withoutAddress);
  }, 20000);
});
