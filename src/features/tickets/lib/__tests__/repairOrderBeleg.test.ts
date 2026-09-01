import { describe, it, expect } from 'vitest';
import { repairOrderToBelegPositions, standortFromId, type EmployeeMesonic } from '../repairOrderBeleg';
import type { BillingPosition, RepairOrderBilling } from '../../types';

function pos(over: Partial<BillingPosition>): BillingPosition {
  return {
    kind: 'labor', label: 'x', quantity: 1, unit: 'h', unitPrice: 1, total: 1,
    repairOrderId: 'ro1', repairOrderSeq: 1, ...over,
  };
}

function billing(positions: BillingPosition[]): RepairOrderBilling {
  return {
    repairOrderId: 'ro1', seqNumber: 1, performedAt: '2026-09-01', signed: true,
    positions, laborTotal: 0, travelTotal: 0, materialTotal: 0, serviceTotal: 0,
    adjustmentTotal: 0, subtotal: 0,
  };
}

// Heri (V9) wohnt in Wolfsberg → Arbeits-Artikel …09WO, auch auf einem KL-Ticket.
const heri: EmployeeMesonic = { vertreternummer: '9', standort: 'wolfsberg' };
const employeeMesonic = new Map([['e-heri', heri]]);

describe('standortFromId', () => {
  it('1 = Klagenfurt, 2 = Wolfsberg, sonst KL', () => {
    expect(standortFromId(1)).toBe('klagenfurt');
    expect(standortFromId(2)).toBe('wolfsberg');
    expect(standortFromId(null)).toBe('klagenfurt');
  });
});

describe('repairOrderToBelegPositions', () => {
  it('labor/Wegzeit/km → Mitarbeiter-Artikel nach HEIMAT-Standort (…09WO auf KL-Ticket)', () => {
    const b = billing([
      pos({ kind: 'labor', label: 'Kassensysteme', quantity: 2, unitPrice: 118, employeeId: 'e-heri' }),
      pos({ kind: 'travel_wegzeit', label: 'Wegzeit', quantity: 0.5, unitPrice: 118, employeeId: 'e-heri' }),
      pos({ kind: 'travel_km', label: 'Anfahrt 12 km', quantity: 12, unitPrice: 0.57, employeeId: 'e-heri' }),
    ]);
    const out = repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic });
    expect(out.map((p) => p.artikelnummer)).toEqual(['30000009WO', '30000009WO', '30000009WO']);
    // Menge/Preis unverändert durchgereicht
    expect(out[0]).toMatchObject({ datentyp: '1', menge: 2, einzelpreis: 118, bezeichnung: 'Kassensysteme' });
    expect(out[2]).toMatchObject({ menge: 12, einzelpreis: 0.57 });
  });

  it('travel_flat → Zonen-Artikel, material → echte Artikelnummer', () => {
    const b = billing([
      pos({ kind: 'travel_flat', label: 'Anfahrt bis 10 km', quantity: 1, unitPrice: 84, mesonicArtikelNr: '31000002' }),
      pos({ kind: 'material', label: 'Switch', quantity: 1, unitPrice: 50, mesonicArtikelNr: '17008108' }),
    ]);
    const out = repairOrderToBelegPositions(b, { ticketStandort: 'wolfsberg', employeeMesonic });
    expect(out.map((p) => p.artikelnummer)).toEqual(['31000002', '17008108']);
  });

  it('service_flat + adjustment → Pseudoartikel nach TICKET-Standort', () => {
    const b = billing([
      pos({ kind: 'service_flat', label: 'Fernwartung', quantity: 1, unitPrice: 45, employeeId: 'e-heri' }),
      pos({ kind: 'adjustment', label: 'Kulanz-Gutschrift', quantity: 1, unitPrice: -20 }),
    ]);
    const kl = repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic });
    expect(kl.map((p) => p.artikelnummer)).toEqual(['99991234KL', '99991234KL']);
    expect(kl[1].einzelpreis).toBe(-20); // Gutschrift bleibt negativ

    const wo = repairOrderToBelegPositions(b, { ticketStandort: 'wolfsberg', employeeMesonic });
    expect(wo.map((p) => p.artikelnummer)).toEqual(['99991234WO', '99991234WO']);
  });

  it('wirft, wenn ein Arbeits-Mitarbeiter keine Vertreternummer hat', () => {
    const b = billing([pos({ kind: 'labor', label: 'Arbeit', employeeId: 'e-unknown', employeeName: 'Neuer Lehrling' })]);
    expect(() => repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic }))
      .toThrow(/Neuer Lehrling/);
  });
});
