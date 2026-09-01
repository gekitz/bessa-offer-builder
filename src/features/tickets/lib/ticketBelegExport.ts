// Orchestriert den Mesonic-Export eines Tickets: nächste Laufnummer lesen →
// Belege planen (ticketBelegPlan) → je Beleg importieren → Key speichern.
// Die drei Mesonic-/DB-Berührungen sind als Dependencies injiziert, damit der
// Ablauf (Reihenfolge, Teil-Erfolg, Idempotenz) rein testbar bleibt.
// Siehe docs/ticket-mesonic-verrechnung.md.

import { planTicketBelege, type OrderForExport, type SkipReason } from './ticketBelegPlan';
import type { EmployeeMesonic, MesonicStandort } from './repairOrderBeleg';

export interface ExportInput {
  konto: string;                          // ticket.mesonic_customer_id
  ticketStandort: MesonicStandort;
  orders: OrderForExport[];
  employeeMesonic: Map<string, EmployeeMesonic>;
  kopfVertreternummer?: string | number;
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
}

export interface ExportResult {
  created: { repairOrderId: string; seqNumber: number; belegKey: string }[];
  skipped: { repairOrderId: string; reason: SkipReason; belegKey?: string }[];
  failed: { repairOrderId: string; seqNumber: number; laufnummer: number; error: string }[];
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
    } catch (e) {
      failed.push({ repairOrderId: b.repairOrderId, seqNumber: b.seqNumber, laufnummer: b.laufnummer, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { created, skipped: plan.skipped, failed };
}
