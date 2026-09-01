// Reparaturschein-Abrechnung → WinLine-Angebot-Positionen (Belegart 12/16).
//
// Reiner Datentransform, keine Supabase-/Netzwerk-Aufrufe — die Mesonic-Mechanik
// (Envelope, XSD-Reihenfolge, Belegart) steckt in offers/lib/angebotImport.ts,
// die live verifiziert ist. Siehe docs/ticket-mesonic-verrechnung.md.
//
// Mapping (fixiert mit Georg/Heri):
//   labor / travel_wegzeit / travel_km → Mitarbeiter-Artikel 30000XX{WO/KL}
//       (XX = Vertreternummer des Entry-Mitarbeiters, Suffix = dessen
//        HEIMAT-Standort — der Artikel ist eine feste Eigenschaft des Technikers)
//   travel_flat                        → Zonen-Artikel (31000xxx, echte Nr.)
//   material                           → echte Artikelnummer
//   service_flat / adjustment          → Pseudoartikel 99991234{KL/WO}
//                                        (Suffix = TICKET-Standort)
// Belegart (12/16) folgt ebenfalls dem Ticket-Standort — das passiert im Kopf
// (buildAngebotImportXml), nicht hier.

import { PSEUDO_ARTIKEL, laborArtikelnummer, type AngebotPosition } from '../../offers/lib/angebotImport';
import type { RepairOrderBilling } from '../types';

export type MesonicStandort = 'klagenfurt' | 'wolfsberg';

// standorte-Seed (create_workforce.sql): 1 = Klagenfurt, 2 = Wolfsberg.
export function standortFromId(id: number | null | undefined): MesonicStandort {
  return id === 2 ? 'wolfsberg' : 'klagenfurt';
}

export interface EmployeeMesonic {
  vertreternummer: string;   // employees.mesonic_rep_id
  standort: MesonicStandort; // employees.standort_id → treibt WO/KL am Arbeitszeit-Artikel
}

export interface BuildBelegOpts {
  ticketStandort: MesonicStandort;              // → Belegart + Pseudoartikel-Suffix
  employeeMesonic: Map<string, EmployeeMesonic>; // repair_order_entries.employee_id → Mapping
}

// Eine Reparaturschein-Abrechnung (BillingPosition[]) → Angebot-Positionen.
// Wirft, wenn eine Arbeits-/Reise-Position keinen Mitarbeiter-Mapping hat —
// ohne Vertreternummer lässt sich der Arbeitszeit-Artikel nicht bilden.
export function repairOrderToBelegPositions(
  billing: RepairOrderBilling,
  opts: BuildBelegOpts,
): AngebotPosition[] {
  const pseudo = PSEUDO_ARTIKEL[opts.ticketStandort];
  const out: AngebotPosition[] = [];

  for (const p of billing.positions) {
    const base = {
      datentyp: '1' as const,
      menge: p.quantity,
      einzelpreis: p.unitPrice,
      bezeichnung: p.label,
    };

    let artikelnummer: string;
    switch (p.kind) {
      case 'labor':
      case 'travel_wegzeit':
      case 'travel_km': {
        const emp = p.employeeId ? opts.employeeMesonic.get(p.employeeId) : undefined;
        if (!emp?.vertreternummer) {
          throw new Error(
            `Keine Vertreternummer für ${p.employeeName ?? p.employeeId ?? 'unbekannt'} `
            + `(Reparaturschein #${billing.seqNumber}: ${p.label})`,
          );
        }
        artikelnummer = laborArtikelnummer(emp.vertreternummer, emp.standort);
        break;
      }
      case 'travel_flat':
      case 'material':
        // Zonen-/echter Artikel; Pseudo nur als Sicherheitsnetz, wenn keine Nr.
        artikelnummer = p.mesonicArtikelNr || pseudo;
        break;
      case 'service_flat':
      case 'adjustment':
        artikelnummer = pseudo;
        break;
      default:
        continue;
    }

    out.push({ ...base, artikelnummer });
  }

  return out;
}
