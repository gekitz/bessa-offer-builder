import { describe, it, expect } from 'vitest';
import { deliveryNoteToBelegPositions, foldSerialsIntoBezeichnung } from '../deliveryNoteBeleg';
import type { DeliveryNoteItem } from '../../types';

function item(over: Partial<DeliveryNoteItem> = {}): DeliveryNoteItem {
  return {
    id: 'i', deliveryNoteId: 'dn', productId: 'p', mesonicArtikelNr: 'ART-1',
    bezeichnung: 'Sunmi L3', quantity: 1, unitPrice: 599, isFreetext: false,
    serialNumbers: [], sort: 0, createdAt: '',
    ...over,
  };
}

describe('foldSerialsIntoBezeichnung', () => {
  it('leaves the name untouched when there are no serials', () => {
    expect(foldSerialsIntoBezeichnung({ bezeichnung: 'Sunmi L3', quantity: 2, serialNumbers: [] })).toBe('Sunmi L3');
  });

  it('folds serials into the "{qty}x {name} <serials>" format', () => {
    expect(
      foldSerialsIntoBezeichnung({ bezeichnung: 'Sunmi L3', quantity: 4, serialNumbers: ['s1', 's2', 's3', 's4'] }),
    ).toBe('4x Sunmi L3 s1, s2, s3, s4');
  });

  it('ignores blank serial slots', () => {
    expect(
      foldSerialsIntoBezeichnung({ bezeichnung: 'Sunmi L3', quantity: 2, serialNumbers: ['s1', '', '  '] }),
    ).toBe('2x Sunmi L3 s1');
  });
});

describe('deliveryNoteToBelegPositions', () => {
  it('maps a real article to Datentyp 1 with its Artikelnummer inkl. Standort-Ausprägung', () => {
    const [p] = deliveryNoteToBelegPositions([item({ quantity: 2, unitPrice: 599 })], 'klagenfurt');
    expect(p).toEqual({
      artikelnummer: 'ART-1KL',
      datentyp: '1',
      menge: 2,
      einzelpreis: 599,
      bezeichnung: 'Sunmi L3',
    });
  });

  it('appends WO on a Wolfsberg delivery', () => {
    const [p] = deliveryNoteToBelegPositions([item()], 'wolfsberg');
    expect(p.artikelnummer).toBe('ART-1WO');
  });

  it('normalises an already-suffixed base to the delivery Standort', () => {
    const [p] = deliveryNoteToBelegPositions([item({ mesonicArtikelNr: 'ART-1KL' })], 'wolfsberg');
    expect(p.artikelnummer).toBe('ART-1WO');
  });

  it('maps freetext / missing article to Datentyp 3 with artikelnummer TEXT (kein Suffix)', () => {
    const [p] = deliveryNoteToBelegPositions(
      [item({ mesonicArtikelNr: null, isFreetext: true, bezeichnung: 'Sonderposition' })],
      'klagenfurt',
    );
    expect(p.datentyp).toBe('3');
    expect(p.artikelnummer).toBe('TEXT');
    expect(p.bezeichnung).toBe('Sonderposition');
  });

  it('folds serials into the Bezeichnung while keeping Menge numeric', () => {
    const [p] = deliveryNoteToBelegPositions(
      [item({ quantity: 4, serialNumbers: ['A1', 'A2', 'A3', 'A4'] })],
      'klagenfurt',
    );
    expect(p.menge).toBe(4);
    expect(p.bezeichnung).toBe('4x Sunmi L3 A1, A2, A3, A4');
  });

  it('skips zero-quantity lines', () => {
    expect(deliveryNoteToBelegPositions([item({ quantity: 0 })], 'klagenfurt')).toEqual([]);
  });

  it('maps several items in order', () => {
    const out = deliveryNoteToBelegPositions(
      [
        item({ id: 'a', bezeichnung: 'A', mesonicArtikelNr: 'ART-A' }),
        item({ id: 'b', bezeichnung: 'B', mesonicArtikelNr: null, isFreetext: true }),
      ],
      'klagenfurt',
    );
    expect(out.map((p) => p.artikelnummer)).toEqual(['ART-AKL', 'TEXT']);
  });
});
