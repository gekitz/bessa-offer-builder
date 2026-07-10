// Ticket-System domain types.
//
// Mirrors supabase/migrations/20260512120000_create_tickets.sql in the
// app's preferred camelCase + ISO date string convention. Mapping
// to/from supabase rows happens in the API layer.

import type { IsoDate } from '../vacation/types';

export type TicketKind = 'support' | 'installation' | 'reparatur' | 'wartung' | 'beratung' | 'intern';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'review' | 'closed' | 'cancelled';

export type AppointmentKind = 'installation' | 'reparatur' | 'wartung' | 'beratung' | 'abholung' | 'lieferung' | 'intern';
export type AppointmentStatus = 'geplant' | 'bestaetigt' | 'in_arbeit' | 'erledigt' | 'abgesagt';
export type AssigneeRole = 'lead' | 'techniker' | 'lehrling';

export type RepairOrderStatus = 'draft' | 'completed' | 'signed' | 'cancelled';

export type TravelMode = 'none' | 'pauschale' | 'km_plus_wegzeit' | 'km_inkl_wegzeit';

export type ServiceRateCategory = 'hardware' | 'it' | 'kassen' | 'buero' | 'software' | 'service' | 'travel';
export type ServiceRateUnit = 'hour' | 'pauschale' | 'km';

export type CommentKind = 'comment' | 'status_change' | 'assignment' | 'system' | 'milestone';

// ─────────────────────────────────────────────────────────────────────

export interface ServiceRate {
  id: number;
  code: string;
  label: string;
  category: ServiceRateCategory;
  unit: ServiceRateUnit;
  rate: number;
  tierMinHours: number | null;
  requiresWartungsvertrag: boolean | null;
  mesonicArtikelNr: string | null;
  activeFrom: IsoDate;
  activeTo: IsoDate | null;
}

export interface TravelZone {
  id: number;
  code: string;
  label: string;
  maxKm: number | null;
  flatRate: number;
  mesonicArtikelNr: string | null;
  activeFrom: IsoDate;
}

// ─────────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  ticketNumber: string; // '26-0000001' — DB trigger fills this
  shareCode: string;     // public URL token, generated on insert
  title: string;
  description: string | null;
  kind: TicketKind;
  priority: TicketPriority;
  status: TicketStatus;
  poolAbteilungId: number | null;
  assignedTo: string | null;
  mesonicCustomerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerHasWartungsvertrag: boolean;
  standortId: number | null;
  billable: boolean;
  closedAt: string | null;
  closedBy: string | null;
  resolutionNote: string | null;
  offerId: string | null;
  mesonicBelegId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated by joins
  _assigneeName?: string;
  _repairOrderCount?: number;
  _appointmentCount?: number;
}

export interface TicketInput {
  title: string;
  description?: string | null;
  kind?: TicketKind;
  priority?: TicketPriority;
  status?: TicketStatus;
  poolAbteilungId?: number | null;
  assignedTo?: string | null;
  mesonicCustomerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  customerHasWartungsvertrag?: boolean;
  standortId?: number | null;
  billable?: boolean;
  offerId?: string | null;
  createdBy?: string | null;
}

export interface TicketFilters {
  status?: TicketStatus[];
  priority?: TicketPriority[];
  poolAbteilungId?: number;
  assignedTo?: string;
  mesonicCustomerId?: string;
  search?: string; // freetext over title/description/customer_name/ticket_number
}

// ─────────────────────────────────────────────────────────────────────
// Fahrzeug-Zuordnung (Webfleet) — mirrors
// supabase/migrations/20260708120000_create_vehicle_assignments.sql

export interface VehicleAssignment {
  id: string;
  employeeId: string;
  webfleetObjectNo: string;
  plate: string | null;
  label: string | null;
  validFrom: IsoDate;
  validTo: IsoDate | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleAssignmentInput {
  employeeId: string;
  webfleetObjectNo: string;
  plate?: string | null;
  label?: string | null;
  validFrom?: IsoDate;
  validTo?: IsoDate | null;
}

// A Webfleet trip normalised into the units the repair-order entry
// needs: km (→ travelKm) and minutes (→ travelWegzeitMinutes).
// startTime/endTime are Europe/Vienna local wall-clock ISO strings
// (Webfleet reports UTC; we convert so display + date bucketing match
// the technician's day).
export interface TripSuggestion {
  tripId: string | null;
  objectno: string;
  objectName: string | null;
  driverName: string | null; // Webfleet's per-trip driver, if configured
  startTime: string; // 'YYYY-MM-DDTHH:mm:ss', Europe/Vienna local
  endTime: string;
  km: number;        // trip distance, 2 decimals
  durationMinutes: number;
  startAddress: string | null;
  endAddress: string | null;
}

// ─────────────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  ticketId: string | null;
  mesonicCustomerId: string | null;
  customerName: string | null;
  title: string;
  description: string | null;
  kind: AppointmentKind;
  startsAt: string; // ISO timestamp
  endsAt: string;
  allDay: boolean;
  location: string | null;
  status: AppointmentStatus;
  standortId: number | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated by joins
  assignees?: AppointmentAssignee[];
}

export interface AppointmentInput {
  ticketId?: string | null;
  mesonicCustomerId?: string | null;
  customerName?: string | null;
  title: string;
  description?: string | null;
  kind?: AppointmentKind;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  location?: string | null;
  status?: AppointmentStatus;
  standortId?: number | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface AppointmentAssignee {
  id: string;
  appointmentId: string;
  employeeId: string;
  role: AssigneeRole;
  createdAt: string;
  // Populated by join
  _employeeName?: string;
}

// ─────────────────────────────────────────────────────────────────────

export interface RepairOrder {
  id: string;
  ticketId: string;
  appointmentId: string | null;
  seqNumber: number;
  status: RepairOrderStatus;
  workDescription: string | null;
  gpsTravelNote: string | null;
  signatureData: string | null;
  signedAt: string | null;
  signedByName: string | null;
  performedAt: IsoDate;
  billable: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated by joins
  entries?: RepairOrderEntry[];
  materials?: RepairOrderMaterial[];
}

export interface RepairOrderInput {
  ticketId: string;
  appointmentId?: string | null;
  workDescription?: string | null;
  gpsTravelNote?: string | null;
  performedAt?: IsoDate;
  billable?: boolean;
  createdBy?: string | null;
}

export interface RepairOrderEntry {
  id: string;
  repairOrderId: string;
  employeeId: string;
  serviceRateCode: string;
  workMinutes: number;
  travelMode: TravelMode | null;
  travelZoneCode: string | null;
  travelKm: number | null;
  travelWegzeitMinutes: number;
  note: string | null;
  createdAt: string;
  // Populated by joins
  _employeeName?: string;
  _serviceRateLabel?: string;
  _serviceRateValue?: number;
  _travelZoneLabel?: string;
  _travelZoneFlatRate?: number;
}

export interface RepairOrderEntryInput {
  employeeId: string;
  serviceRateCode: string;
  workMinutes: number;
  travelMode?: TravelMode | null;
  travelZoneCode?: string | null;
  travelKm?: number | null;
  travelWegzeitMinutes?: number;
  note?: string | null;
}

export interface RepairOrderMaterial {
  id: string;
  repairOrderId: string;
  mesonicArtikelNr: string;
  bezeichnung: string;
  quantity: number;
  unitPrice: number;
  total: number; // generated column
  createdAt: string;
}

export interface RepairOrderMaterialInput {
  mesonicArtikelNr: string;
  bezeichnung: string;
  quantity: number;
  unitPrice: number;
}

// Admin correction on a repair order (Gutschrift/Korrektur). A signed net
// amount (negative = reduction) with a required reason. Never edits the
// original signed line-items; billing sums these in. Internal only.
export interface RepairOrderAdjustment {
  id: string;
  repairOrderId: string;
  amount: number; // signed net EUR
  reason: string;
  createdBy: string | null;
  createdAt: string;
  // Populated by join
  _authorName?: string;
}

export interface RepairOrderAdjustmentInput {
  amount: number;
  reason: string;
  createdBy?: string | null;
}

// ─────────────────────────────────────────────────────────────────────

export interface TicketComment {
  id: string;
  ticketId: string;
  kind: CommentKind;
  body: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string | null;
  // External = posted by the customer through the public share-link
  // portal. Internal staff comments are isExternal=false.
  isExternal: boolean;
  createdAt: string;
  // Populated by join
  _authorName?: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string | null;
  repairOrderId: string | null;
  storagePath: string; // 'tickets/<ticket_id>/<filename>' in bucket 'ticket-attachments'
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────
// Billing summary — computed in app from repair_order entries + materials

export interface BillingPosition {
  // Type of position for grouping/sort
  kind: 'labor' | 'travel_flat' | 'travel_km' | 'travel_wegzeit' | 'material' | 'service_flat' | 'adjustment';
  label: string;
  quantity: number;       // hours, km, units
  unit: string;           // 'h', 'km', 'Stk', 'pauschale'
  unitPrice: number;
  total: number;          // quantity * unitPrice (already net)
  // Context (which rep_order/entry/material this came from)
  repairOrderId: string;
  repairOrderSeq: number;
  employeeId?: string;
  employeeName?: string;
  mesonicArtikelNr?: string | null;
}

export interface RepairOrderBilling {
  repairOrderId: string;
  seqNumber: number;
  performedAt: IsoDate;
  signed: boolean;
  positions: BillingPosition[];
  laborTotal: number;
  travelTotal: number;
  materialTotal: number;
  serviceTotal: number;
  adjustmentTotal: number; // signed sum of corrections
  subtotal: number; // sum of above (net)
}

export interface BillingSummary {
  ticketId: string;
  ticketNumber: string;
  repairOrders: RepairOrderBilling[];
  laborTotal: number;
  travelTotal: number;
  materialTotal: number;
  serviceTotal: number;
  adjustmentTotal: number;
  subtotalNet: number;
  vatPercent: number; // 20
  vatAmount: number;
  grandTotalGross: number;
}
