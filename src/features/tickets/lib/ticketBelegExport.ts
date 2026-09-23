// Orchestriert den Mesonic-Export eines Tickets: nächste Laufnummer lesen →
// Belege planen (ticketBelegPlan) → je Beleg importieren → Key speichern.
// Die drei Mesonic-/DB-Berührungen sind als Dependencies injiziert, damit der
// Ablauf (Reihenfolge, Teil-Erfolg, Idempotenz) rein testbar bleibt.
// Siehe docs/ticket-mesonic-verrechnung.md.

import { planTicketBelege, type OrderForExport, type SkipReason } from './ticketBelegPlan';
import {
  planDeliveryNoteBelege,
  type DeliveryNoteForExport,
  type DeliverySkipReason,
} from './deliveryNoteBelegPlan';
import type { EmployeeMesonic, MesonicStandort } from './repairOrderBeleg';

export interface ExportInput {
  konto: string;                          // ticket.mesonic_customer_id
  ticketStandort: MesonicStandort;
  orders: OrderForExport[];
  employeeMesonic: Map<string, EmployeeMesonic>;
  kopfVertreternummer?: string | number;
  // Abweichender Rechnungsempfänger des Kontos (WinLine „Konto Rechnungsadresse“).
  // Landet auf jedem Beleg-Kopf (Rep-Schein + Lieferschein), damit Faktura + OP
  // auf das richtige Konto laufen. Leer, wenn das Konto selbst verrechnet wird.
  kontoRechnungsadresse?: string;
  // Angebot-Arbeitszeit-Untergrenze: die synthetische labor_floor-Position ist
  // bereits in die billing.positions des letzten NEUEN Scheins gemischt
  // (loadTicketBelegExport). Nach erfolgreichem Anlegen genau dieses Scheins
  // wird die kumulierte Floor-Minutenzahl am Ticket hochgezählt, damit ein
  // späterer Teil-Export nicht doppelt aufschlägt. Fehlt, wenn kein Floor
  // greift (kein Angebot / bereits erfüllt / kein neuer Schein).
  floorCommit?: { ticketId: string; repairOrderId: string; minutes: number };
  // Lieferscheine des Tickets (gelieferte Ware, Belegart 19). Optional — leer
  // wenn keine vorhanden. Teilen sich die Laufnummer-Sequenz des Kontos mit den
  // Reparaturschein-Belegen (siehe unten). Siehe docs/ticket-lieferschein.md.
  deliveryNotes?: DeliveryNoteForExport[];
}

export interface ExportDeps {
  // Höchste bereits vergebene Laufnummer des Kontos (0 wenn keine). Nächster
  // Beleg = max + 1. UNVERIFIZIERT gegen Live-Mesonic — vor Scharfschaltung
  // mit frischer Session prüfen.
  readMaxLaufnummer: (konto: string) => Promise<number>;
  // Legt EINEN Beleg an (ActionCode 1). ok=false + error bei WinLine-Fehler.
  importBeleg: (xml: string) => Promise<{ ok: boolean; voucherNumber?: number; error?: string }>;
  // Persistiert Laufnummer + Key auf dem Reparaturschein (Idempotenz-Anker).
  persistKey: (repairOrderId: string, laufnummer: number, key: string) => Promise<void>;
  // Zählt die kumulierte Floor-Minutenzahl am Ticket hoch (Angebot-Arbeits-
  // zeit-Untergrenze). Wird nur im Erfolgspfad des Floor-tragenden Scheins
  // aufgerufen. Optional — Tests ohne Floor brauchen sie nicht.
  persistFloorTally?: (ticketId: string, addMinutes: number) => Promise<void>;
  // Persistiert Laufnummer + Key auf dem Lieferschein (Idempotenz-Anker).
  // Erforderlich, sobald input.deliveryNotes gesetzt ist.
  persistDeliveryKey?: (deliveryNoteId: string, laufnummer: number, key: string) => Promise<void>;
}

export interface ExportResult {
  created: { repairOrderId: string; seqNumber: number; belegKey: string }[];
  skipped: { repairOrderId: string; reason: SkipReason; belegKey?: string }[];
  failed: { repairOrderId: string; seqNumber: number; laufnummer: number; error: string }[];
  // Lieferschein-Belege (Belegart 19), analog zu den Reparaturschein-Feldern.
  deliveryCreated: { deliveryNoteId: string; seqNumber: number; belegKey: string }[];
  deliverySkipped: { deliveryNoteId: string; reason: DeliverySkipReason; belegKey?: string }[];
  deliveryFailed: { deliveryNoteId: string; seqNumber: number; laufnummer: number; error: string }[];
}

export async function exportTicketBelege(input: ExportInput, deps: ExportDeps): Promise<ExportResult> {
  if (!input.konto) {
    throw new Error('Kein WinLine-Konto am Ticket hinterlegt — Kunde erst mit WinLine verknüpfen.');
  }

  const max = await deps.readMaxLaufnummer(input.konto);
  const plan = planTicketBelege(input.orders, {
    konto: input.konto,
    ticketStandort: input.ticketStandort,
    startLaufnummer: max + 1,
    employeeMesonic: input.employeeMesonic,
    kopfVertreternummer: input.kopfVertreternummer,
    kontoRechnungsadresse: input.kontoRechnungsadresse,
  });

  const created: ExportResult['created'] = [];
  const failed: ExportResult['failed'] = [];

  // Sequenziell: die Laufnummern sind fortlaufend vergeben; ein Fehler lässt
  // eine Nummer als Lücke zurück (unkritisch) und bricht NICHT ab — die
  // übrigen Scheine werden trotzdem versucht. Beim erneuten Lauf holen sich
  // die fehlgeschlagenen Scheine über readMaxLaufnummer frische Nummern
  // (die bereits erstellten tragen dann einen Key und werden übersprungen).
  for (const b of plan.toCreate) {
    try {
      const res = await deps.importBeleg(b.xml);
      if (!res.ok) {
        failed.push({ repairOrderId: b.repairOrderId, seqNumber: b.seqNumber, laufnummer: b.laufnummer, error: res.error ?? 'Import fehlgeschlagen' });
        continue;
      }
      await deps.persistKey(b.repairOrderId, b.laufnummer, b.belegKey);
      created.push({ repairOrderId: b.repairOrderId, seqNumber: b.seqNumber, belegKey: b.belegKey });
      // Floor-Tally erst NACH erfolgreichem Anlegen des Floor-tragenden
      // Scheins hochzählen — schlägt der Export fehl, bleibt die Untergrenze
      // offen und der nächste Lauf holt sie nach.
      if (input.floorCommit && input.floorCommit.repairOrderId === b.repairOrderId && input.floorCommit.minutes > 0) {
        if (deps.persistFloorTally) {
          await deps.persistFloorTally(input.floorCommit.ticketId, input.floorCommit.minutes);
        }
      }
    } catch (e) {
      failed.push({ repairOrderId: b.repairOrderId, seqNumber: b.seqNumber, laufnummer: b.laufnummer, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── Lieferscheine (Belegart 19) ──────────────────────────────────────
  // Die Laufnummern teilen sich die Konto-Sequenz mit den Reparaturscheinen:
  // sie starten NACH der höchsten für Reparaturscheine reservierten Nummer
  // (max + Anzahl der zu erstellenden Rep-Belege), damit nichts kollidiert.
  // Fehlgeschlagene Rep-Belege hinterlassen nur eine (unkritische) Lücke.
  const deliveryCreated: ExportResult['deliveryCreated'] = [];
  const deliveryFailed: ExportResult['deliveryFailed'] = [];
  let deliverySkipped: ExportResult['deliverySkipped'] = [];

  if (input.deliveryNotes && input.deliveryNotes.length > 0) {
    const dplan = planDeliveryNoteBelege(input.deliveryNotes, {
      konto: input.konto,
      ticketStandort: input.ticketStandort,
      startLaufnummer: max + 1 + plan.toCreate.length,
      kopfVertreternummer: input.kopfVertreternummer,
      kontoRechnungsadresse: input.kontoRechnungsadresse,
    });
    deliverySkipped = dplan.skipped;

    for (const b of dplan.toCreate) {
      try {
        const res = await deps.importBeleg(b.xml);
        if (!res.ok) {
          deliveryFailed.push({ deliveryNoteId: b.deliveryNoteId, seqNumber: b.seqNumber, laufnummer: b.laufnummer, error: res.error ?? 'Import fehlgeschlagen' });
          continue;
        }
        if (deps.persistDeliveryKey) {
          await deps.persistDeliveryKey(b.deliveryNoteId, b.laufnummer, b.belegKey);
        }
        deliveryCreated.push({ deliveryNoteId: b.deliveryNoteId, seqNumber: b.seqNumber, belegKey: b.belegKey });
      } catch (e) {
        deliveryFailed.push({ deliveryNoteId: b.deliveryNoteId, seqNumber: b.seqNumber, laufnummer: b.laufnummer, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return { created, skipped: plan.skipped, failed, deliveryCreated, deliverySkipped, deliveryFailed };
}
