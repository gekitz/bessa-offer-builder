// Kampagnen-API — generisches (typ-agnostisches) CRUD + Funnel/Outcome-
// Seiteneffekte. Spiegelt supabase/migrations/20260922130000_create_campaigns.sql.
//
// Konvention wie viertlApi.ts / procurementApi.ts: requireSupabase(),
// rowTo* Mapper, *ToRow für Updates, ISO-Strings für Zeitstempel. KEINE
// Typ-A-Logik hier — die lebt im Wizard (rksvWizard.ts) + der
// campaign-outcome Edge-Funktion (Terminal-Write-back).
//
// Die Funnel-schreibenden Funktionen (markLanded/saveRecipientPayload/
// recordOutcome) arbeiten PER TOKEN und sind anon-sicher (permissive RLS),
// da sie von der öffentlichen Landing-Page aufgerufen werden. Sie rücken
// Funnel-Zeitstempel nur VORWÄRTS (überschreiben nie einen gesetzten Wert).

import { supabase } from '../../../lib/supabase';
import { newToken } from '../lib/token';
import {
  CAMPAIGN_OUTCOMES,
  type Campaign,
  type CampaignActor,
  type CampaignFunnelCounts,
  type CampaignOutcome,
  type CampaignRecipient,
  type CampaignRecipientFilter,
  type CampaignType,
  type SendPartition,
  type SubjectType,
} from '../types';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// ─────────────────────────────────────────────────────────────────────
// Row mappers (snake_case → camelCase)
// ─────────────────────────────────────────────────────────────────────

function rowToCampaign(r: any): Campaign {
  return {
    id: r.id,
    type: r.type,
    key: r.key,
    title: r.title,
    emailSubject: r.email_subject ?? null,
    emailTemplate: r.email_template ?? null,
    status: r.status,
    createdById: r.created_by_id ?? null,
    createdByName: r.created_by_name ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToRecipient(r: any): CampaignRecipient {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    name: r.name ?? null,
    email: r.email ?? null,
    batch: r.batch ?? null,
    resendCount: r.resend_count ?? 0,
    token: r.token,
    sentAt: r.sent_at ?? null,
    deliveredAt: r.delivered_at ?? null,
    openedAt: r.opened_at ?? null,
    clickedAt: r.clicked_at ?? null,
    landedAt: r.landed_at ?? null,
    startedAt: r.started_at ?? null,
    outcome: r.outcome ?? null,
    outcomeAt: r.outcome_at ?? null,
    bouncedAt: r.bounced_at ?? null,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    ticketId: r.ticket_id ?? null,
    offerId: r.offer_id ?? null,
    resendId: r.resend_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Campaigns
// ─────────────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<Campaign[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCampaign(data) : null;
}

export async function createCampaign(
  input: {
    type: CampaignType;
    key: string;
    title: string;
    emailSubject?: string | null;
    emailTemplate?: string | null;
  },
  actor: CampaignActor,
): Promise<Campaign> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('campaigns')
    .insert({
      type: input.type,
      key: input.key,
      title: input.title,
      email_subject: input.emailSubject ?? null,
      email_template: input.emailTemplate ?? null,
      created_by_id: actor.id,
      created_by_name: actor.name,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToCampaign(data);
}

// ─────────────────────────────────────────────────────────────────────
// Enrolment (idempotent) — upsert auf (campaign_id, subject_type, subject_id).
// ignoreDuplicates:true → ON CONFLICT DO NOTHING; .select() liefert NUR die
// tatsächlich eingefügten Zeilen zurück, sodass skipped = requested − inserted.
// ─────────────────────────────────────────────────────────────────────

export async function enrollRecipients(
  campaignId: string,
  subjects: Array<{
    subjectType: SubjectType;
    subjectId: string;
    name: string | null;
    email: string | null;
    batch: string;
    payload?: Record<string, unknown>;
  }>,
): Promise<{ enrolled: CampaignRecipient[]; skipped: number }> {
  const sb = requireSupabase();
  if (subjects.length === 0) return { enrolled: [], skipped: 0 };
  const rows = subjects.map((s) => ({
    campaign_id: campaignId,
    subject_type: s.subjectType,
    subject_id: s.subjectId,
    name: s.name,
    email: s.email,
    batch: s.batch,
    token: newToken(),
    payload: s.payload ?? {},
  }));
  const { data, error } = await sb
    .from('campaign_recipients')
    .upsert(rows, {
      onConflict: 'campaign_id,subject_type,subject_id',
      ignoreDuplicates: true,
    })
    .select('*');
  if (error) throw error;
  const enrolled = (data ?? []).map(rowToRecipient);
  return { enrolled, skipped: subjects.length - enrolled.length };
}

// ─────────────────────────────────────────────────────────────────────
// Recipients — list + Funnel
// ─────────────────────────────────────────────────────────────────────

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export async function listRecipients(
  campaignId: string,
  opts: {
    batch?: string;
    filter?: CampaignRecipientFilter;
    notOpenedDays?: number;
  } = {},
): Promise<CampaignRecipient[]> {
  const sb = requireSupabase();
  let q = sb.from('campaign_recipients').select('*').eq('campaign_id', campaignId);
  if (opts.batch) q = q.eq('batch', opts.batch);

  const filter = opts.filter ?? 'all';
  if (filter === 'opened_not_acted') {
    q = q.not('opened_at', 'is', null).is('outcome', null);
  } else if (filter === 'started_unfinished') {
    q = q.not('started_at', 'is', null).is('outcome', null);
  } else if (filter === 'not_opened') {
    const cutoff = daysAgoIso(opts.notOpenedDays ?? 5);
    q = q.is('opened_at', null).not('sent_at', 'is', null).lte('sent_at', cutoff);
  }

  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToRecipient);
}

// Einzelne count-Query (head:true → nur count, keine Zeilen).
async function countRecipients(
  sb: NonNullable<typeof supabase>,
  campaignId: string,
  batch: string | undefined,
  build: (q: any) => any,
): Promise<number> {
  let q = sb
    .from('campaign_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);
  if (batch) q = q.eq('batch', batch);
  q = build(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function getFunnelCounts(
  campaignId: string,
  batch?: string,
): Promise<CampaignFunnelCounts> {
  const sb = requireSupabase();
  const c = (build: (q: any) => any) => countRecipients(sb, campaignId, batch, build);
  const [
    total,
    sent,
    delivered,
    opened,
    clicked,
    landed,
    started,
    outcomeAuthorized,
    outcomeQuoteRequested,
    outcomeSoftCheck,
    noEmail,
  ] = await Promise.all([
    c((q) => q),
    c((q) => q.not('sent_at', 'is', null)),
    c((q) => q.not('delivered_at', 'is', null)),
    c((q) => q.not('opened_at', 'is', null)),
    c((q) => q.not('clicked_at', 'is', null)),
    c((q) => q.not('landed_at', 'is', null)),
    c((q) => q.not('started_at', 'is', null)),
    c((q) => q.eq('outcome', 'authorized')),
    c((q) => q.eq('outcome', 'quote_requested')),
    c((q) => q.eq('outcome', 'soft_check')),
    c((q) => q.is('email', null)),
  ]);
  return {
    total,
    sent,
    delivered,
    opened,
    clicked,
    landed,
    started,
    outcomeAuthorized,
    outcomeQuoteRequested,
    outcomeSoftCheck,
    noEmail,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Öffentliche Landing (anon-Client, per Token). Spiegelt getOfferByShareCode.
// ─────────────────────────────────────────────────────────────────────

export async function getRecipientByToken(token: string): Promise<CampaignRecipient | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('campaign_recipients')
    .select('*')
    .eq('token', token)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToRecipient(data) : null;
}

// Stempelt landed_at einmalig (nur wenn null). Gibt die Zeile zurück.
export async function markLanded(token: string): Promise<CampaignRecipient> {
  const sb = requireSupabase();
  const current = await getRecipientByToken(token);
  if (!current) throw new Error('Empfänger nicht gefunden');
  if (current.landedAt) return current; // schon gestempelt → vorwärts-only
  const { data, error } = await sb
    .from('campaign_recipients')
    .update({ landed_at: new Date().toISOString() })
    .eq('token', token)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRecipient(data);
}

// Wizard-Antworten in payload mergen (flach) + started_at beim ersten
// Schreiben stempeln (das ist der "gestartet"-Funnel-Zustand).
export async function saveRecipientPayload(
  token: string,
  patch: Record<string, unknown>,
): Promise<CampaignRecipient> {
  const sb = requireSupabase();
  const current = await getRecipientByToken(token);
  if (!current) throw new Error('Empfänger nicht gefunden');
  const row: Record<string, unknown> = {
    payload: { ...current.payload, ...patch },
  };
  if (!current.startedAt) row.started_at = new Date().toISOString();
  const { data, error } = await sb
    .from('campaign_recipients')
    .update(row)
    .eq('token', token)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRecipient(data);
}

// Terminaler Outcome von der Landing-Page (öffentlich). Stempelt outcome +
// outcome_at, merged finalen payload (z. B. Signatur). Stempelt started_at
// mit, falls null — damit auch Null-Fragen-Pfade als "gestartet" zählen.
//
// HINWEIS: Der Produktions-Aufrufer ist jetzt die campaign-outcome Edge-
// Funktion (submitOutcome), die den Outcome + den Viertl-Write-back
// server-seitig (Service-Role) + idempotent macht (M2/M3). Diese
// client-seitige Funktion bleibt für Tests/Referenz erhalten, wird aber
// vom Landing-Pfad nicht mehr aufgerufen.
export async function recordOutcome(
  token: string,
  outcome: CampaignOutcome,
  patch: Record<string, unknown> = {},
): Promise<CampaignRecipient> {
  if (!CAMPAIGN_OUTCOMES.includes(outcome)) {
    throw new Error(`Ungültiges Outcome: ${outcome}`);
  }
  const sb = requireSupabase();
  const current = await getRecipientByToken(token);
  if (!current) throw new Error('Empfänger nicht gefunden');
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    outcome,
    outcome_at: nowIso,
    payload: { ...current.payload, ...patch },
  };
  if (!current.startedAt) row.started_at = nowIso;
  const { data, error } = await sb
    .from('campaign_recipients')
    .update(row)
    .eq('token', token)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRecipient(data);
}

// Terminaler Outcome von der öffentlichen Landing-Page — ruft die
// campaign-outcome Edge-Funktion (verify_jwt=false) auf. Diese stempelt das
// Outcome + führt den Viertl-Write-back (Flag + Notiz) mit dem
// SERVICE-ROLE-Key + idempotent aus (M2/M3). Der anon-Client passiert das
// Gateway (fn ist public), der Token im Body ist das Credential — wie die
// Stripe-Accept-Fns. Fehlertext aus dem Response-Body auspacken, exakt wie
// sendCampaign / notifyViertlClosure.
export async function submitOutcome(input: {
  token: string;
  outcome: 'authorized' | 'quote_requested' | 'soft_check';
  payload?: Record<string, unknown>;
}): Promise<CampaignRecipient> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('campaign-outcome', {
    body: { token: input.token, outcome: input.outcome, payload: input.payload ?? {} },
  });
  if (error) {
    const ctx = (error as { context?: { body?: string } }).context;
    let msg = error.message;
    try { msg = ctx?.body ? (JSON.parse(ctx.body).error ?? msg) : msg; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  const res = data as { ok: true; recipient: unknown };
  return rowToRecipient(res.recipient);
}

// ─────────────────────────────────────────────────────────────────────
// Back-office Link-Felder (nach Handler-Seiteneffekten: Ticket/Angebot)
// ─────────────────────────────────────────────────────────────────────

export async function linkRecipientTicket(
  recipientId: string,
  ticketId: string,
): Promise<CampaignRecipient> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('campaign_recipients')
    .update({ ticket_id: ticketId })
    .eq('id', recipientId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRecipient(data);
}

export async function linkRecipientOffer(
  recipientId: string,
  offerId: string,
): Promise<CampaignRecipient> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('campaign_recipients')
    .update({ offer_id: offerId })
    .eq('id', recipientId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRecipient(data);
}

// ─────────────────────────────────────────────────────────────────────
// Send (Phase 4)
// ─────────────────────────────────────────────────────────────────────

// Rein: partitioniert die aktuelle Auswahl in versenden / überspringen /
// kein-E-Mail — für den Bestätigungsdialog VOR dem Edge-Fn-Aufruf. Der
// Edge-Fn-Response spiegelt dieselbe Mathematik. Empfänger, die zur Auswahl
// gehören, aber nicht gefunden werden, werden ignoriert.
export function dryRunSend(
  recipients: CampaignRecipient[],
  recipientIds: string[],
  resend: boolean,
): SendPartition {
  const byId = new Map(recipients.map((r) => [r.id, r]));
  const toSend: string[] = [];
  const skipped: string[] = [];
  const noEmail: string[] = [];
  for (const id of recipientIds) {
    const r = byId.get(id);
    if (!r) continue;
    if (!r.email) {
      noEmail.push(id);
      continue;
    }
    if (r.sentAt && !resend) {
      skipped.push(id);
      continue;
    }
    toSend.push(id);
  }
  return { toSend, skipped, noEmail };
}

export interface SendCampaignResult {
  ok: true;
  sent: number;
  skipped: number;
  noEmail: number;
  failed: number;
  batch: string;
}

// Ruft die send-campaign Edge-Funktion auf. Der authed Client hängt das
// SSO-JWT an (verify_jwt=true). Fehlertexte im Response-Body auspacken,
// exakt wie notifyViertlClosure.
export async function sendCampaign(input: {
  campaignId: string;
  recipientIds: string[];
  batch: string;
  resend?: boolean;
}): Promise<SendCampaignResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('send-campaign', {
    body: {
      campaignId: input.campaignId,
      recipientIds: input.recipientIds,
      batch: input.batch,
      resend: input.resend ?? false,
    },
  });
  if (error) {
    const ctx = (error as { context?: { body?: string } }).context;
    let msg = error.message;
    try { msg = ctx?.body ? (JSON.parse(ctx.body).error ?? msg) : msg; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  return data as SendCampaignResult;
}
