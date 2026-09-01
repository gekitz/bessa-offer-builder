// Plant den Mesonic-Export eines Tickets: aus den Reparaturschein-Abrechnungen
// (BillingPosition[]) je Schein einen WEBAngebot-Beleg (Belegart 12/16). Rein &
// testbar — die eigentlichen Mesonic-Calls (Laufnummer lesen, Beleg anlegen,
// Key speichern) macht der Orchestrator (ticketBelegExport). Siehe
// docs/ticket-mesonic-verrechnung.md.

import { buildAngebotImportXml, REPARATUR_BELEGART } from '../../offers/lib/angebotImport';
import { repairOrderToBelegPositions, type EmployeeMesonic, type MesonicStandort } from './repairOrderBeleg';
import type { RepairOrderBilling } from '../types';

export interface OrderForExport {
  billing: RepairOrderBilling;
  alreadyExportedKey: string | null; // repair_orders.mesonic_beleg_key — gesetzt = schon exportiert
}

export interface PlanOpts {
  konto: string;                          // ticket.mesonic_customer_id (WinLine-Konto)
  ticketStandort: MesonicStandort;        // → Belegart (12/16) + Pseudoartikel-Suffix
  startLaufnummer: number;                // höchste bestehende Laufnummer des Kontos + 1
  employeeMesonic: Map<string, EmployeeMesonic>;
  kopfVertreternummer?: string | number;  // verantwortlicher Rep am Beleg-Kopf (Ticket-Assignee)
}

export interface PlannedBeleg {
  repairOrderId: string;
  seqNumber: number;
  laufnummer: number;
  belegKey: string;   // `${konto}-${laufnummer}`
  xml: string;        // fertiger WEBAngebot-Envelope
}

export type SkipReason = 'already_exported' | 'empty';

export interface TicketBelegPlan {
  toCreate: PlannedBeleg[];
  skipped: { repairOrderId: string; reason: SkipReason; belegKey?: string }[];
}

// Vergibt Laufnummern fortlaufend ab startLaufnummer NUR für tatsächlich zu
// erstellende Belege (übersprungene verbrauchen keine Nummer). Idempotent:
// bereits exportierte Scheine (alreadyExportedKey) und leere Scheine (keine
// Positionen) werden übersprungen.
export function planTicketBelege(orders: OrderForExport[], opts: PlanOpts): TicketBelegPlan {
  const belegart = REPARATUR_BELEGART[opts.ticketStandort];
  const toCreate: PlannedBeleg[] = [];
  const skipped: TicketBelegPlan['skipped'] = [];
  let lauf = opts.startLaufnummer;

  for (const o of orders) {
    if (o.alreadyExportedKey) {
      skipped.push({ repairOrderId: o.billing.repairOrderId, reason: 'already_exported', belegKey: o.alreadyExportedKey });
      continue;
    }
    const positions = repairOrderToBelegPositions(o.billing, {
      ticketStandort: opts.ticketStandort,
      employeeMesonic: opts.employeeMesonic,
    });
    if (positions.length === 0) {
      skipped.push({ repairOrderId: o.billing.repairOrderId, reason: 'empty' });
      continue;
    }
    const laufnummer = lauf++;
    const belegKey = `${opts.konto}-${laufnummer}`;
    const xml = buildAngebotImportXml(
      {
        kontonummer: opts.konto,
        laufnummer,
        datumAngebot: o.billing.performedAt,
        belegart,
        vertreternummer: opts.kopfVertreternummer,
      },
      positions,
    );
    toCreate.push({ repairOrderId: o.billing.repairOrderId, seqNumber: o.billing.seqNumber, laufnummer, belegKey, xml });
  }

  return { toCreate, skipped };
}
