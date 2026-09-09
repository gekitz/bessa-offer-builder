import { describe, it, expect } from 'vitest';
import { planDeliveryNoteBelege, type DeliveryNoteForExport } from '../deliveryNoteBelegPlan';
import type { DeliveryNote, DeliveryNoteItem } from '../../types';

function note(over: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: 'dn-1', ticketId: 't-1', seqNumber: 1, status: 'signed', note: null,
    signatureData: null, signedAt: null, signedByName: null, performedAt: '2026-09-05',
    mesonicBelegLaufnummer: null, mesonicBelegKey: null, mesonicBelegCreatedAt: null,
    createdBy: null, createdAt: '', updatedAt: '',
    ...over,
  };
}

function item(over: Partial<DeliveryNoteItem> = {}): DeliveryNoteItem {
  return {
    id: 'i-1', deliveryNoteId: 'dn-1', productId: 'p', mesonicArtikelNr: 'ART-1',
    bezeichnung: 'Sunmi L3', quantity: 1, unitPrice: 599, isFreetext: false,
    serialNumbers: [], sort: 0, createdAt: '',
    ...over,
  };
}

const OPTS = { konto: '272765', ticketStandort: 'klagenfurt' as const, startLaufnummer: 26 };

describe('planDeliveryNoteBelege', () => {
  it('plans a Belegart-19 beleg with sequential laufnummer + key', () => {
    const plan = planDeliveryNoteBelege([{ deliveryNote: note(), items: [item()], alreadyExportedKey: null }], OPTS);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0]).toMatchObject({ deliveryNoteId: 'dn-1', laufnummer: 26, belegKey: '272765-26' });
    expect(plan.toCreate[0].xml).toContain('<Belegart>19</Belegart>');
    expect(plan.toCreate[0].xml).toContain('<Laufnummer>26</Laufnummer>');
  });

  it('assigns consecutive laufnummern across multiple notes', () => {
    const plan = planDeliveryNoteBelege(
      [
        { deliveryNote: note({ id: 'a', seqNumber: 1 }), items: [item()], alreadyExportedKey: null },
        { deliveryNote: note({ id: 'b', seqNumber: 2 }), items: [item()], alreadyExportedKey: null },
      ],
      OPTS,
    );
    expect(plan.toCreate.map((b) => b.laufnummer)).toEqual([26, 27]);
  });

  it('skips already-exported notes without consuming a laufnummer', () => {
    const plan = planDeliveryNoteBelege(
      [
        { deliveryNote: note({ id: 'a' }), items: [item()], alreadyExportedKey: '272765-10' },
        { deliveryNote: note({ id: 'b', seqNumber: 2 }), items: [item()], alreadyExportedKey: null },
      ],
      OPTS,
    );
    expect(plan.skipped).toEqual([{ deliveryNoteId: 'a', reason: 'already_exported', belegKey: '272765-10' }]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].laufnummer).toBe(26); // b starts at startLaufnummer, not 27
  });

  it('skips cancelled and empty notes', () => {
    const plan = planDeliveryNoteBelege(
      [
        { deliveryNote: note({ id: 'a', status: 'cancelled' }), items: [item()], alreadyExportedKey: null },
        { deliveryNote: note({ id: 'b' }), items: [], alreadyExportedKey: null },
      ],
      OPTS,
    );
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.skipped).toEqual([
      { deliveryNoteId: 'a', reason: 'cancelled' },
      { deliveryNoteId: 'b', reason: 'empty' },
    ]);
  });

  it('folds serials into the beleg XML Bezeichnung', () => {
    const plan = planDeliveryNoteBelege(
      [{ deliveryNote: note(), items: [item({ quantity: 2, serialNumbers: ['S1', 'S2'] })], alreadyExportedKey: null }],
      OPTS,
    );
    expect(plan.toCreate[0].xml).toContain('2x Sunmi L3 S1, S2');
  });
});
