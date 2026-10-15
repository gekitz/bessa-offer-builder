import { describe, it, expect } from 'vitest';
import { repairOrderPdfTotals } from '../RepairOrderPdfDocument';
import { calcRepairOrderBilling, VAT_PERCENT } from '../../features/tickets/lib/billing';

// Regression: the Reparaturschein PDF was handed a per-repair-order
// RepairOrderBilling (which has `subtotal`, not `subtotalNet`/`vatAmount`/
// `grandTotalGross`), so Summe netto / MWSt / Gesamt brutto rendered as €NaN.
// repairOrderPdfTotals must derive the full trio from `subtotal`.

describe('repairOrderPdfTotals', () => {
  it('derives net/VAT/gross from a RepairOrderBilling subtotal (no NaN)', () => {
    const t = repairOrderPdfTotals({ subtotal: 275.5 });
    expect(t.subtotalNet).toBe(275.5);
    expect(t.vatPercent).toBe(VAT_PERCENT);
    expect(t.vatAmount).toBe(55.1); // 275.5 × 20%
    expect(t.grandTotalGross).toBe(330.6);
    for (const v of Object.values(t)) expect(Number.isNaN(v)).toBe(false);
  });

  it('passes through an already-computed ticket-level summary', () => {
    const t = repairOrderPdfTotals({
      subtotalNet: 710,
      vatPercent: 20,
      vatAmount: 142,
      grandTotalGross: 852,
    });
    expect(t).toEqual({ subtotalNet: 710, vatPercent: 20, vatAmount: 142, grandTotalGross: 852 });
  });

  it('matches real calcRepairOrderBilling output (the actual PDF input)', () => {
    const repairOrder = {
      id: 'ro1',
      seqNumber: 1,
      status: 'signed',
      performedAt: '2026-09-30',
      billable: true,
    } as any;
    const billing = calcRepairOrderBilling({
      repairOrder,
      entries: [
        {
          id: 'e1',
          employeeId: 'emp1',
          serviceRateCode: 'LABOR_STD',
          workMinutes: 60,
          travelMode: 'none',
          travelWegzeitMinutes: 0,
        } as any,
      ],
      materials: [],
      rateByCode: new Map([
        ['LABOR_STD', { code: 'LABOR_STD', label: 'Arbeit', unit: 'hour', rate: 130 } as any],
      ]),
      zoneByCode: new Map(),
      customerHasWartungsvertrag: false,
    });

    const t = repairOrderPdfTotals(billing);
    expect(t.subtotalNet).toBe(130);
    expect(t.vatAmount).toBe(26);
    expect(t.grandTotalGross).toBe(156);
    for (const v of Object.values(t)) expect(Number.isNaN(v)).toBe(false);
  });
});
