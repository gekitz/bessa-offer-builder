// Impure Verdrahtung des Leih-Lieferschein-Exports (Belegart 19). Reine Logik
// steckt in loanBeleg.ts; hier nur die echten Mesonic-/DB-Aufrufe. Die
// Laufnummer-Lese- und Beleg-Anlege-Primitive werden mit dem Reparaturschein-
// Export geteilt (readMaxLaufnummer / importBeleg). Best-effort und idempotent:
// eine bereits exportierte Leihstellung (mesonicBelegKey gesetzt) wird
// übersprungen. Wirft nie — der Aufrufer feuert fire-and-forget nach dem
// Check-out. Siehe docs/leihstellungen.md.

import { readMaxLaufnummer, importBeleg } from '../../tickets/lib/runTicketBelegExport';
import { setLoanBelegExport, getLoanWithDevices } from '../api/loanerApi';
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

// Re-export a loan's Leih-Lieferschein after devices were appended to it (the
// check-out guardrail path). Re-fetches the loan's FULL device set in stable
// line order, then:
//   • has a Beleg already (mesonicBelegKey + Laufnummer) → EDIT it (option="3")
//     under the SAME Laufnummer, resending all lines. WinLine matches existing
//     lines by Zeilennummerintern and only adds the appended ones.
//   • no Beleg yet (the check-out fire-and-forget never landed) → fall back to a
//     normal CREATE via exportLoanBeleg.
// Best-effort, never throws — the DB append already happened; the caller fires
// this fire-and-forget, mirroring the check-out path.
//
// UNVERIFIZIERT gegen Live-Mesonic (option="3"-Edit): setzt voraus, dass die
// Vorlage WEBAngebot das Feld "Zeilennummerintern" trägt (Heri 2026-09) und dass
// der ursprüngliche Create dieselben Zeilennummern gesendet hat. Go-forward
// sicher (jeder neue Check-out sendet 1..N). Bei ALTBELEGEN, die noch OHNE
// Zeilennummerintern angelegt wurden, kann ein Edit Zeilen doppeln statt matchen
// — vor Scharfschaltung einmal live prüfen. Da es reine TEXT-Zeilen (Datentyp 3,
// Preis 0, keine Lagerbuchung) sind, ist eine Zeilennummer-Vertauschung unter
// bestehenden Zeilen inhaltlich folgenlos.
export async function reexportLoanBeleg(loanId: string): Promise<LoanBelegResult> {
  try {
    const full = await getLoanWithDevices(loanId);
    if (!full) return { ok: false, error: 'Leihstellung nicht gefunden.' };
    const { loan, devices } = full;
    if (!loan.customerKdnr) return { ok: false, error: 'Kein WinLine-Konto (Kd.-Nr.) an der Leihstellung.' };
    if (devices.length === 0) return { ok: false, error: 'Keine Geräte für den Leih-Lieferschein.' };

    // Kein bestehender Beleg → normaler Create (deckt auch den Fall ab, dass der
    // Check-out-Export nie ankam). exportLoanBeleg ist idempotent-geschützt.
    if (!loan.mesonicBelegKey || loan.mesonicBelegLaufnummer == null) {
      return exportLoanBeleg(loan, devices);
    }

    const laufnummer = loan.mesonicBelegLaufnummer;
    const xml = buildLoanBelegXml(loan, devices, laufnummer, { option: '3' });
    const res = await importBeleg(xml, { option: 3 });
    if (!res.ok) return { ok: false, error: res.error ?? 'Import fehlgeschlagen' };
    return { ok: true, belegKey: loan.mesonicBelegKey, laufnummer };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
