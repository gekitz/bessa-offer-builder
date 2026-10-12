import { describe, it, expect } from 'vitest';
import { deriveTotals } from '../RepairOrderPdfDocument';

// Regression: RepairOrderDetail passes the per-repair-order `RepairOrderBilling`
// (which has only the net `subtotal`, no VAT fields) into the PDF. The totals
// box used to read `subtotalNet`/`vatAmount`/`grandTotalGross` directly and
// printed NaN. deriveTotals must fill those from `subtotal`.
describe('deriveTotals', () => {
  it('derives net/VAT/gross from a RepairOrderBilling (subtotal only)', () => {
    const t = deriveTotals({ subtotal: 100 });
    expect(t.subtotalNet).toBe(100);
    expect(t.vatPercent).toBe(20);
    expect(t.vatAmount).toBe(20);
    expect(t.grandTotalGross).toBe(120);
    // No NaN anywhere.
    for (const v of Object.values(t)) expect(Number.isNaN(v)).toBe(false);
  });

  it('passes through a ticket-level BillingSummary unchanged', () => {
    const t = deriveTotals({
      subtotalNet: 250,
      vatPercent: 20,
      vatAmount: 50,
      grandTotalGross: 300,
    });
    expect(t).toEqual({ subtotalNet: 250, vatPercent: 20, vatAmount: 50, grandTotalGross: 300 });
  });

  it('never yields NaN for an empty/zero billing', () => {
    const t = deriveTotals({});
    expect(t).toEqual({ subtotalNet: 0, vatPercent: 20, vatAmount: 0, grandTotalGross: 0 });
  });
});
