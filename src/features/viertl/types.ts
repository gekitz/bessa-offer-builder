// Viertl (Gastrotouch) Lizenz-Tracking — Domänentypen.
//
// Spiegelt supabase/migrations/20260827120000_create_viertl_tracking.sql
// in der camelCase + ISO-String-Konvention der App. snake_case ↔
// camelCase Mapping passiert ausschließlich in api/viertlApi.ts.

// Pipeline-Status einer Installation:
//   new           — noch nicht bearbeitet
//   waiting       — auf Kunde/Termin warten ("noch warten")
//   offer_created — Angebot erstellt
//   mailed        — Info an Kunde versendet
//   replied       — Kunde hat geantwortet ("retour")
//   done          — erledigt (bereits neue A-Trust)
export type ViertlStatus = 'new' | 'waiting' | 'offer_created' | 'mailed' | 'replied' | 'done';

// Wartungsvertrag: keine / Software / Software+Hardware / Miete
export type ViertlWartung = 'none' | 'sww' | 'sw_hww' | 'miete';

// Kundenzustand: aktiv / sperrt bald zu / geschlossen (→ Viertl informieren)
export type ViertlCustomerStatus = 'active' | 'closing' | 'closed';

// Hersteller des POS-Systems. gastrotouch = die bisherige Viertl-Welt.
export type ViertlVendor = 'gastrotouch' | 'sharp' | 'rch' | 'bhs';

// Audit-/Aktions-Ereignis
export type ViertlEventType =
  | 'field_change'
  | 'note'
  | 'email_sent'
  | 'email_opened'
  | 'offer_attached'
  | 'ticket_attached'
  | 'viertl_notified';

export interface ViertlLicense {
  id: string;
  mesonicKdnr: string;
  name: string;
  vendor: ViertlVendor;              // Hersteller des POS (gastrotouch = Viertl)
  deviceModel: string | null;       // Freitext-Gerätemodell ("Sharp XEA217")
  source: string | null;            // Herkunft der Zeile ('viertl_excel', …) — read-only
  contact: string | null;
  street: string | null;
  plz: string | null;
  ort: string | null;
  email: string | null;
  emailCheckedAt: string | null;    // wann zuletzt aus Mesonic geprüft (auch wenn leer)
  gastrotouchVersion: string | null;
  lastUpdate: string | null;        // ISO date (YYYY-MM-DD)
  hardwareModel: string | null;
  hardwareNeeded: boolean;
  wartung: ViertlWartung;
  status: ViertlStatus;
  customerStatus: ViertlCustomerStatus;
  closedReason: string | null;
  closedAt: string | null;
  notes: string | null;
  linkedOfferId: string | null;
  linkedTicketId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViertlEvent {
  id: string;
  licenseId: string;
  type: ViertlEventType;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  message: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

// Editierbare Felder. updatedBy* werden bei jedem Update mitgeschickt,
// damit der Audit-Trigger weiß, wer geändert hat.
export interface ViertlLicenseUpdate {
  vendor?: ViertlVendor;
  deviceModel?: string | null;
  status?: ViertlStatus;
  customerStatus?: ViertlCustomerStatus;
  wartung?: ViertlWartung;
  gastrotouchVersion?: string | null;
  hardwareModel?: string | null;
  hardwareNeeded?: boolean;
  email?: string | null;
  closedReason?: string | null;
  notes?: string | null;
}

// Aktor (wer führt die Änderung aus) — aus dem user_profiles-Profil.
export interface ViertlActor {
  id: string | null;
  name: string | null;
}

export interface ViertlFilters {
  search?: string;
  vendor?: ViertlVendor | 'all';
  status?: ViertlStatus | 'all';
  customerStatus?: ViertlCustomerStatus | 'all';
  hardwareNeeded?: boolean;
}
