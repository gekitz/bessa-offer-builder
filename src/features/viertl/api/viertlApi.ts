// Viertl-Lizenz-API. Spiegelt
// supabase/migrations/20260827120000_create_viertl_tracking.sql.
//
// Konvention wie procurementApi.ts / ticketApi.ts: list*/get*/update*,
// snake_case ↔ camelCase Mapping ausschließlich hier. Feldänderungen an
// viertl_licenses werden serverseitig per Trigger protokolliert — dafür
// schickt updateLicense() immer updated_by_id/name mit.

import { supabase } from '../../../lib/supabase';
import type {
  ViertlActor,
  ViertlEvent,
  ViertlLicense,
  ViertlLicenseUpdate,
} from '../types';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// ─────────────────────────────────────────────────────────────────────
// Row mappers (snake_case → camelCase)
// ─────────────────────────────────────────────────────────────────────

function rowToLicense(r: any): ViertlLicense {
  return {
    id: r.id,
    mesonicKdnr: r.mesonic_kdnr,
    name: r.name,
    contact: r.contact ?? null,
    street: r.street ?? null,
    plz: r.plz ?? null,
    ort: r.ort ?? null,
    email: r.email ?? null,
    gastrotouchVersion: r.gastrotouch_version ?? null,
    lastUpdate: r.last_update ?? null,
    hardwareModel: r.hardware_model ?? null,
    hardwareNeeded: !!r.hardware_needed,
    wartung: r.wartung,
    status: r.status,
    customerStatus: r.customer_status,
    closedReason: r.closed_reason ?? null,
    closedAt: r.closed_at ?? null,
    notes: r.notes ?? null,
    linkedOfferId: r.linked_offer_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToEvent(r: any): ViertlEvent {
  return {
    id: r.id,
    licenseId: r.license_id,
    type: r.type,
    field: r.field ?? null,
    oldValue: r.old_value ?? null,
    newValue: r.new_value ?? null,
    message: r.message ?? null,
    actorId: r.actor_id ?? null,
    actorName: r.actor_name ?? null,
    createdAt: r.created_at,
  };
}

// camelCase Update → snake_case Row (nur gesetzte Felder). closedReason
// nicht separat behandeln; closed_at wird bei customer_status='closed'
// gesetzt bzw. bei Reaktivierung geleert.
function updateToRow(patch: ViertlLicenseUpdate): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.wartung !== undefined) row.wartung = patch.wartung;
  if (patch.gastrotouchVersion !== undefined) row.gastrotouch_version = patch.gastrotouchVersion;
  if (patch.hardwareModel !== undefined) row.hardware_model = patch.hardwareModel;
  if (patch.hardwareNeeded !== undefined) row.hardware_needed = patch.hardwareNeeded;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.closedReason !== undefined) row.closed_reason = patch.closedReason;
  if (patch.customerStatus !== undefined) {
    row.customer_status = patch.customerStatus;
    row.closed_at = patch.customerStatus === 'closed' ? new Date().toISOString() : null;
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

export async function listLicenses(): Promise<ViertlLicense[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('viertl_licenses')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToLicense);
}

export async function listEvents(licenseId: string): Promise<ViertlEvent[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('viertl_events')
    .select('*')
    .eq('license_id', licenseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToEvent);
}

// Patch anwenden. Der Aktor wird als updated_by_* mitgeschickt, damit der
// DB-Trigger die Feldänderungen dem richtigen Benutzer zuordnet.
export async function updateLicense(
  id: string,
  patch: ViertlLicenseUpdate,
  actor: ViertlActor,
): Promise<ViertlLicense> {
  const sb = requireSupabase();
  const row = {
    ...updateToRow(patch),
    updated_by_id: actor.id,
    updated_by_name: actor.name,
  };
  const { data, error } = await sb
    .from('viertl_licenses')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToLicense(data);
}

// Ein Angebot mit einer Installation verknüpfen. Setzt linked_offer_id +
// (optional) Pipeline-Status und protokolliert ein offer_attached-Event.
// Die Feld-Diffs (linked_offer_id ist nicht getrackt, status schon)
// erledigt der Audit-Trigger.
export async function linkOffer(
  licenseId: string,
  offerId: string,
  actor: ViertlActor,
  nextStatus?: 'offer_created' | 'mailed',
): Promise<ViertlLicense> {
  const sb = requireSupabase();
  const row: Record<string, unknown> = {
    linked_offer_id: offerId,
    updated_by_id: actor.id,
    updated_by_name: actor.name,
  };
  if (nextStatus) row.status = nextStatus;
  const { data, error } = await sb
    .from('viertl_licenses')
    .update(row)
    .eq('id', licenseId)
    .select('*')
    .single();
  if (error) throw error;
  await sb.from('viertl_events').insert({
    license_id: licenseId,
    type: 'offer_attached',
    message: offerId,
    actor_id: actor.id,
    actor_name: actor.name,
  });
  return rowToLicense(data);
}

// Verknüpfung wieder lösen (Feld-Diff auf linked_offer_id wird nicht
// getrackt → explizite Notiz für die Historie).
export async function unlinkOffer(licenseId: string, actor: ViertlActor): Promise<ViertlLicense> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('viertl_licenses')
    .update({ linked_offer_id: null, updated_by_id: actor.id, updated_by_name: actor.name })
    .eq('id', licenseId)
    .select('*')
    .single();
  if (error) throw error;
  await sb.from('viertl_events').insert({
    license_id: licenseId,
    type: 'note',
    message: 'Angebotsverknüpfung entfernt',
    actor_id: actor.id,
    actor_name: actor.name,
  });
  return rowToLicense(data);
}

// Viertl benachrichtigen, dass ein Kunde geschlossen hat. Der Empfänger
// wird server-seitig aus dem Secret VIERTL_NOTIFY_EMAIL aufgelöst; wir
// schicken nur licenseId + (editierten) Grund. Das viertl_notified-Event
// schreibt die Edge-Funktion selbst. Gibt die Zieladresse zurück.
export async function notifyViertlClosure(
  licenseId: string,
  reason: string,
): Promise<{ ok: true; to: string }> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('notify-viertl-closure', {
    body: { licenseId, reason },
  });
  if (error) {
    // Edge-Funktionen verpacken Fehlertexte im Response-Body.
    const ctx = (error as { context?: { body?: string } }).context;
    let msg = error.message;
    try { msg = ctx?.body ? (JSON.parse(ctx.body).error ?? msg) : msg; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  return data as { ok: true; to: string };
}

// Freitext-Notiz in die Historie schreiben (kein Feld-Diff).
export async function addNote(
  licenseId: string,
  message: string,
  actor: ViertlActor,
): Promise<ViertlEvent> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('viertl_events')
    .insert({
      license_id: licenseId,
      type: 'note',
      message,
      actor_id: actor.id,
      actor_name: actor.name,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToEvent(data);
}
