// Outreach-/Replacement-Kampagnen — Domänentypen (generische Engine).
//
// Spiegelt supabase/migrations/20260922130000_create_campaigns.sql in der
// camelCase + ISO-String-Konvention der App. snake_case ↔ camelCase
// Mapping passiert ausschließlich in api/campaignApi.ts.
//
// Alles Typ-spezifische lebt in `payload` (jsonb) — RksvPayload ist die
// Type-A-Ausprägung. Ein neuer Kampagnentyp (z. B. Type B PoS-Ablöse)
// fügt hier nur eine weitere Payload-Form hinzu, keine neuen Spalten.

export type CampaignType = 'rksv_signature' | 'pos_replacement';
export type CampaignStatus = 'draft' | 'active' | 'archived';
export type SubjectType = 'viertl_license' | 'mesonic_customer';

// Typ-definierte Outcomes. Die DB trägt bewusst keinen CHECK darauf;
// die gültigen Werte werden hier + in der API-Schicht gepflegt.
export type CampaignOutcome =
  | 'authorized'        // "Auftrag erteilen" (preis-freie Signatur, Type A)
  | 'quote_requested'   // "Angebot anfordern" (Type A: neue Hardware nötig)
  | 'soft_check'        // "Weiß nicht" → Remote-OS-Check (Type A)
  | 'offer_accepted';   // Type B (PoS): Angebot angenommen — hier reserviert
export const CAMPAIGN_OUTCOMES: CampaignOutcome[] = [
  'authorized',
  'quote_requested',
  'soft_check',
  'offer_accepted',
];

export interface Campaign {
  id: string;
  type: CampaignType;
  key: string;
  title: string;
  emailSubject: string | null;
  emailTemplate: string | null;
  status: CampaignStatus;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  subjectType: SubjectType;
  subjectId: string;
  name: string | null;
  email: string | null;
  batch: string | null;
  resendCount: number;
  token: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  landedAt: string | null;
  startedAt: string | null;
  outcome: CampaignOutcome | null;
  outcomeAt: string | null;
  bouncedAt: string | null;
  payload: Record<string, unknown>;   // typ-spezifisch; siehe RksvPayload
  ticketId: string | null;
  offerId: string | null;
  resendId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignActor {
  id: string | null;
  name: string | null;
}

// ── Type A (RKSV) payload — die persistierten Wizard-Antworten/Zustand ──
export interface RksvPayload {
  // Snapshot-Kontext beim Enroll (aus der Viertl-Zeile), damit die
  // öffentliche Landing-Page eine reine Funktion des Snapshots ist und
  // keinen authed Viertl-Read braucht.
  knownHardwareNeeded?: boolean;
  versionOk?: boolean;
  // Self-reported Antworten aus dem Wizard.
  hasWin10?: 'ja' | 'nein' | 'weiss_nicht';
  setupSize?: 'einzelplatz' | 'mehrplatz';
  // Preis-freie Autorisierung (Signatur).
  signatureData?: string;   // data-URL
  signedByName?: string;
}

// ── Funnel / Filter (Phase 3) ──

// Actionable Call-List-Filter für das Back-Office.
export type CampaignRecipientFilter =
  | 'all'
  | 'opened_not_acted'    // opened_at gesetzt, outcome null → "geöffnet, keine Aktion"
  | 'started_unfinished'  // started_at gesetzt, outcome null → HEISSESTE Liste
  | 'not_opened';         // sent gesetzt, opened null, sent ≥ N Tage her

export interface CampaignFunnelCounts {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  landed: number;
  started: number;
  outcomeAuthorized: number;
  outcomeQuoteRequested: number;
  outcomeSoftCheck: number;
  noEmail: number;          // email IS NULL (Druck-/kein-E-Mail-Segment)
}

// Partitionierung für den idempotenten Versand (Phase 4). Lokal
// berechnet für den Bestätigungsdialog, vom Edge-Fn-Response gespiegelt.
export interface SendPartition {
  toSend: string[];    // recipient-ids, die versendet werden
  skipped: string[];   // bereits kontaktiert (sent_at gesetzt, kein resend)
  noEmail: string[];   // email IS NULL → Druck-Segment
}
