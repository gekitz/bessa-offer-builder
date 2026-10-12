import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import RepairOrderPdfDocument from '../RepairOrderPdfDocument';

// Smoke test: the totals box now renders a negative "Korrekturen" row (styled
// red) for parity with the on-screen preview. Assert the document renders to a
// non-empty blob with a signed adjustment present — guards the conditional
// style array from crashing the renderer.
const base = {
  ticket: { ticketNumber: 'T-1', title: 'Fix', customerName: 'ACME' },
  repairOrder: { seqNumber: 1, performedAt: '2026-10-12', workDescription: 'Arbeit', status: 'signed' },
};

async function render(billing: Record<string, unknown>): Promise<number> {
  const blob = await pdf(
    <RepairOrderPdfDocument {...({ ...base, billing } as any)} />,
  ).toBlob();
  return blob.size;
}

describe('RepairOrderPdfDocument — Korrekturen row', () => {
  it('renders with a negative adjustment without crashing', async () => {
    const size = await render({
      positions: [{ kind: 'material', label: 'Teil', quantity: 1, unit: 'Stk', unitPrice: 100, total: 100 }],
      laborTotal: 0,
      travelTotal: 0,
      serviceTotal: 0,
      materialTotal: 100,
      adjustmentTotal: -50,
      subtotal: 50,
    });
    expect(size).toBeGreaterThan(0);
  }, 20000);
});
