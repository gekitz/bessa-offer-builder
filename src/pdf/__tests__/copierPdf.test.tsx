import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from '../OfferPdfDocument';
import { buildCopierOffer } from '../../lib/copierOffer';
import { computeTotals, type Cart } from '../../lib/totals';
import { ALL } from '../../features/offers/data/catalogs';

// Renders the real PDF document to a Blob. This proves the copier branch
// (device table + Grenke leasing + maintenance block) renders without throwing
// — the numbers themselves are covered by copierOffer.test.ts. Kept minimal so
// it stays fast.
async function renderSize(props: Record<string, unknown>): Promise<number> {
  const blob = await pdf(<OfferPdfDocument {...(props as any)} />).toBlob();
  return blob.size;
}

const customer = { company: 'Kissen1 Zirbenprodukte GmbH', name: 'Daniel Abart', email: 'd@a.at', phone: '+43 463 12345' };

describe('OfferPdfDocument — Sharp/copier branch', () => {
  it('renders a Kauf copier offer (with trade-in) to a non-empty PDF', async () => {
    const cart: Cart = {
      'sharp-bp51c26': {
        qty: 1,
        priceOverride: 3180,
        saleMode: 'kauf',
        tradeIn: { name: 'Eintauschgerät Sharp MX 2651', value: 650 },
      },
    };
    const copierOffer = buildCopierOffer(cart, ALL);
    const totals = computeTotals(cart, ALL);
    const size = await renderSize({
      customer, monthlyItems: [], onceItems: [], wartungItems: [], autoTerms: [],
      totals, notes: '', raten: 12, copierOffer,
    });
    expect(size).toBeGreaterThan(1000);
  }, 20000);

  it('renders a Leasing copier offer with accessories', async () => {
    const cart: Cart = {
      'sharp-bp61c45': { qty: 1, saleMode: 'leasing' },
      'sharp-zb-bpfn13': { qty: 1 },
    };
    const copierOffer = buildCopierOffer(cart, ALL);
    const totals = computeTotals(cart, ALL);
    const size = await renderSize({
      customer, monthlyItems: [], onceItems: [], wartungItems: [], autoTerms: [],
      totals, notes: '', raten: 12, copierOffer,
    });
    expect(size).toBeGreaterThan(1000);
  }, 20000);

  it('still renders an ordinary PoS offer (no copierOffer) unchanged', async () => {
    const totals = computeTotals({}, ALL);
    const size = await renderSize({
      customer,
      monthlyItems: [{ id: 'x', qty: 1, discountQty: 0, code: '100', name: 'Mobile Kassa', type: 'm', tier: '12mo', unitPrice: 19, discountPrice: 19, hasDiscount: false, lineTotal: 19, monthly: true }],
      onceItems: [], wartungItems: [], autoTerms: [],
      totals: { ...totals, monthly: 19, periodMonthly: 228, periodTotal: 228, maxMonths: 12 },
      notes: '', raten: 12,
    });
    expect(size).toBeGreaterThan(1000);
  }, 20000);
});
