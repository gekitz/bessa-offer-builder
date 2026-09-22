// Plant den Mesonic-Export der Lieferscheine eines Tickets: je Lieferschein
// einen WEBAngebot-Beleg (Belegart 19). Rein & testbar — die echten Mesonic-
// Calls macht der Orchestrator (ticketBelegExport). Spiegelt ticketBelegPlan.
// Siehe docs/ticket-lieferschein.md.

import { buildAngebotImportXml, LIEFERSCHEIN_BELEGART } from '../../offers/lib/angebotImport';
import { deliveryNoteToBelegPositions } from './deliveryNoteBeleg';
import type { MesonicStandort } from './repairOrderBeleg';
import type { DeliveryNote, DeliveryNoteItem } from '../types';

export interface DeliveryNoteForExport {
  deliveryNote: DeliveryNote;
  items: DeliveryNoteItem[];
  alreadyExportedKey: string | null; // delivery_notes.mesonic_beleg_key — gesetzt = schon exportiert
}

export interface DeliveryPlanOpts {
  konto: string;
  ticketStandort: MesonicStandort;   // Belegart 19 standortübergreifend, ABER treibt die KL/WO-Ausprägung der Artikelnummern (Lagerbuchung)
  startLaufnummer: number;           // teilt sich die Sequenz mit den Reparaturschein-Belegen
  kopfVertreternummer?: string | number;
}

export interface PlannedDeliveryBeleg {
  deliveryNoteId: string;
  seqNumber: number;
  laufnummer: number;
  belegKey: string;   // `${konto}-${laufnummer}`
  xml: string;
}

export type DeliverySkipReason = 'already_exported' | 'empty' | 'cancelled';

export interface DeliveryNoteBelegPlan {
  toCreate: PlannedDeliveryBeleg[];
  skipped: { deliveryNoteId: string; reason: DeliverySkipReason; belegKey?: string }[];
}

// Vergibt Laufnummern fortlaufend ab startLaufnummer NUR für tatsächlich zu
// erstellende Belege. Idempotent: bereits exportierte (alreadyExportedKey),
// stornierte und leere Lieferscheine werden übersprungen. Anders als beim
// Reparaturschein gibt es KEINEN Unterschrift-Filter — alle nicht-stornierten
// gehen über (fixiert mit Georg).
export function planDeliveryNoteBelege(
  notes: DeliveryNoteForExport[],
  opts: DeliveryPlanOpts,
): DeliveryNoteBelegPlan {
  const belegart = LIEFERSCHEIN_BELEGART[opts.ticketStandort];
  const toCreate: PlannedDeliveryBeleg[] = [];
  const skipped: DeliveryNoteBelegPlan['skipped'] = [];
  let lauf = opts.startLaufnummer;

  for (const n of notes) {
    if (n.deliveryNote.status === 'cancelled') {
      skipped.push({ deliveryNoteId: n.deliveryNote.id, reason: 'cancelled' });
      continue;
    }
    if (n.alreadyExportedKey) {
      skipped.push({ deliveryNoteId: n.deliveryNote.id, reason: 'already_exported', belegKey: n.alreadyExportedKey });
      continue;
    }
    const positions = deliveryNoteToBelegPositions(n.items, opts.ticketStandort);
    if (positions.length === 0) {
      skipped.push({ deliveryNoteId: n.deliveryNote.id, reason: 'empty' });
      continue;
    }
    const laufnummer = lauf++;
    const belegKey = `${opts.konto}-${laufnummer}`;
    const xml = buildAngebotImportXml(
      {
        kontonummer: opts.konto,
        laufnummer,
        datumAngebot: n.deliveryNote.performedAt,
        belegart,
        vertreternummer: opts.kopfVertreternummer,
      },
      positions,
    );
    toCreate.push({ deliveryNoteId: n.deliveryNote.id, seqNumber: n.deliveryNote.seqNumber, laufnummer, belegKey, xml });
  }

  return { toCreate, skipped };
}
