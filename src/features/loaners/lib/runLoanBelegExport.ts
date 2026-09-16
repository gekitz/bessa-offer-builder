// Impure Verdrahtung des Leih-Lieferschein-Exports (Belegart 19). Reine Logik
// steckt in loanBeleg.ts; hier nur die echten Mesonic-/DB-Aufrufe. Die
// Laufnummer-Lese- und Beleg-Anlege-Primitive werden mit dem Reparaturschein-
// Export geteilt (readMaxLaufnummer / importBeleg). Best-effort und idempotent:
// eine bereits exportierte Leihstellung (mesonicBelegKey gesetzt) wird
// übersprungen. Wirft nie — der Aufrufer feuert fire-and-forget nach dem
// Check-out. Siehe docs/leihstellungen.md.

import { readMaxLaufnummer, importBeleg } from '../../tickets/lib/runTicketBelegExport';
import { setLoanBelegExport } from '../api/loanerApi';
import { buildLoanBelegXml, loanBelegKey } from './loanBeleg';
import type { Loan, LoanerDevice } from '../types';

export interface LoanBelegResult {
  ok: boolean;
  belegKey?: string;
  laufnummer?: number;
  error?: string;
  skipped?: boolean;
}

export async function exportLoanBeleg(loan: Loan, devices: LoanerDevice[]): Promise<LoanBelegResult> {
  if (loan.mesonicBelegKey) return { ok: true, belegKey: loan.mesonicBelegKey, skipped: true };
  if (!loan.customerKdnr) return { ok: false, error: 'Kein WinLine-Konto (Kd.-Nr.) an der Leihstellung.' };
  if (devices.length === 0) return { ok: false, error: 'Keine Geräte für den Leih-Lieferschein.' };

  try {
    const max = await readMaxLaufnummer(loan.customerKdnr);
    const laufnummer = max + 1;
    const xml = buildLoanBelegXml(loan, devices, laufnummer);
    const res = await importBeleg(xml);
    if (!res.ok) return { ok: false, error: res.error ?? 'Import fehlgeschlagen' };
    // Der von uns vergebene Laufnummer-Anker (wie beim Rep-/Lieferschein) — nicht
    // die zurückgemeldete VoucherNumber — bildet den Beleg-Key.
    const key = loanBelegKey(loan.customerKdnr, laufnummer);
    await setLoanBelegExport(loan.id, laufnummer, key);
    return { ok: true, belegKey: key, laufnummer };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
