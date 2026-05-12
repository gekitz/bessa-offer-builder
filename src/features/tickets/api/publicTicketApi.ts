// Customer-facing API. Every function here is callable with the
// anon Supabase client — no auth required, scoped by share_code.
//
// CRITICAL: the projections below are the ONLY fields the customer
// sees. Do not leak assignee names, internal pool, billing details,
// repair-order positions, or any field that isn't on this sanitised
// allowlist. RLS provides defence in depth (see
// 20260513090000_ticket_public_share.sql) but the projection here
// is the primary boundary.

import { supabase } from '../../../lib/supabase';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

export type PublicTicketStatus = 'open' | 'in_progress' | 'waiting' | 'closed' | 'cancelled';

export interface PublicTicket {
  id: string;
  shareCode: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  kind: 'support' | 'installation' | 'reparatur' | 'wartung' | 'beratung' | 'intern';
  status: PublicTicketStatus;
  customerName: string | null;
  closedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface PublicAppointment {
  id: string;
  // Sanitised — no internal location string when the customer might be
  // on a different premise (we still send the city, just not the
  // building / room). For v1 we ship the raw location since it's
  // typically the customer's own address. Tighten later if needed.
  title: string;
  description: string | null;
  kind: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  status: string;
}

export interface PublicTimelineEntry {
  id: string;
  kind: 'comment' | 'status_change';
  body: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  isExternal: boolean;
}

export interface PublicTicketView {
  ticket: PublicTicket;
  appointments: PublicAppointment[];
  timeline: PublicTimelineEntry[];
}

// ─────────────────────────────────────────────────────────────────────

function rowToPublicTicket(r: any): PublicTicket {
  return {
    id: r.id,
    shareCode: r.share_code,
    ticketNumber: r.ticket_number,
    title: r.title,
    description: r.description,
    kind: r.kind,
    status: r.status,
    customerName: r.customer_name,
    closedAt: r.closed_at,
    resolutionNote: r.resolution_note,
    createdAt: r.created_at,
  };
}

function rowToPublicAppointment(r: any): PublicAppointment {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    kind: r.kind,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    location: r.location,
    status: r.status,
  };
}

function rowToTimelineEntry(r: any): PublicTimelineEntry {
  return {
    id: r.id,
    kind: r.kind,
    body: r.body,
    metadata: r.metadata,
    createdAt: r.created_at,
    isExternal: !!r.is_external,
  };
}

const TICKET_COLS =
  'id, share_code, ticket_number, title, description, kind, status, customer_name, closed_at, resolution_note, created_at';
const APPOINTMENT_COLS =
  'id, title, description, kind, starts_at, ends_at, all_day, location, status';
const COMMENT_COLS = 'id, ticket_id, kind, body, metadata, created_at, is_external';

// Single-roundtrip read for the customer view. Anyone with the
// share_code can see this; the projection is the security boundary.
export async function getPublicTicketView(shareCode: string): Promise<PublicTicketView | null> {
  if (!shareCode) return null;
  const sb = requireSupabase();

  const { data: ticketRow, error: e1 } = await sb
    .from('tickets')
    .select(TICKET_COLS)
    .eq('share_code', shareCode)
    .maybeSingle();
  if (e1) throw e1;
  if (!ticketRow) return null;

  const ticket = rowToPublicTicket(ticketRow);

  const [{ data: apptRows, error: e2 }, { data: commentRows, error: e3 }] = await Promise.all([
    sb
      .from('appointments')
      .select(APPOINTMENT_COLS)
      .eq('ticket_id', ticket.id)
      .order('starts_at'),
    sb
      .from('ticket_comments')
      .select(COMMENT_COLS)
      .eq('ticket_id', ticket.id)
      .in('kind', ['comment', 'status_change'])
      .order('created_at'),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;

  return {
    ticket,
    appointments: (apptRows ?? []).map(rowToPublicAppointment),
    timeline: (commentRows ?? []).map(rowToTimelineEntry),
  };
}

export async function addPublicComment(
  shareCode: string,
  body: string,
): Promise<PublicTimelineEntry> {
  if (!shareCode) throw new Error('share_code erforderlich');
  if (!body.trim()) throw new Error('Kommentar darf nicht leer sein');

  const sb = requireSupabase();

  // Look up the ticket first (anon SELECT is allowed by RLS). The
  // insert needs the ticket_id which we never expose to the client
  // bare — only via the projection above.
  const { data: ticketRow, error: e1 } = await sb
    .from('tickets')
    .select('id')
    .eq('share_code', shareCode)
    .maybeSingle();
  if (e1) throw e1;
  if (!ticketRow) throw new Error('Auftrag nicht gefunden');

  const ticketId = (ticketRow as { id: string }).id;

  const { data, error } = await sb
    .from('ticket_comments')
    .insert({
      ticket_id: ticketId,
      kind: 'comment',
      body: body.trim(),
      is_external: true,
      created_by: null,
    })
    .select(COMMENT_COLS)
    .single();
  if (error) throw error;

  // Fire-and-forget notification to the internal assignee. The edge
  // function validates share_code matches the ticket — without that
  // check, an anon caller who knows a ticket_id could spam alerts.
  // The customer's "Senden" UI already succeeded by this point, so
  // any push/email outage must stay silent here.
  void sb.functions
    .invoke('notify-ticket-event', {
      body: {
        event: 'customer_replied',
        ticketId,
        shareCode,
      },
    })
    .catch((err) => {
      console.warn('notify-ticket-event (customer_replied) invoke failed:', err);
    });

  return rowToTimelineEntry(data);
}
