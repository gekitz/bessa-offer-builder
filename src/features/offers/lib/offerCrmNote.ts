// Orchestration for auto-posting a WinLine CRM Aktion (offer link) to a
// customer's Mesonic account when an offer is saved. Pure/injected so it can
// be unit-tested without touching Supabase or the mesonic-proxy: the caller
// passes the mesonic import function as a dependency.
//
// The CRM note carries a link to the public offer page; the created Aktion
// key (parsed from the import response's <KeyValue>) is stored on
// offers.mesonic_crm_key as the "already posted" idempotency anchor.

import { buildCrmNoteXml, parseCrmKey } from './crmNoteImport';

// The generic CRM helpers now live in crmNoteImport.ts (the CRM home).
// Re-export them here so existing offer imports (OfferBuilderPage, tests)
// stay untouched.
export { parseCrmKey, decideCrmAction } from './crmNoteImport';
export type { CrmAction } from './crmNoteImport';

// Public offer link base — mirrors the send-offer edge function
// (`${PUBLIC_APP_URL}/?a=<code>`). The app is a HashRouter SPA that reads the
// `a` query param to open a shared offer.
export const OFFER_LINK_BASE = 'https://bessa.kitz.co.at';

// The CRM Aktion (Workflow) these offer notes are filed under (Heri, live).
export const OFFER_CRM_WORKFLOW = 10241;

// The offers row shape this module reads. Kept minimal + loose so it maps onto
// the DB row (snake_case) returned by saveOffer without extra plumbing.
export interface OfferCrmSource {
  share_code?: string | null;
  customer_company?: string | null;
  customer_name?: string | null;
}

export interface OfferCrmFields {
  workflowNummer: number;
  zeilennummer: number;
  kundenkonto: string;
  kurzbeschreibung: string;
  langbeschreibungIntern: string;
}

// Build the public offer link from a share code, or null when there is none
// (guard: no share_code → no post).
export function offerShareUrl(shareCode: string | null | undefined): string | null {
  if (!shareCode) return null;
  return `${OFFER_LINK_BASE}/?a=${shareCode}`;
}

// Build the WebCRM field set for an offer. Returns null when the offer has no
// share_code (nothing to link to → skip the post).
export function buildOfferCrmFields(
  offer: OfferCrmSource,
  kundenkonto: string,
): OfferCrmFields | null {
  const shareUrl = offerShareUrl(offer.share_code);
  if (!shareUrl) return null;

  const label = (offer.customer_company || offer.customer_name || 'Kunde').trim();
  return {
    workflowNummer: OFFER_CRM_WORKFLOW,
    zeilennummer: 1,
    kundenkonto: String(kundenkonto),
    kurzbeschreibung: `Angebot ${label}`,
    langbeschreibungIntern: `Angebot-Link: ${shareUrl}`,
  };
}

export interface ImportResult {
  success: boolean;
  raw?: string;
  error?: string;
}

export interface PostOfferCrmNoteDeps {
  // Posts the built XML through mesonicImport(TYPES.CRM, 'WebCRM', xml, {actionCode:1}).
  importCrm: (xml: string) => Promise<ImportResult>;
}

export interface PostOfferCrmNoteResult {
  success: boolean;
  key: string | null;
  error?: string;
  skipped?: boolean;
}

// Build + post the CRM note for an offer. Never throws — a Mesonic
// failure/hang surfaces as { success:false } so the caller stays best-effort.
export async function postOfferCrmNote(
  { kundenkonto, offer }: { kundenkonto: string; offer: OfferCrmSource },
  deps: PostOfferCrmNoteDeps,
): Promise<PostOfferCrmNoteResult> {
  const fields = buildOfferCrmFields(offer, kundenkonto);
  if (!fields) return { success: false, key: null, skipped: true };

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
