// Leihgeräte → WinLine CRM Aktion on check-in. A returned loaner files an
// internal note on the customer's Mesonic account. Pure/injected like
// ticketCrmNote.ts: the caller passes the mesonic import function so this
// stays unit-testable without Supabase or the mesonic-proxy.
// Siehe docs/leihstellungen.md.

import { buildCrmNoteXml, parseCrmKey, type CrmNoteFields } from '../../offers/lib/crmNoteImport';
import type { PostCrmNoteDeps, PostCrmNoteResult } from '../../tickets/lib/ticketCrmNote';
import type { Loan, LoanerDevice } from '../types';

// Same staff-notes workflow as tickets/offers (Heri, live).
export const LOAN_CRM_WORKFLOW = 10241;

// Build the WebCRM field set for a loaner return. Returns null when the loan
// has no Kd.-Nr. (should never happen — every loan requires a Bestandskunde).
export function buildLoanCheckInCrmFields(
  loan: Pick<Loan, 'customerKdnr' | 'startedAt'>,
  devices: Array<Pick<LoanerDevice, 'bezeichnung' | 'serialNumber'>>,
): CrmNoteFields | null {
  if (!loan.customerKdnr) return null;
  const list = devices.map((d) => `${d.bezeichnung} (SN ${d.serialNumber})`).join(', ');
  return {
    workflowNummer: LOAN_CRM_WORKFLOW,
    zeilennummer: 1,
    kundenkonto: loan.customerKdnr,
    kurzbeschreibung: 'Leihgerät Rückgabe',
    langbeschreibungIntern: `Rückgabe Leihgerät: ${list}\nLeihbeginn ${loan.startedAt}`,
  };
}

// Build + post the check-in CRM note. Never throws — a Mesonic failure/hang
// surfaces as { success:false } so the caller stays best-effort.
export async function postLoanCheckInCrmNote(
  loan: Pick<Loan, 'customerKdnr' | 'startedAt'>,
  devices: Array<Pick<LoanerDevice, 'bezeichnung' | 'serialNumber'>>,
  deps: PostCrmNoteDeps,
): Promise<PostCrmNoteResult> {
  const fields = buildLoanCheckInCrmFields(loan, devices);
  if (!fields) return { success: false, key: null, skipped: true };
  try {
    const res = await deps.importCrm(buildCrmNoteXml(fields));
    if (!res || !res.success) return { success: false, key: null, error: res?.error };
    return { success: true, key: parseCrmKey(res.raw) };
  } catch (err) {
    return { success: false, key: null, error: (err as Error)?.message };
  }
}
