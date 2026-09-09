// Lieferschein (delivery note) API layer. Mirrors the repair-order half of
// ticketApi.ts and supabase/migrations/20260909120000_create_delivery_notes.sql.
//
// snake_case ↔ camelCase mapping happens here so the rest of the app talks to
// the camelCase types from ../types. See docs/ticket-lieferschein.md.

import { supabase } from '../../../lib/supabase';
import type {
  DeliveryNote,
  DeliveryNoteInput,
  DeliveryNoteItem,
  DeliveryNoteItemInput,
} from '../types';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// Fire-and-forget customer-facing milestone on the ticket timeline. Mirrors
// fireAuditComment in ticketApi.ts (kept local so this file is self-contained).
async function fireMilestone(
  ticketId: string,
  body: string,
  metadata: Record<string, unknown>,
  actorId?: string | null,
): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb.from('ticket_comments').insert({
      ticket_id: ticketId,
      kind: 'milestone',
      body,
      metadata,
      created_by: actorId ?? null,
      is_external: false,
    });
    if (error) console.warn('delivery-note milestone insert failed:', error.message);
  } catch (err) {
    console.warn('delivery-note milestone insert threw:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Row mappers
// ─────────────────────────────────────────────────────────────────────

function rowToDeliveryNote(r: any): DeliveryNote {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    seqNumber: r.seq_number,
    status: r.status,
    note: r.note ?? null,
    signatureData: r.signature_data ?? null,
    signedAt: r.signed_at ?? null,
    signedByName: r.signed_by_name ?? null,
    performedAt: r.performed_at,
    mesonicBelegLaufnummer: r.mesonic_beleg_laufnummer ?? null,
    mesonicBelegKey: r.mesonic_beleg_key ?? null,
    mesonicBelegCreatedAt: r.mesonic_beleg_created_at ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToItem(r: any): DeliveryNoteItem {
  return {
    id: r.id,
    deliveryNoteId: r.delivery_note_id,
    productId: r.product_id ?? null,
    mesonicArtikelNr: r.mesonic_artikel_nr ?? null,
    bezeichnung: r.bezeichnung,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    isFreetext: !!r.is_freetext,
    serialNumbers: (r.serial_numbers as string[]) ?? [],
    sort: r.sort ?? 0,
    createdAt: r.created_at,
  };
}

function itemInputToRow(deliveryNoteId: string, input: DeliveryNoteItemInput): Record<string, unknown> {
  return {
    delivery_note_id: deliveryNoteId,
    product_id: input.productId ?? null,
    mesonic_artikel_nr: input.mesonicArtikelNr ?? null,
    bezeichnung: input.bezeichnung,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    is_freetext: input.isFreetext ?? false,
    serial_numbers: input.serialNumbers ?? [],
    sort: input.sort ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Column lists
// ─────────────────────────────────────────────────────────────────────

const DELIVERY_NOTE_COLS =
  'id, ticket_id, seq_number, status, note, signature_data, signed_at, signed_by_name, performed_at, mesonic_beleg_laufnummer, mesonic_beleg_key, mesonic_beleg_created_at, created_by, created_at, updated_at';
const ITEM_COLS =
  'id, delivery_note_id, product_id, mesonic_artikel_nr, bezeichnung, quantity, unit_price, is_freetext, serial_numbers, sort, created_at';

// ─────────────────────────────────────────────────────────────────────
// Delivery notes
// ─────────────────────────────────────────────────────────────────────

export async function listDeliveryNotes(ticketId: string): Promise<DeliveryNote[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('delivery_notes')
    .select(DELIVERY_NOTE_COLS)
    .eq('ticket_id', ticketId)
    .order('seq_number');
  if (error) throw error;
  return (data ?? []).map(rowToDeliveryNote);
}

export async function getDeliveryNote(
  id: string,
): Promise<{ deliveryNote: DeliveryNote; items: DeliveryNoteItem[] } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('delivery_notes')
    .select(`${DELIVERY_NOTE_COLS}, delivery_note_items(${ITEM_COLS})`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const items = ((data as any).delivery_note_items ?? [])
    .map(rowToItem)
    .sort((a: DeliveryNoteItem, b: DeliveryNoteItem) => a.sort - b.sort);
  return { deliveryNote: rowToDeliveryNote(data), items };
}

export async function createDeliveryNote(input: DeliveryNoteInput): Promise<DeliveryNote> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('delivery_notes')
    .insert({
      ticket_id: input.ticketId,
      note: input.note ?? null,
      performed_at: input.performedAt ?? new Date().toISOString().slice(0, 10),
      created_by: input.createdBy ?? null,
    })
    .select(DELIVERY_NOTE_COLS)
    .single();
  if (error) throw error;

  if ((data as { seq_number?: number }).seq_number === 1) {
    void fireMilestone(
      input.ticketId,
      'Ein Lieferschein wurde erstellt.',
      { deliveryNoteId: data.id },
      input.createdBy ?? null,
    );
  }
  return rowToDeliveryNote(data);
}

export async function updateDeliveryNote(
  id: string,
  patch: { note?: string | null; performedAt?: string; status?: DeliveryNote['status'] },
): Promise<DeliveryNote> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.note !== undefined) dbPatch.note = patch.note;
  if (patch.performedAt !== undefined) dbPatch.performed_at = patch.performedAt;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  const { data, error } = await sb
    .from('delivery_notes')
    .update(dbPatch)
    .eq('id', id)
    .select(DELIVERY_NOTE_COLS)
    .single();
  if (error) throw error;
  return rowToDeliveryNote(data);
}

export async function signDeliveryNote(
  id: string,
  signatureData: string,
  signedByName: string,
): Promise<DeliveryNote> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('delivery_notes')
    .update({
      signature_data: signatureData,
      signed_by_name: signedByName,
      signed_at: new Date().toISOString(),
      status: 'signed',
    })
    .eq('id', id)
    .select(DELIVERY_NOTE_COLS)
    .single();
  if (error) throw error;

  void fireMilestone(
    (data as { ticket_id: string }).ticket_id,
    'Lieferschein wurde unterschrieben.',
    { deliveryNoteId: id, signed: true },
    null,
  );
  return rowToDeliveryNote(data);
}

// ─────────────────────────────────────────────────────────────────────
// Delivery note items
// ─────────────────────────────────────────────────────────────────────

export async function addDeliveryItem(
  deliveryNoteId: string,
  input: DeliveryNoteItemInput,
): Promise<DeliveryNoteItem> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('delivery_note_items')
    .insert(itemInputToRow(deliveryNoteId, input))
    .select(ITEM_COLS)
    .single();
  if (error) throw error;
  return rowToItem(data);
}

// Bulk insert — used when seeding a fresh delivery note from an accepted offer.
export async function addDeliveryItems(
  deliveryNoteId: string,
  inputs: DeliveryNoteItemInput[],
): Promise<DeliveryNoteItem[]> {
  if (inputs.length === 0) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('delivery_note_items')
    .insert(inputs.map((input, i) => ({ ...itemInputToRow(deliveryNoteId, input), sort: input.sort ?? i })))
    .select(ITEM_COLS);
  if (error) throw error;
  return (data ?? []).map(rowToItem);
}

export async function updateDeliveryItem(
  id: string,
  patch: Partial<DeliveryNoteItemInput>,
): Promise<DeliveryNoteItem> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.productId !== undefined) dbPatch.product_id = patch.productId;
  if (patch.mesonicArtikelNr !== undefined) dbPatch.mesonic_artikel_nr = patch.mesonicArtikelNr;
  if (patch.bezeichnung !== undefined) dbPatch.bezeichnung = patch.bezeichnung;
  if (patch.quantity !== undefined) dbPatch.quantity = patch.quantity;
  if (patch.unitPrice !== undefined) dbPatch.unit_price = patch.unitPrice;
  if (patch.isFreetext !== undefined) dbPatch.is_freetext = patch.isFreetext;
  if (patch.serialNumbers !== undefined) dbPatch.serial_numbers = patch.serialNumbers;
  if (patch.sort !== undefined) dbPatch.sort = patch.sort;
  const { data, error } = await sb
    .from('delivery_note_items')
    .update(dbPatch)
    .eq('id', id)
    .select(ITEM_COLS)
    .single();
  if (error) throw error;
  return rowToItem(data);
}

export async function removeDeliveryItem(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('delivery_note_items').delete().eq('id', id);
  if (error) throw error;
}

// Persistiert Laufnummer + Beleg-Key auf dem Lieferschein (Idempotenz-Anker
// für exportTicketBelege — analog setRepairOrderBelegExport).
export async function setDeliveryNoteBelegExport(
  deliveryNoteId: string,
  laufnummer: number,
  belegKey: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('delivery_notes')
    .update({
      mesonic_beleg_laufnummer: laufnummer,
      mesonic_beleg_key: belegKey,
      mesonic_beleg_created_at: new Date().toISOString(),
    })
    .eq('id', deliveryNoteId);
  if (error) throw error;
}
