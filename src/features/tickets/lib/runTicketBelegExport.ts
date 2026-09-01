// Impure Verdrahtung des Reparaturschein-Exports: die drei Mesonic-/DB-
// Dependencies für exportTicketBelege + ein End-to-End-Runner. Alles Testbare
// steckt in ticketBelegExport/ticketBelegPlan/repairOrderBeleg; hier nur die
// echten Aufrufe. Siehe docs/ticket-mesonic-verrechnung.md.

import { fetchCustomerBelege } from '../../viertl/lib/mesonicBelege';
import { mesonicImport, TYPES } from '../../../lib/mesonicApi';
import { loadTicketBelegExport, setRepairOrderBelegExport } from '../api/ticketApi';
import { exportTicketBelege, type ExportResult } from './ticketBelegExport';

// Höchste bereits vergebene Laufnummer eines Kontos. Scannt <konto>-<n>
// (fetchCustomerBelege bricht nach einem leeren 25er-Batch ab, da die
// Nummern fortlaufend sind) → nächster Beleg = max + 1.
// Live verifiziert 2026-09-01 (Konto 272765: real 1..25 → next 26).
export async function readMaxLaufnummer(konto: string): Promise<number> {
  const { belege } = await fetchCustomerBelege(konto, { max: 1000, delayMs: 150 });
  return belege.reduce((m, b) => Math.max(m, Number(b.laufnummer) || 0), 0);
}

// Legt EINEN WEBAngebot-Beleg an (ActionCode 1). mesonicImport parst bereits
// OverallSuccess/ErrorText; hier zusätzlich die VoucherNumber (= Laufnummer).
export async function importBeleg(xml: string): Promise<{ ok: boolean; voucherNumber?: number; error?: string }> {
  const res = await mesonicImport(TYPES.BELEG, 'WEBAngebot', xml, { actionCode: 1 });
  if (!res.success) return { ok: false, error: res.error };
  const vn = (res.raw || '').match(/<VoucherNumber>(\d+)<\/VoucherNumber>/);
  return { ok: true, voucherNumber: vn ? Number(vn[1]) : undefined };
}

// End-to-End: Export-Daten laden → Belege orchestriert anlegen → Ergebnis.
export async function runTicketBelegExport(ticketId: string): Promise<ExportResult & { ticketNumber: string }> {
  const input = await loadTicketBelegExport(ticketId);
  const result = await exportTicketBelege(input, {
    readMaxLaufnummer,
    importBeleg,
    persistKey: setRepairOrderBelegExport,
  });
  return { ...result, ticketNumber: input.ticketNumber };
}
