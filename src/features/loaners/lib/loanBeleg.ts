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

// Ein Gerät → eine TEXT-Zeile inkl. Leihzeitraum.
function bezeichnungFor(loan: LoanForBeleg, device: DeviceForBeleg): string {
  const ret = loan.expectedReturn ? `, Rückgabe geplant ${loan.expectedReturn}` : '';
  return `Leihstellung: ${device.bezeichnung} SN ${device.serialNumber} — Leihbeginn ${loan.startedAt}${ret}`;
}

// Alle Geräte einer Leihstellung → TEXT-Positionen.
export function loanToBelegPositions(loan: LoanForBeleg, devices: DeviceForBeleg[]): AngebotPosition[] {
  return devices.map((d) => ({
    artikelnummer: 'TEXT',
    datentyp: '3' as const,
    menge: 1,
    einzelpreis: 0,
    bezeichnung: bezeichnungFor(loan, d),
  }));
}

// Voller WEBAngebot-Import-Envelope für die Leih-Lieferschein. Belegart 19
// (standortübergreifend). datumAngebot = Leihbeginn.
export function buildLoanBelegXml(
  loan: LoanForBeleg,
  devices: DeviceForBeleg[],
  laufnummer: string | number,
): string {
  return buildAngebotImportXml(
    {
      kontonummer: loan.customerKdnr,
      laufnummer,
      datumAngebot: loan.startedAt,
      belegart: LIEFERSCHEIN_BELEGART.klagenfurt, // '19', beide Standorte gleich
    },
    loanToBelegPositions(loan, devices),
  );
}
