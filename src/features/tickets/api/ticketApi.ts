// Ticket-System API layer. Mirrors
// supabase/migrations/20260512120000_create_tickets.sql.
//
// Naming convention: list*, get*, create*, update*, close/sign etc.
// All snake_case ↔ camelCase mapping happens here so the rest of the
// app can talk to camelCase types from ../types.

import { supabase } from '../../../lib/supabase';
import type {
  Appointment,
  AppointmentAssignee,
  AppointmentInput,
  AssigneeRole,
  BillingSummary,
  RepairOrder,
  RepairOrderEntry,
  RepairOrderEntryInput,
  RepairOrderInput,
  RepairOrderMaterial,
  RepairOrderMaterialInput,
  ServiceRate,
  Ticket,
  TicketAttachment,
  TicketComment,
  TicketFilters,
  TicketInput,
  TicketStatus,
  TravelZone,
} from '../types';
import { calcTicketBilling } from '../lib/billing';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// Fire-and-forget notify-ticket-event call. Mutations have already
// committed by the time we hit this, so an email/Resend outage must
// never roll them back or surface in the UI. Failures log a warning
// and stay silent.
type NotifyEvent =
  | { event: 'ticket_created'; ticketId: string; triggeredBy?: string | null }
  | { event: 'ticket_assigned'; ticketId: string; triggeredBy?: string | null }
  | { event: 'status_changed'; ticketId: string; previousStatus: string; newStatus: string; triggeredBy?: string | null }
  | { event: 'ticket_closed'; ticketId: string; triggeredBy?: string | null }
  | { event: 'appointment_scheduled'; ticketId: string; appointmentId: string; triggeredBy?: string | null };

function fireNotify(payload: NotifyEvent): void {
  const sb = supabase;
  if (!sb) return;
  void sb.functions
    .invoke('notify-ticket-event', { body: payload })
    .catch((err) => {
      console.warn('notify-ticket-event invoke failed:', err);
    });
}

// Best-effort audit comment. The mutation has committed by the time
// this is called, so failure is logged and otherwise silent — a
// missing audit row never blocks the user-facing action.
async function fireAuditComment(input: {
  ticketId: string;
  kind: 'status_change' | 'assignment' | 'system';
  body: string;
  metadata: Record<string, unknown>;
  actorId?: string | null;
}): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb.from('ticket_comments').insert({
      ticket_id: input.ticketId,
      kind: input.kind,
      body: input.body,
      metadata: input.metadata,
      created_by: input.actorId ?? null,
      is_external: false,
    });
    if (error) console.warn('audit comment insert failed:', error.message);
  } catch (err) {
    console.warn('audit comment insert threw:', err);
  }
}

// German status labels for status-change comment bodies. Mirrors the
// labels rendered in TicketDetail/CustomerTicketPage so the audit row
// reads the same on both sides of the wall.
const STATUS_LABEL_DE: Record<TicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  closed: 'Geschlossen',
  cancelled: 'Abgesagt',
};

// ─────────────────────────────────────────────────────────────────────
// Row mappers (snake_case → camelCase)
// ─────────────────────────────────────────────────────────────────────

function rowToServiceRate(r: any): ServiceRate {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    category: r.category,
    unit: r.unit,
    rate: Number(r.rate),
    tierMinHours: r.tier_min_hours != null ? Number(r.tier_min_hours) : null,
    requiresWartungsvertrag: r.requires_wartungsvertrag,
    mesonicArtikelNr: r.mesonic_artikel_nr,
    activeFrom: r.active_from,
    activeTo: r.active_to,
  };
}

function rowToTravelZone(r: any): TravelZone {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    maxKm: r.max_km,
    flatRate: Number(r.flat_rate),
    mesonicArtikelNr: r.mesonic_artikel_nr,
    activeFrom: r.active_from,
  };
}

function rowToTicket(r: any): Ticket {
  return {
    id: r.id,
    ticketNumber: r.ticket_number,
    shareCode: r.share_code,
    title: r.title,
    description: r.description,
    kind: r.kind,
    priority: r.priority,
    status: r.status,
    poolAbteilungId: r.pool_abteilung_id,
    assignedTo: r.assigned_to,
    mesonicCustomerId: r.mesonic_customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerEmail: r.customer_email,
    customerAddress: r.customer_address,
    customerHasWartungsvertrag: Boolean(r.customer_has_wartungsvertrag),
    standortId: r.standort_id,
    billable: r.billable,
    closedAt: r.closed_at,
    closedBy: r.closed_by,
    resolutionNote: r.resolution_note,
    offerId: r.offer_id,
    mesonicBelegId: r.mesonic_beleg_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function ticketInputToRow(input: TicketInput | Partial<TicketInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.description !== undefined) out.description = input.description;
  if (input.kind !== undefined) out.kind = input.kind;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.status !== undefined) out.status = input.status;
  if (input.poolAbteilungId !== undefined) out.pool_abteilung_id = input.poolAbteilungId;
  if (input.assignedTo !== undefined) out.assigned_to = input.assignedTo;
  if (input.mesonicCustomerId !== undefined) out.mesonic_customer_id = input.mesonicCustomerId;
  if (input.customerName !== undefined) out.customer_name = input.customerName;
  if (input.customerPhone !== undefined) out.customer_phone = input.customerPhone;
  if (input.customerEmail !== undefined) out.customer_email = input.customerEmail;
  if (input.customerAddress !== undefined) out.customer_address = input.customerAddress;
  if (input.customerHasWartungsvertrag !== undefined) out.customer_has_wartungsvertrag = input.customerHasWartungsvertrag;
  if (input.standortId !== undefined) out.standort_id = input.standortId;
  if (input.billable !== undefined) out.billable = input.billable;
  if (input.offerId !== undefined) out.offer_id = input.offerId;
  if (input.createdBy !== undefined) out.created_by = input.createdBy;
  return out;
}

function rowToAppointment(r: any): Appointment {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    mesonicCustomerId: r.mesonic_customer_id,
    customerName: r.customer_name,
    title: r.title,
    description: r.description,
    kind: r.kind,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    location: r.location,
    status: r.status,
    standortId: r.standort_id,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function appointmentInputToRow(input: Partial<AppointmentInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.ticketId !== undefined) out.ticket_id = input.ticketId;
  if (input.mesonicCustomerId !== undefined) out.mesonic_customer_id = input.mesonicCustomerId;
  if (input.customerName !== undefined) out.customer_name = input.customerName;
  if (input.title !== undefined) out.title = input.title;
  if (input.description !== undefined) out.description = input.description;
  if (input.kind !== undefined) out.kind = input.kind;
  if (input.startsAt !== undefined) out.starts_at = input.startsAt;
  if (input.endsAt !== undefined) out.ends_at = input.endsAt;
  if (input.allDay !== undefined) out.all_day = input.allDay;
  if (input.location !== undefined) out.location = input.location;
  if (input.status !== undefined) out.status = input.status;
  if (input.standortId !== undefined) out.standort_id = input.standortId;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.createdBy !== undefined) out.created_by = input.createdBy;
  return out;
}

function rowToAssignee(r: any): AppointmentAssignee {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    employeeId: r.employee_id,
    role: r.role,
    createdAt: r.created_at,
    _employeeName: r.employees?.name,
  };
}

function rowToRepairOrder(r: any): RepairOrder {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    appointmentId: r.appointment_id,
    seqNumber: r.seq_number,
    status: r.status,
    workDescription: r.work_description,
    gpsTravelNote: r.gps_travel_note,
    signatureData: r.signature_data,
    signedAt: r.signed_at,
    signedByName: r.signed_by_name,
    performedAt: r.performed_at,
    billable: r.billable,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToEntry(r: any): RepairOrderEntry {
  return {
    id: r.id,
    repairOrderId: r.repair_order_id,
    employeeId: r.employee_id,
    serviceRateCode: r.service_rate_code,
    workMinutes: r.work_minutes,
    travelMode: r.travel_mode,
    travelZoneCode: r.travel_zone_code,
    travelKm: r.travel_km != null ? Number(r.travel_km) : null,
    travelWegzeitMinutes: r.travel_wegzeit_minutes ?? 0,
    note: r.note,
    createdAt: r.created_at,
    _employeeName: r.employees?.name,
  };
}

function entryInputToRow(repairOrderId: string, input: RepairOrderEntryInput): Record<string, unknown> {
  return {
    repair_order_id: repairOrderId,
    employee_id: input.employeeId,
    service_rate_code: input.serviceRateCode,
    work_minutes: input.workMinutes,
    travel_mode: input.travelMode ?? null,
    travel_zone_code: input.travelZoneCode ?? null,
    travel_km: input.travelKm ?? null,
    travel_wegzeit_minutes: input.travelWegzeitMinutes ?? 0,
    note: input.note ?? null,
  };
}

function rowToMaterial(r: any): RepairOrderMaterial {
  return {
    id: r.id,
    repairOrderId: r.repair_order_id,
    mesonicArtikelNr: r.mesonic_artikel_nr,
    bezeichnung: r.bezeichnung,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    total: Number(r.total),
    createdAt: r.created_at,
  };
}

function rowToComment(r: any): TicketComment {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    kind: r.kind,
    body: r.body,
    metadata: r.metadata,
    createdBy: r.created_by,
    isExternal: !!r.is_external,
    createdAt: r.created_at,
    _authorName: r.employees?.name,
  };
}

function rowToAttachment(r: any): TicketAttachment {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    repairOrderId: r.repair_order_id,
    storagePath: r.storage_path,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Service rates + travel zones (lookups)
// ─────────────────────────────────────────────────────────────────────

const SERVICE_RATE_COLS =
  'id, code, label, category, unit, rate, tier_min_hours, requires_wartungsvertrag, mesonic_artikel_nr, active_from, active_to';
const TRAVEL_ZONE_COLS =
  'id, code, label, max_km, flat_rate, mesonic_artikel_nr, active_from';

export async function listServiceRates(opts: { activeOn?: string } = {}): Promise<ServiceRate[]> {
  const sb = requireSupabase();
  let q = sb.from('service_rates').select(SERVICE_RATE_COLS).order('id');
  if (opts.activeOn) {
    q = q.lte('active_from', opts.activeOn).or(`active_to.is.null,active_to.gt.${opts.activeOn}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToServiceRate);
}

export async function listTravelZones(): Promise<TravelZone[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('travel_zones').select(TRAVEL_ZONE_COLS).order('id');
  if (error) throw error;
  return (data ?? []).map(rowToTravelZone);
}

// ─────────────────────────────────────────────────────────────────────
// Tickets
// ─────────────────────────────────────────────────────────────────────

const TICKET_COLS =
  'id, ticket_number, share_code, title, description, kind, priority, status, pool_abteilung_id, assigned_to, mesonic_customer_id, customer_name, customer_phone, customer_email, customer_address, customer_has_wartungsvertrag, standort_id, billable, closed_at, closed_by, resolution_note, offer_id, mesonic_beleg_id, created_by, created_at, updated_at';

export async function listTickets(filters: TicketFilters = {}): Promise<Ticket[]> {
  const sb = requireSupabase();
  let q = sb.from('tickets').select(TICKET_COLS).order('created_at', { ascending: false });

  if (filters.status?.length) q = q.in('status', filters.status);
  if (filters.priority?.length) q = q.in('priority', filters.priority);
  if (filters.poolAbteilungId != null) q = q.eq('pool_abteilung_id', filters.poolAbteilungId);
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo);
  if (filters.mesonicCustomerId) q = q.eq('mesonic_customer_id', filters.mesonicCustomerId);
  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, '\\$&');
    q = q.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,customer_name.ilike.%${term}%,ticket_number.ilike.%${term}%`,
    );
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToTicket);
}

// Slim fetch for the pool × status overview matrix — just the two
// dimensions we count on, across all tickets regardless of the list's
// current filters.
export async function listTicketCounts(): Promise<
  Array<{ status: TicketStatus; poolAbteilungId: number | null }>
> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('tickets').select('status, pool_abteilung_id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ status: TicketStatus; pool_abteilung_id: number | null }>).map(
    (r) => ({ status: r.status, poolAbteilungId: r.pool_abteilung_id }),
  );
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('tickets').select(TICKET_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToTicket(data) : null;
}

export async function createTicket(input: TicketInput): Promise<Ticket> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('tickets')
    .insert(ticketInputToRow(input))
    .select(TICKET_COLS)
    .single();
  if (error) throw error;
  const ticket = rowToTicket(data);
  fireNotify({
    event: 'ticket_created',
    ticketId: ticket.id,
    triggeredBy: input.createdBy ?? null,
  });
  return ticket;
}

export async function updateTicket(
  id: string,
  patch: Partial<TicketInput>,
  opts: { actorId?: string } = {},
): Promise<Ticket> {
  const sb = requireSupabase();

  // Capture previous assignee only when assignment is part of the
  // patch — that's the one change we audit-comment. Saves a SELECT
  // when callers update title/description/etc.
  let previousAssignedTo: string | null | undefined;
  if (patch.assignedTo !== undefined) {
    try {
      const { data: prev } = await sb
        .from('tickets')
        .select('assigned_to')
        .eq('id', id)
        .maybeSingle();
      previousAssignedTo = (prev as { assigned_to?: string | null } | null)?.assigned_to ?? null;
    } catch {
      previousAssignedTo = undefined; // best-effort; skip audit if we can't read it
    }
  }

  const { data, error } = await sb
    .from('tickets')
    .update(ticketInputToRow(patch))
    .eq('id', id)
    .select(TICKET_COLS)
    .single();
  if (error) throw error;

  // Assignment-change audit comment. Hits only when the patch actually
  // touched assigned_to AND the value changed.
  if (
    patch.assignedTo !== undefined
    && previousAssignedTo !== undefined
    && previousAssignedTo !== patch.assignedTo
  ) {
    const newAssignedTo = patch.assignedTo ?? null;
    // Resolve names for the body — short single roundtrip, both
    // employees usually live in the same lookup batch the caller
    // already has but the API can't assume that.
    const ids = [previousAssignedTo, newAssignedTo].filter(Boolean) as string[];
    let nameById = new Map<string, string>();
    if (ids.length > 0) {
      try {
        const { data: emps } = await sb.from('employees').select('id, name').in('id', ids);
        nameById = new Map(((emps ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]));
      } catch {
        // proceed without names; body falls back to "Zuweisung geändert"
      }
    }
    const prevName = previousAssignedTo ? nameById.get(previousAssignedTo) ?? 'Unbekannt' : null;
    const nextName = newAssignedTo ? nameById.get(newAssignedTo) ?? 'Unbekannt' : null;
    let body: string;
    if (nextName && prevName) body = `Zuweisung: ${prevName} → ${nextName}`;
    else if (nextName) body = `Zugewiesen: ${nextName}`;
    else if (prevName) body = `Zuweisung entfernt (zuvor: ${prevName})`;
    else body = 'Zuweisung geändert';
    void fireAuditComment({
      ticketId: id,
      kind: 'assignment',
      body,
      metadata: {
        previousAssignedTo: previousAssignedTo ?? null,
        newAssignedTo,
      },
      actorId: opts.actorId ?? null,
    });

    // Notify the new assignee (email + push). The Edge Function skips
    // self-assignment (assigned_to === triggeredBy). Nobody to notify
    // when the ticket was unassigned.
    if (newAssignedTo) {
      fireNotify({ event: 'ticket_assigned', ticketId: id, triggeredBy: opts.actorId ?? null });
    }
  }

  return rowToTicket(data);
}

export async function setTicketStatus(
  id: string,
  status: TicketStatus,
  opts: { closedBy?: string; actorId?: string; resolutionNote?: string } = {},
): Promise<Ticket> {
  const sb = requireSupabase();

  // Capture the prior status so the notification can render a
  // before/after line. We don't fail the mutation if this read
  // errors — fall back to an empty string.
  let previousStatus = '';
  try {
    const { data: prev } = await sb.from('tickets').select('status').eq('id', id).maybeSingle();
    previousStatus = (prev as { status?: string } | null)?.status ?? '';
  } catch {
    // ignore — best-effort
  }

  const patch: Record<string, unknown> = { status };
  if (status === 'closed') {
    patch.closed_at = new Date().toISOString();
    if (opts.closedBy) patch.closed_by = opts.closedBy;
    if (opts.resolutionNote !== undefined) patch.resolution_note = opts.resolutionNote;
  }
  const { data, error } = await sb.from('tickets').update(patch).eq('id', id).select(TICKET_COLS).single();
  if (error) throw error;

  // Skip side effects when the status didn't actually change — saves
  // an email + an audit row when callers idempotently re-apply the
  // same status.
  if (previousStatus !== status) {
    const actorId = opts.actorId ?? opts.closedBy ?? null;
    const prevLabel = previousStatus
      ? STATUS_LABEL_DE[previousStatus as TicketStatus] ?? previousStatus
      : null;
    const nextLabel = STATUS_LABEL_DE[status] ?? status;
    void fireAuditComment({
      ticketId: id,
      kind: 'status_change',
      body: prevLabel ? `Status: ${prevLabel} → ${nextLabel}` : `Status: ${nextLabel}`,
      metadata: { previousStatus, newStatus: status },
      actorId,
    });
    if (status === 'closed') {
      fireNotify({ event: 'ticket_closed', ticketId: id, triggeredBy: actorId });
    } else {
      fireNotify({
        event: 'status_changed',
        ticketId: id,
        previousStatus,
        newStatus: status,
        triggeredBy: actorId,
      });
    }
  }
  return rowToTicket(data);
}

// ─────────────────────────────────────────────────────────────────────
// Appointments
// ─────────────────────────────────────────────────────────────────────

const APPOINTMENT_COLS =
  'id, ticket_id, mesonic_customer_id, customer_name, title, description, kind, starts_at, ends_at, all_day, location, status, standort_id, notes, created_by, created_at, updated_at';

export async function listAppointmentsForTicket(ticketId: string): Promise<Appointment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('appointments')
    .select(`${APPOINTMENT_COLS}, appointment_assignees(id, appointment_id, employee_id, role, created_at, employees(name))`)
    .eq('ticket_id', ticketId)
    .order('starts_at');
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const appt = rowToAppointment(row);
    appt.assignees = (row.appointment_assignees ?? []).map(rowToAssignee);
    return appt;
  });
}

export async function listAppointments(range: { from: string; to: string }): Promise<Appointment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('appointments')
    .select(`${APPOINTMENT_COLS}, appointment_assignees(id, appointment_id, employee_id, role, created_at, employees(name))`)
    .lte('starts_at', range.to)
    .gte('ends_at', range.from)
    .order('starts_at');
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const appt = rowToAppointment(row);
    appt.assignees = (row.appointment_assignees ?? []).map(rowToAssignee);
    return appt;
  });
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('appointments')
    .select(`${APPOINTMENT_COLS}, appointment_assignees(id, appointment_id, employee_id, role, created_at, employees(name))`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const appt = rowToAppointment(data);
  appt.assignees = ((data as any).appointment_assignees ?? []).map(rowToAssignee);
  return appt;
}

export async function createAppointment(
  input: AppointmentInput,
  assignees: Array<{ employeeId: string; role?: AssigneeRole }> = [],
): Promise<Appointment> {
  const sb = requireSupabase();
  const { data: appt, error } = await sb
    .from('appointments')
    .insert(appointmentInputToRow(input))
    .select(APPOINTMENT_COLS)
    .single();
  if (error) throw error;

  if (assignees.length > 0) {
    const rows = assignees.map((a) => ({
      appointment_id: appt.id,
      employee_id: a.employeeId,
      role: a.role ?? 'techniker',
    }));
    const { error: e2 } = await sb.from('appointment_assignees').insert(rows);
    if (e2) throw e2;
  }
  // Notify only when the appointment is tied to a customer ticket —
  // standalone internal termine don't fan out to the customer.
  if (input.ticketId) {
    fireNotify({
      event: 'appointment_scheduled',
      ticketId: input.ticketId,
      appointmentId: appt.id,
      triggeredBy: input.createdBy ?? null,
    });
  }
  return rowToAppointment(appt);
}

export async function updateAppointment(id: string, patch: Partial<AppointmentInput>): Promise<Appointment> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('appointments')
    .update(appointmentInputToRow(patch))
    .eq('id', id)
    .select(APPOINTMENT_COLS)
    .single();
  if (error) throw error;
  return rowToAppointment(data);
}

export async function deleteAppointment(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('appointments').delete().eq('id', id);
  if (error) throw error;
}

export async function setAppointmentAssignees(
  appointmentId: string,
  assignees: Array<{ employeeId: string; role?: AssigneeRole }>,
): Promise<void> {
  const sb = requireSupabase();
  const { error: e1 } = await sb.from('appointment_assignees').delete().eq('appointment_id', appointmentId);
  if (e1) throw e1;
  if (assignees.length === 0) return;
  const rows = assignees.map((a) => ({
    appointment_id: appointmentId,
    employee_id: a.employeeId,
    role: a.role ?? 'techniker',
  }));
  const { error: e2 } = await sb.from('appointment_assignees').insert(rows);
  if (e2) throw e2;
}

// ─────────────────────────────────────────────────────────────────────
// Repair orders
// ─────────────────────────────────────────────────────────────────────

const REPAIR_ORDER_COLS =
  'id, ticket_id, appointment_id, seq_number, status, work_description, gps_travel_note, signature_data, signed_at, signed_by_name, performed_at, billable, created_by, created_at, updated_at';
const ENTRY_COLS =
  'id, repair_order_id, employee_id, service_rate_code, work_minutes, travel_mode, travel_zone_code, travel_km, travel_wegzeit_minutes, note, created_at';
const MATERIAL_COLS =
  'id, repair_order_id, mesonic_artikel_nr, bezeichnung, quantity, unit_price, total, created_at';

export async function listRepairOrders(ticketId: string): Promise<RepairOrder[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('repair_orders')
    .select(REPAIR_ORDER_COLS)
    .eq('ticket_id', ticketId)
    .order('seq_number');
  if (error) throw error;
  return (data ?? []).map(rowToRepairOrder);
}

export async function getRepairOrder(id: string): Promise<{
  repairOrder: RepairOrder;
  entries: RepairOrderEntry[];
  materials: RepairOrderMaterial[];
} | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('repair_orders')
    .select(
      `${REPAIR_ORDER_COLS},
       repair_order_entries(${ENTRY_COLS}, employees(name)),
       repair_order_materials(${MATERIAL_COLS})`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    repairOrder: rowToRepairOrder(data),
    entries: ((data as any).repair_order_entries ?? []).map(rowToEntry),
    materials: ((data as any).repair_order_materials ?? []).map(rowToMaterial),
  };
}

export async function createRepairOrder(input: RepairOrderInput): Promise<RepairOrder> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('repair_orders')
    .insert({
      ticket_id: input.ticketId,
      appointment_id: input.appointmentId ?? null,
      work_description: input.workDescription ?? null,
      gps_travel_note: input.gpsTravelNote ?? null,
      performed_at: input.performedAt ?? new Date().toISOString().slice(0, 10),
      billable: input.billable ?? true,
      created_by: input.createdBy ?? null,
    })
    .select(REPAIR_ORDER_COLS)
    .single();
  if (error) throw error;
  return rowToRepairOrder(data);
}

export async function updateRepairOrder(
  id: string,
  patch: Partial<Omit<RepairOrderInput, 'ticketId'>> & { status?: RepairOrder['status'] },
): Promise<RepairOrder> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.appointmentId !== undefined) dbPatch.appointment_id = patch.appointmentId;
  if (patch.workDescription !== undefined) dbPatch.work_description = patch.workDescription;
  if (patch.gpsTravelNote !== undefined) dbPatch.gps_travel_note = patch.gpsTravelNote;
  if (patch.performedAt !== undefined) dbPatch.performed_at = patch.performedAt;
  if (patch.billable !== undefined) dbPatch.billable = patch.billable;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  const { data, error } = await sb.from('repair_orders').update(dbPatch).eq('id', id).select(REPAIR_ORDER_COLS).single();
  if (error) throw error;
  return rowToRepairOrder(data);
}

export async function signRepairOrder(
  id: string,
  signatureData: string,
  signedByName: string,
): Promise<RepairOrder> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('repair_orders')
    .update({
      signature_data: signatureData,
      signed_by_name: signedByName,
      signed_at: new Date().toISOString(),
      status: 'signed',
    })
    .eq('id', id)
    .select(REPAIR_ORDER_COLS)
    .single();
  if (error) throw error;
  return rowToRepairOrder(data);
}

// ─────────────────────────────────────────────────────────────────────
// Repair order entries (time per technician)
// ─────────────────────────────────────────────────────────────────────

export async function addEntry(repairOrderId: string, input: RepairOrderEntryInput): Promise<RepairOrderEntry> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('repair_order_entries')
    .insert(entryInputToRow(repairOrderId, input))
    .select(ENTRY_COLS)
    .single();
  if (error) throw error;
  return rowToEntry(data);
}

export async function updateEntry(id: string, patch: Partial<RepairOrderEntryInput>): Promise<RepairOrderEntry> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.employeeId !== undefined) dbPatch.employee_id = patch.employeeId;
  if (patch.serviceRateCode !== undefined) dbPatch.service_rate_code = patch.serviceRateCode;
  if (patch.workMinutes !== undefined) dbPatch.work_minutes = patch.workMinutes;
  if (patch.travelMode !== undefined) dbPatch.travel_mode = patch.travelMode;
  if (patch.travelZoneCode !== undefined) dbPatch.travel_zone_code = patch.travelZoneCode;
  if (patch.travelKm !== undefined) dbPatch.travel_km = patch.travelKm;
  if (patch.travelWegzeitMinutes !== undefined) dbPatch.travel_wegzeit_minutes = patch.travelWegzeitMinutes;
  if (patch.note !== undefined) dbPatch.note = patch.note;
  const { data, error } = await sb
    .from('repair_order_entries')
    .update(dbPatch)
    .eq('id', id)
    .select(ENTRY_COLS)
    .single();
  if (error) throw error;
  return rowToEntry(data);
}

export async function deleteEntry(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('repair_order_entries').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────

export async function addMaterial(
  repairOrderId: string,
  input: RepairOrderMaterialInput,
): Promise<RepairOrderMaterial> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('repair_order_materials')
    .insert({
      repair_order_id: repairOrderId,
      mesonic_artikel_nr: input.mesonicArtikelNr,
      bezeichnung: input.bezeichnung,
      quantity: input.quantity,
      unit_price: input.unitPrice,
    })
    .select(MATERIAL_COLS)
    .single();
  if (error) throw error;
  return rowToMaterial(data);
}

export async function updateMaterial(
  id: string,
  patch: Partial<RepairOrderMaterialInput>,
): Promise<RepairOrderMaterial> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.mesonicArtikelNr !== undefined) dbPatch.mesonic_artikel_nr = patch.mesonicArtikelNr;
  if (patch.bezeichnung !== undefined) dbPatch.bezeichnung = patch.bezeichnung;
  if (patch.quantity !== undefined) dbPatch.quantity = patch.quantity;
  if (patch.unitPrice !== undefined) dbPatch.unit_price = patch.unitPrice;
  const { data, error } = await sb
    .from('repair_order_materials')
    .update(dbPatch)
    .eq('id', id)
    .select(MATERIAL_COLS)
    .single();
  if (error) throw error;
  return rowToMaterial(data);
}

export async function removeMaterial(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('repair_order_materials').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────

const COMMENT_COLS = 'id, ticket_id, kind, body, metadata, created_by, created_at, is_external';

export async function listComments(ticketId: string): Promise<TicketComment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('ticket_comments')
    .select(`${COMMENT_COLS}, employees:created_by(name)`)
    .eq('ticket_id', ticketId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToComment);
}

export async function addComment(
  ticketId: string,
  body: string,
  opts: { createdBy?: string } = {},
): Promise<TicketComment> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('ticket_comments')
    .insert({
      ticket_id: ticketId,
      kind: 'comment',
      body,
      created_by: opts.createdBy ?? null,
    })
    .select(COMMENT_COLS)
    .single();
  if (error) throw error;
  return rowToComment(data);
}

// ─────────────────────────────────────────────────────────────────────
// Attachments (Supabase Storage)
// ─────────────────────────────────────────────────────────────────────

const ATTACHMENT_BUCKET = 'ticket-attachments';
const ATTACHMENT_COLS =
  'id, ticket_id, repair_order_id, storage_path, filename, content_type, size_bytes, uploaded_by, created_at';

export async function uploadAttachment(opts: {
  ticketId?: string;
  repairOrderId?: string;
  file: File | Blob;
  filename: string;
  uploadedBy?: string;
}): Promise<TicketAttachment> {
  if (!opts.ticketId && !opts.repairOrderId) throw new Error('ticketId oder repairOrderId erforderlich');
  const sb = requireSupabase();

  const folder = opts.ticketId ? `tickets/${opts.ticketId}` : `repair_orders/${opts.repairOrderId}`;
  const path = `${folder}/${Date.now()}-${opts.filename}`;
  const { error: upErr } = await sb.storage.from(ATTACHMENT_BUCKET).upload(path, opts.file, { upsert: false });
  if (upErr) throw upErr;

  const contentType = opts.file instanceof File ? opts.file.type : (opts.file as Blob).type;
  const sizeBytes = (opts.file as Blob).size;

  const { data, error } = await sb
    .from('ticket_attachments')
    .insert({
      ticket_id: opts.ticketId ?? null,
      repair_order_id: opts.repairOrderId ?? null,
      storage_path: path,
      filename: opts.filename,
      content_type: contentType || null,
      size_bytes: sizeBytes,
      uploaded_by: opts.uploadedBy ?? null,
    })
    .select(ATTACHMENT_COLS)
    .single();
  if (error) throw error;
  return rowToAttachment(data);
}

export async function listAttachments(
  scope: { ticketId: string } | { repairOrderId: string },
): Promise<TicketAttachment[]> {
  const sb = requireSupabase();
  let q = sb.from('ticket_attachments').select(ATTACHMENT_COLS).order('created_at');
  if ('ticketId' in scope) q = q.eq('ticket_id', scope.ticketId);
  else q = q.eq('repair_order_id', scope.repairOrderId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToAttachment);
}

export async function getAttachmentSignedUrl(storagePath: string, expiresSec = 3600): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.storage.from(ATTACHMENT_BUCKET).createSignedUrl(storagePath, expiresSec);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Signed URL nicht verfügbar');
  return data.signedUrl;
}

export async function deleteAttachment(id: string): Promise<void> {
  const sb = requireSupabase();
  // Get path first so we can also clean up storage
  const { data: row, error: e0 } = await sb
    .from('ticket_attachments')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (e0) throw e0;
  if (row?.storage_path) {
    await sb.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]);
  }
  const { error } = await sb.from('ticket_attachments').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────
// Billing
// ─────────────────────────────────────────────────────────────────────

export async function calculateTicketBilling(ticketId: string): Promise<BillingSummary> {
  const sb = requireSupabase();

  const ticket = await getTicket(ticketId);
  if (!ticket) throw new Error('Ticket nicht gefunden');

  const [ratesArr, zonesArr, repairOrders] = await Promise.all([
    listServiceRates(),
    listTravelZones(),
    listRepairOrders(ticketId),
  ]);

  const rateByCode = new Map(ratesArr.map((r) => [r.code, r] as const));
  const zoneByCode = new Map(zonesArr.map((z) => [z.code, z] as const));

  // Fetch entries + materials in parallel for all billable repair orders
  const billableOrders = repairOrders.filter((r) => r.billable);
  const detailedOrders = await Promise.all(
    billableOrders.map(async (order) => {
      const { data: entries, error: eErr } = await sb
        .from('repair_order_entries')
        .select(`${ENTRY_COLS}, employees(name)`)
        .eq('repair_order_id', order.id);
      if (eErr) throw eErr;
      const { data: materials, error: mErr } = await sb
        .from('repair_order_materials')
        .select(MATERIAL_COLS)
        .eq('repair_order_id', order.id);
      if (mErr) throw mErr;
      return {
        repairOrder: order,
        entries: (entries ?? []).map(rowToEntry),
        materials: (materials ?? []).map(rowToMaterial),
      };
    }),
  );

  const employeeNameById = new Map<string, string>();
  for (const d of detailedOrders) {
    for (const e of d.entries) {
      if (e._employeeName) employeeNameById.set(e.employeeId, e._employeeName);
    }
  }

  return calcTicketBilling({
    ticket,
    repairOrders: detailedOrders,
    rateByCode,
    zoneByCode,
    employeeNameById,
  });
}
