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
    adjustmentTotal: 0, subtotal: 0, laborMinutes: 0,
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
  it('labor/Wegzeit → Mitarbeiter-Artikel, km → KM-Geld-Artikel, beide nach HEIMAT-Standort (WO auf KL-Ticket)', () => {
    const b = billing([
      pos({ kind: 'labor', label: 'Kassensysteme', quantity: 2, unitPrice: 118, employeeId: 'e-heri' }),
      pos({ kind: 'travel_wegzeit', label: 'Wegzeit', quantity: 0.5, unitPrice: 118, employeeId: 'e-heri' }),
      pos({ kind: 'travel_km', label: 'Anfahrt 12 km', quantity: 12, unitPrice: 0.57, employeeId: 'e-heri' }),
    ]);
    const out = repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic });
    // labor/Wegzeit über den Mitarbeiter-Artikel (STD), km über den eigenen
    // KM-Geld-Artikel (Einheit km) — beide mit Heris Heimat-Suffix WO.
    expect(out.map((p) => p.artikelnummer)).toEqual(['30000009WO', '30000009WO', '31100000WO']);
    // Menge/Preis unverändert durchgereicht
    expect(out[0]).toMatchObject({ datentyp: '1', menge: 2, einzelpreis: 118, bezeichnung: 'Kassensysteme' });
    expect(out[2]).toMatchObject({ datentyp: '1', menge: 12, einzelpreis: 0.57, bezeichnung: 'Anfahrt 12 km' });
  });

  it('travel_flat → Zonen-Artikel (kein Suffix), material → echter Artikel inkl. TICKET-Standort-Ausprägung', () => {
    const b = billing([
      pos({ kind: 'travel_flat', label: 'Anfahrt bis 10 km', quantity: 1, unitPrice: 84, mesonicArtikelNr: '31000002' }),
      pos({ kind: 'material', label: 'Switch', quantity: 1, unitPrice: 50, mesonicArtikelNr: '17008108' }),
    ]);
    const wo = repairOrderToBelegPositions(b, { ticketStandort: 'wolfsberg', employeeMesonic });
    // Zonen-Artikel bleibt ohne Suffix; Lagerartikel bekommt WO.
    expect(wo.map((p) => p.artikelnummer)).toEqual(['31000002', '17008108WO']);
    const kl = repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic });
    expect(kl.map((p) => p.artikelnummer)).toEqual(['31000002', '17008108KL']);
  });

  it('material: bereits suffixierte Artikelnummer wird auf den TICKET-Standort normalisiert', () => {
    const b = billing([pos({ kind: 'material', label: 'Switch', quantity: 1, unitPrice: 50, mesonicArtikelNr: '17008108KL' })]);
    const wo = repairOrderToBelegPositions(b, { ticketStandort: 'wolfsberg', employeeMesonic });
    expect(wo[0].artikelnummer).toBe('17008108WO');
  });

  it('material ohne Artikelnummer → Pseudoartikel (Sicherheitsnetz)', () => {
    const b = billing([pos({ kind: 'material', label: 'Diverses', quantity: 1, unitPrice: 5 })]);
    const kl = repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic });
    expect(kl[0].artikelnummer).toBe('99991234KL');
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

  it('labor_floor → Pseudoartikel nach TICKET-Standort (kein Mitarbeiter, wirft nicht)', () => {
    // Die synthetische Mindest-Arbeitszeit hat keinen employeeId — sie darf
    // NICHT über den Mitarbeiter-Artikel laufen (sonst würde der Export werfen).
    const b = billing([
      pos({ kind: 'labor_floor', label: 'Mindest-Arbeitszeit laut Angebot', quantity: 8, unitPrice: 118, total: 944 }),
    ]);
    const kl = repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic });
    expect(kl.map((p) => p.artikelnummer)).toEqual(['99991234KL']);
    expect(kl[0]).toMatchObject({ menge: 8, einzelpreis: 118, bezeichnung: 'Mindest-Arbeitszeit laut Angebot' });

    const wo = repairOrderToBelegPositions(b, { ticketStandort: 'wolfsberg', employeeMesonic });
    expect(wo[0].artikelnummer).toBe('99991234WO');
  });

  it('km → KM-Geld-Artikel folgt dem Heimat-Standort des Technikers (KL-Mitarbeiter → 31100000KL auf WO-Ticket)', () => {
    const employeeMesonicKl = new Map([['e-kl', { vertreternummer: '26', standort: 'klagenfurt' } as EmployeeMesonic]]);
    const b = billing([pos({ kind: 'travel_km', label: 'Anfahrt 20 km', quantity: 20, unitPrice: 0.57, employeeId: 'e-kl' })]);
    const out = repairOrderToBelegPositions(b, { ticketStandort: 'wolfsberg', employeeMesonic: employeeMesonicKl });
    expect(out[0].artikelnummer).toBe('31100000KL');
  });

  it('wirft, wenn ein Arbeits-Mitarbeiter keine Vertreternummer hat', () => {
    const b = billing([pos({ kind: 'labor', label: 'Arbeit', employeeId: 'e-unknown', employeeName: 'Neuer Lehrling' })]);
    expect(() => repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic }))
      .toThrow(/Neuer Lehrling/);
  });

  it('km wirft, wenn kein Mitarbeiter-Mapping für den Standort vorliegt', () => {
    const b = billing([pos({ kind: 'travel_km', label: 'Anfahrt 10 km', quantity: 10, unitPrice: 0.57, employeeId: 'e-unknown', employeeName: 'Neuer Lehrling' })]);
    expect(() => repairOrderToBelegPositions(b, { ticketStandort: 'klagenfurt', employeeMesonic }))
      .toThrow(/Neuer Lehrling/);
  });
});
