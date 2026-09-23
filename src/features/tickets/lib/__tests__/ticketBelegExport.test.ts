import { describe, it, expect, vi } from 'vitest';
import { exportTicketBelege, type ExportInput } from '../ticketBelegExport';
import type { OrderForExport } from '../ticketBelegPlan';
import type { DeliveryNoteForExport } from '../deliveryNoteBelegPlan';
import type { EmployeeMesonic } from '../repairOrderBeleg';
import type { BillingPosition, DeliveryNote, DeliveryNoteItem, RepairOrderBilling } from '../../types';

const employeeMesonic = new Map<string, EmployeeMesonic>([['e-heri', { vertreternummer: '9', standort: 'wolfsberg' }]]);

function order(seq: number, alreadyExportedKey: string | null = null, positions?: BillingPosition[]): OrderForExport {
  const pos: BillingPosition[] = positions ?? [{
    kind: 'labor', label: 'Arbeit', quantity: 1, unit: 'h', unitPrice: 100, total: 100,
    repairOrderId: `ro-${seq}`, repairOrderSeq: seq, employeeId: 'e-heri',
  }];
  const billing: RepairOrderBilling = {
    repairOrderId: `ro-${seq}`, seqNumber: seq, performedAt: '2026-09-01', signed: true,
    positions: pos, laborTotal: 0, travelTotal: 0, materialTotal: 0, serviceTotal: 0, adjustmentTotal: 0, subtotal: 0, laborMinutes: 0,
  };
  return { billing, alreadyExportedKey };
}

function input(orders: OrderForExport[]): ExportInput {
  return { konto: '272765', ticketStandort: 'klagenfurt', orders, employeeMesonic };
}

function deliveryNote(id: string, seq: number, alreadyExportedKey: string | null = null): DeliveryNoteForExport {
  const dn: DeliveryNote = {
    id, ticketId: 't-1', seqNumber: seq, status: 'signed', note: null,
    signatureData: null, signedAt: null, signedByName: null, performedAt: '2026-09-05',
    mesonicBelegLaufnummer: null, mesonicBelegKey: null, mesonicBelegCreatedAt: null,
    createdBy: null, createdAt: '', updatedAt: '',
  };
  const item: DeliveryNoteItem = {
    id: `${id}-i`, deliveryNoteId: id, productId: 'p', mesonicArtikelNr: 'ART-1',
    bezeichnung: 'Sunmi L3', quantity: 1, unitPrice: 599, isFreetext: false,
    serialNumbers: [], sort: 0, createdAt: '',
  };
  return { deliveryNote: dn, items: [item], alreadyExportedKey };
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

  it('schreibt den abweichenden Rechnungsempfänger auf Rep-Schein UND Lieferschein', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: true });
    await exportTicketBelege(
      {
        ...input([order(1)]),
        kontoRechnungsadresse: '230A001',
        deliveryNotes: [deliveryNote('dn-1', 1)],
      },
      { readMaxLaufnummer: async () => 0, importBeleg, persistKey: vi.fn(), persistDeliveryKey: vi.fn() },
    );
    expect(importBeleg).toHaveBeenCalledTimes(2);
    for (const call of importBeleg.mock.calls) {
      expect(call[0]).toContain('<KontoRechnungsadresse>230A001</KontoRechnungsadresse>');
    }
  });

  it('lässt KontoRechnungsadresse weg, wenn kein abweichender Empfänger gesetzt ist', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: true });
    await exportTicketBelege(input([order(1)]), {
      readMaxLaufnummer: async () => 0, importBeleg, persistKey: vi.fn(),
    });
    expect(importBeleg.mock.calls[0][0]).not.toContain('<KontoRechnungsadresse>');
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

  it('zählt die Floor-Tally erst nach erfolgreichem Anlegen des Floor-Scheins hoch', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: true });
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const persistFloorTally = vi.fn().mockResolvedValue(undefined);
    await exportTicketBelege(
      { ...input([order(1), order(2)]), floorCommit: { ticketId: 't-1', repairOrderId: 'ro-2', minutes: 300 } },
      { readMaxLaufnummer: async () => 0, importBeleg, persistKey, persistFloorTally },
    );
    // nur einmal, für den Floor-tragenden Schein ro-2
    expect(persistFloorTally).toHaveBeenCalledTimes(1);
    expect(persistFloorTally).toHaveBeenCalledWith('t-1', 300);
  });

  it('schreibt die Floor-Tally NICHT, wenn der Floor-Schein fehlschlägt', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: false, error: 'nein' });
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const persistFloorTally = vi.fn().mockResolvedValue(undefined);
    await exportTicketBelege(
      { ...input([order(2)]), floorCommit: { ticketId: 't-1', repairOrderId: 'ro-2', minutes: 300 } },
      { readMaxLaufnummer: async () => 0, importBeleg, persistKey, persistFloorTally },
    );
    expect(persistFloorTally).not.toHaveBeenCalled();
  });

  // ── Lieferscheine (Belegart 19) ──────────────────────────────────────

  it('vergibt Lieferschein-Laufnummern NACH den Reparaturschein-Belegen (geteilte Konto-Sequenz)', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: true });
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const persistDeliveryKey = vi.fn().mockResolvedValue(undefined);
    const res = await exportTicketBelege(
      { ...input([order(1), order(2)]), deliveryNotes: [deliveryNote('dn-1', 1), deliveryNote('dn-2', 2)] },
      { readMaxLaufnummer: async () => 100, importBeleg, persistKey, persistDeliveryKey },
    );
    // Rep-Belege: 101, 102 → Lieferscheine starten bei 103, 104.
    expect(res.created.map((c) => c.belegKey)).toEqual(['272765-101', '272765-102']);
    expect(res.deliveryCreated).toEqual([
      { deliveryNoteId: 'dn-1', seqNumber: 1, belegKey: '272765-103' },
      { deliveryNoteId: 'dn-2', seqNumber: 2, belegKey: '272765-104' },
    ]);
    expect(persistDeliveryKey).toHaveBeenCalledWith('dn-1', 103, '272765-103');
    expect(importBeleg).toHaveBeenCalledTimes(4);
  });

  it('exportiert Lieferscheine auch ohne Reparaturscheine ab max+1', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: true });
    const persistDeliveryKey = vi.fn().mockResolvedValue(undefined);
    const res = await exportTicketBelege(
      { ...input([]), deliveryNotes: [deliveryNote('dn-1', 1)] },
      { readMaxLaufnummer: async () => 25, importBeleg, persistKey: vi.fn(), persistDeliveryKey },
    );
    expect(res.deliveryCreated).toEqual([{ deliveryNoteId: 'dn-1', seqNumber: 1, belegKey: '272765-26' }]);
  });

  it('überspringt bereits exportierte Lieferscheine und meldet Import-Fehler', async () => {
    const importBeleg = vi.fn().mockResolvedValue({ ok: false, error: 'WinLine nein' });
    const persistDeliveryKey = vi.fn().mockResolvedValue(undefined);
    const res = await exportTicketBelege(
      { ...input([]), deliveryNotes: [deliveryNote('dn-1', 1, '272765-9'), deliveryNote('dn-2', 2)] },
      { readMaxLaufnummer: async () => 25, importBeleg, persistKey: vi.fn(), persistDeliveryKey },
    );
    expect(res.deliverySkipped).toEqual([{ deliveryNoteId: 'dn-1', reason: 'already_exported', belegKey: '272765-9' }]);
    expect(res.deliveryFailed).toEqual([{ deliveryNoteId: 'dn-2', seqNumber: 2, laufnummer: 26, error: 'WinLine nein' }]);
    expect(persistDeliveryKey).not.toHaveBeenCalled();
  });
});
