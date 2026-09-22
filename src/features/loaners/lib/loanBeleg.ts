// Leihstellung → WinLine-Lieferschein (Belegart 19). Reiner Datentransform,
// keine Supabase-/Netzwerk-Aufrufe — die Mesonic-Mechanik (Envelope, XSD-
// Reihenfolge) steckt in offers/lib/angebotImport.ts.
//
// Mapping (fixiert mit Georg):
//   JEDES Gerät → eine TEXT-Position (Datentyp 3, Artikelnummer 'TEXT'),
//   Menge 1, Einzelpreis 0 (Leihe wird nicht verrechnet). Standortunabhängig,
//   da reine Freitext-Zeilen keinen KL/WO-Artikel auflösen. Konto = Kd.-Nr.
//   des Bestandskunden. Siehe docs/leihstellungen.md.

import {
  buildAngebotImportXml,
  LIEFERSCHEIN_BELEGART,
  type AngebotPosition,
} from '../../offers/lib/angebotImport';
import type { Loan, LoanerDevice } from '../types';

type LoanForBeleg = Pick<Loan, 'customerKdnr' | 'startedAt' | 'expectedReturn'>;
type DeviceForBeleg = Pick<LoanerDevice, 'bezeichnung' | 'serialNumber'>;

// Beleg-Key = <konto>-<laufnummer>, der Idempotenz-Anker (analog Rep-/Lieferschein).
export function loanBelegKey(konto: string, laufnummer: string | number): string {
  return `${konto}-${laufnummer}`;
}

// Kopfzeile: der Leihzeitraum EINMAL — nicht je Gerät wiederholt. "bis offen",
// solange keine Rückgabe erwartet wird.
function headerBezeichnung(loan: LoanForBeleg): string {
  return `Leihstellung: Von ${loan.startedAt} bis ${loan.expectedReturn ?? 'offen'}`;
}

// Gerätezeile: nur Bezeichnung + Seriennummer (der Zeitraum steht in der
// Kopfzeile, siehe headerBezeichnung).
function deviceBezeichnung(device: DeviceForBeleg): string {
  return `${device.bezeichnung} SN ${device.serialNumber}`;
}

// Eine Leihstellung → EINE Kopf-TEXT-Zeile (Leihzeitraum) + je Gerät eine
// TEXT-Zeile (Bezeichnung + SN). Alles Datentyp 3, Menge 1, Preis 0. Die interne
// Zeilennummer läuft 1..N+1 (Kopf = 1, Geräte = 2..N+1) in stabiler Reihenfolge —
// der Aufrufer MUSS die Geräte stabil (loan_devices created_at) liefern, damit
// ein späteres Edit (option="3") bestehende Zeilen an derselben Nummer
// wiederfindet und angehängte Geräte nur ergänzt.
export function loanToBelegPositions(loan: LoanForBeleg, devices: DeviceForBeleg[]): AngebotPosition[] {
  const textPos = (bezeichnung: string, lineNo: number): AngebotPosition => ({
    artikelnummer: 'TEXT',
    datentyp: '3' as const,
    menge: 1,
    einzelpreis: 0,
    bezeichnung,
    zeilennummerintern: lineNo,
  });
  return [
    textPos(headerBezeichnung(loan), 1),
    ...devices.map((d, i) => textPos(deviceBezeichnung(d), i + 2)),
  ];
}

// Voller WEBAngebot-Import-Envelope für die Leih-Lieferschein. Belegart 19
// (standortübergreifend). datumAngebot = Leihbeginn. option: '0' = neuen Beleg
// anlegen (Default), '3' = bestehenden Beleg editieren (angehängte Geräte).
export function buildLoanBelegXml(
  loan: LoanForBeleg,
  devices: DeviceForBeleg[],
  laufnummer: string | number,
  opts: { option?: string } = {},
): string {
  return buildAngebotImportXml(
    {
      kontonummer: loan.customerKdnr,
      laufnummer,
      datumAngebot: loan.startedAt,
      belegart: LIEFERSCHEIN_BELEGART.klagenfurt, // '19', beide Standorte gleich
    },
    loanToBelegPositions(loan, devices),
    { option: opts.option },
  );
}
