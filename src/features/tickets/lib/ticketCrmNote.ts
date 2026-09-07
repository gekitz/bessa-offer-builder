// Orchestration for auto-posting a WinLine CRM Aktion (staff deep-link) to a
// customer's Mesonic account for tickets and repair orders (Reparaturscheine).
// Mirrors the offer→CRM flow (src/features/offers/lib/offerCrmNote.ts):
// pure/injected so it can be unit-tested without touching Supabase or the
// mesonic-proxy — the caller passes the mesonic import function as a
// dependency.
//
// Unlike offers (whose note links to the public offer page), tickets and
// repair orders carry an INTERNAL staff deep-link into the SPA. Repair orders
// have no standalone URL, so their note links to the parent ticket. The
// created Aktion key (parsed from the import response's <KeyValue>) is stored
// on tickets.mesonic_crm_key / repair_orders.mesonic_crm_key as the "already
// posted" idempotency anchor.

import { buildCrmNoteXml, parseCrmKey, type CrmNoteFields } from '../../offers/lib/crmNoteImport';
import type { RepairOrder, Ticket } from '../types';

// Internal staff deep-link base — the SPA is a HashRouter, so ticket detail
// lives at `#/tickets/<id>`.
export const TICKET_LINK_BASE = 'https://bessa.kitz.co.at';

// The CRM Aktion (Workflow) these notes are filed under (Heri, live) —
// same workflow as the offer notes.
export const TICKET_CRM_WORKFLOW = 10241;

// Build the internal deep-link to a ticket's detail view.
export function ticketDeepLink(ticketId: string): string {
  return `${TICKET_LINK_BASE}/#/tickets/${ticketId}`;
}

export interface ImportResult {
  success: boolean;
  raw?: string;
  error?: string;
}

export interface PostCrmNoteDeps {
  // Posts the built XML through mesonicImport(TYPES.CRM, TEMPLATES.CRM, xml, {actionCode:1}).
  importCrm: (xml: string) => Promise<ImportResult>;
}

export interface PostCrmNoteResult {
  success: boolean;
  key: string | null;
  error?: string;
  skipped?: boolean;
}

// Build the WebCRM field set for a ticket. Returns null when the ticket has no
// Mesonic Kd.-Nr. (nothing to file against → skip / resolve upstream).
export function buildTicketCrmFields(ticket: Ticket): CrmNoteFields | null {
  if (!ticket.mesonicCustomerId) return null;
  const title = (ticket.title || '').trim();
  const link = ticketDeepLink(ticket.id);
  return {
    workflowNummer: TICKET_CRM_WORKFLOW,
    zeilennummer: 1,
    kundenkonto: String(ticket.mesonicCustomerId),
    kurzbeschreibung: `Ticket ${ticket.ticketNumber}`,
    langbeschreibungIntern: title ? `${title}\n${link}` : link,
  };
}

// Build the WebCRM field set for a repair order. Returns null when the parent
// ticket has no Mesonic Kd.-Nr. — repair orders inherit the ticket's Kd.-Nr.
// and never resolve their own (the ticket flow handles resolution). The note
// links to the parent ticket (repair orders have no standalone URL).
export function buildRepairOrderCrmFields(ro: RepairOrder, ticket: Ticket): CrmNoteFields | null {
  if (!ticket.mesonicCustomerId) return null;
  const desc = (ro.workDescription || '').trim();
  const performed = ro.performedAt ? `am ${ro.performedAt}` : '';
  const context = [performed, desc].filter(Boolean).join(' — ');
  const link = ticketDeepLink(ticket.id);
  return {
    workflowNummer: TICKET_CRM_WORKFLOW,
    zeilennummer: 1,
    kundenkonto: String(ticket.mesonicCustomerId),
    kurzbeschreibung: `Reparaturschein ${ticket.ticketNumber} #${ro.seqNumber}`,
    langbeschreibungIntern: context ? `${context}\n${link}` : link,
  };
}

// Build + post the CRM note for a ticket. Never throws — a Mesonic
// failure/hang surfaces as { success:false } so the caller stays best-effort.
export async function postTicketCrmNote(
  ticket: Ticket,
  deps: PostCrmNoteDeps,
): Promise<PostCrmNoteResult> {
  const fields = buildTicketCrmFields(ticket);
  if (!fields) return { success: false, key: null, skipped: true };
  return postFields(fields, deps);
}

// Build + post the CRM note for a repair order. Never throws.
export async function postRepairOrderCrmNote(
  ro: RepairOrder,
  ticket: Ticket,
  deps: PostCrmNoteDeps,
): Promise<PostCrmNoteResult> {
  const fields = buildRepairOrderCrmFields(ro, ticket);
  if (!fields) return { success: false, key: null, skipped: true };
  return postFields(fields, deps);
}

async function postFields(fields: CrmNoteFields, deps: PostCrmNoteDeps): Promise<PostCrmNoteResult> {
  try {
    const xml = buildCrmNoteXml(fields);
    const res = await deps.importCrm(xml);
    if (!res || !res.success) {
      return { success: false, key: null, error: res?.error };
    }
    return { success: true, key: parseCrmKey(res.raw) };
  } catch (err) {
    return { success: false, key: null, error: (err as Error)?.message };
  }
}
