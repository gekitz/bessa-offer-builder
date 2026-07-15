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

  // Exercises the new monthly (Monatlich + Jährlich) and once (Einzelpreis +
  // Preis) column layouts including the alternative and optional branches, so a
  // regression that emits a bare string child or a bad style would throw here.
  it('renders monthly + once tables with alternative and optional lines', async () => {
    const totals = computeTotals({}, ALL);
    const size = await renderSize({
      customer,
      monthlyItems: [
        { id: 'm1', qty: 2, discountQty: 0, code: '100', name: 'Mobile Kassa', type: 'm', tier: '12mo', unitPrice: 19, discountPrice: 19, hasDiscount: false, lineTotal: 38, monthly: true },
        { id: 'm2', qty: 1, discountQty: 0, code: '101', name: 'Alternativ-Kassa', type: 'm', tier: '6mo', unitPrice: 29, discountPrice: 29, hasDiscount: false, lineTotal: 29, monthly: true, optionGroup: 'g', optionSelected: false, optionDelta: 10 },
        { id: 'm3', qty: 1, discountQty: 0, code: '102', name: 'Optionaler Bon-Drucker', type: 'm', tier: '12mo', unitPrice: 5, discountPrice: 5, hasDiscount: false, lineTotal: 5, monthly: true, optional: true },
      ],
      onceItems: [
        { id: 'o1', qty: 3, discountQty: 0, code: '200', name: 'Einrichtung', type: 's', unitPrice: 100, discountPrice: 100, hasDiscount: false, lineTotal: 300, monthly: false },
        { id: 'o2', qty: 1, discountQty: 0, code: '201', name: 'Optionale Schulung', type: 'h', unitPrice: 90, discountPrice: 90, hasDiscount: false, lineTotal: 90, monthly: false, optional: true },
      ],
      wartungItems: [], autoTerms: [],
      totals: { ...totals, monthly: 38, once: 300, periodMonthly: 456, periodTotal: 756, maxMonths: 12 },
      notes: '', raten: 12,
    });
    expect(size).toBeGreaterThan(1000);
  }, 20000);
});
