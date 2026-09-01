import { describe, it, expect, vi } from 'vitest';
import { exportTicketBelege, type ExportInput } from '../ticketBelegExport';
import type { OrderForExport } from '../ticketBelegPlan';
import type { EmployeeMesonic } from '../repairOrderBeleg';
import type { BillingPosition, RepairOrderBilling } from '../../types';

const employeeMesonic = new Map<string, EmployeeMesonic>([['e-heri', { vertreternummer: '9', standort: 'wolfsberg' }]]);

function order(seq: number, alreadyExportedKey: string | null = null, positions?: BillingPosition[]): OrderForExport {
  const pos: BillingPosition[] = positions ?? [{
    kind: 'labor', label: 'Arbeit', quantity: 1, unit: 'h', unitPrice: 100, total: 100,
    repairOrderId: `ro-${seq}`, repairOrderSeq: seq, employeeId: 'e-heri',
  }];
  const billing: RepairOrderBilling = {
    repairOrderId: `ro-${seq}`, seqNumber: seq, performedAt: '2026-09-01', signed: true,
    positions: pos, laborTotal: 0, travelTotal: 0, materialTotal: 0, serviceTotal: 0, adjustmentTotal: 0, subtotal: 0,
  };
  return { billing, alreadyExportedKey };
}

function input(orders: OrderForExport[]): ExportInput {
  return { konto: '272765', ticketStandort: 'klagenfurt', orders, employeeMesonic };
}

describe('exportTicketBelege', () => {
  it('erstellt je Schein einen Beleg ab max+1 und persistiert die Keys', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: true, voucherNumber: 0 });
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const res = await exportTicketBelege(input([order(1), order(2)]), {
      readMaxLaufnummer: async () => 100,
      importBeleg,
      persistKey,
    });
    expect(res.created).toEqual([
      { repairOrderId: 'ro-1', seqNumber: 1, belegKey: '272765-101' },
      { repairOrderId: 'ro-2', seqNumber: 2, belegKey: '272765-102' },
    ]);
    expect(importBeleg).toHaveBeenCalledTimes(2);
    expect(persistKey).toHaveBeenCalledWith('ro-1', 101, '272765-101');
  });

  it('wirft ohne Konto (Kunde nicht verknüpft)', async () => {
    await expect(
      exportTicketBelege({ ...input([order(1)]), konto: '' }, {
        readMaxLaufnummer: async () => 0, importBeleg: vi.fn(), persistKey: vi.fn(),
      }),
    ).rejects.toThrow(/Konto/);
  });

  it('setzt bei einem Import-Fehler fort und meldet Teil-Erfolg', async () => {
    const importBeleg = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'WinLine sagt nein' })
      .mockResolvedValueOnce({ ok: true });
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const res = await exportTicketBelege(input([order(1), order(2)]), {
      readMaxLaufnummer: async () => 0, importBeleg, persistKey,
    });
    expect(res.failed).toEqual([{ repairOrderId: 'ro-1', seqNumber: 1, laufnummer: 1, error: 'WinLine sagt nein' }]);
    expect(res.created).toEqual([{ repairOrderId: 'ro-2', seqNumber: 2, belegKey: '272765-2' }]);
    expect(persistKey).toHaveBeenCalledTimes(1); // nur der erfolgreiche
  });

  it('überspringt bereits exportierte Scheine (kein Import, kein persist)', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: true });
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const res = await exportTicketBelege(input([order(1, '272765-050'), order(2)]), {
      readMaxLaufnummer: async () => 100, importBeleg, persistKey,
    });
    expect(res.skipped).toEqual([{ repairOrderId: 'ro-1', reason: 'already_exported', belegKey: '272765-050' }]);
    expect(importBeleg).toHaveBeenCalledTimes(1); // nur ro-2
    expect(res.created).toEqual([{ repairOrderId: 'ro-2', seqNumber: 2, belegKey: '272765-101' }]);
  });
});
