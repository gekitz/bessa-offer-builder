// Leihstellungen (loaner hardware inventory) — types.
// snake_case ↔ camelCase mapping lives in api/loanerApi.ts.
// Spiegelt supabase/migrations/20260916120000_create_loaner_inventory.sql.
// Siehe docs/leihstellungen.md.

export type IsoDate = string; // 'YYYY-MM-DD'

export type MesonicStandort = 'klagenfurt' | 'wolfsberg';

// available  → in stock, ready to loan
// on_loan    → has an open loan_devices line
// defective  → in repair / not loanable
// retired    → decommissioned (kept for history)
export type LoanerDeviceStatus = 'available' | 'on_loan' | 'defective' | 'retired';

export interface LoanerDevice {
  id: string;
  // Artikel-Identität (Mesonic-Basisartikel). null = ohne Katalogzuordnung.
  productId: string | null;
  // Anzeigename (aus dem Produkt vorbefüllt, aber gespeichert).
  bezeichnung: string;
  serialNumber: string; // Barcode auf dem Aufkleber
  inventoryNo: string | null;
  acquisitionCost: number | null;
  acquiredAt: IsoDate | null;
  // Optionaler €-Tagessatz nur fürs DB-Reporting (nicht verrechnet, v1 nicht im UI).
  notionalDailyValue: number | null;
  status: LoanerDeviceStatus;
  standort: MesonicStandort | null;
  // Gerätetyp-Schlagworte (composable), z. B. ['mobil','kassa','drucker'].
  // Vokabular: lib/deviceTags.ts.
  tags: string[];
  note: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  // Populated by joins (open line, if the device is currently out).
  openLoanDevice?: LoanDevice | null;
}

export interface LoanerDeviceInput {
  productId?: string | null;
  bezeichnung: string;
  serialNumber: string;
  inventoryNo?: string | null;
  acquisitionCost?: number | null;
  acquiredAt?: IsoDate | null;
  notionalDailyValue?: number | null;
  standort?: MesonicStandort | null;
  tags?: string[];
  note?: string | null;
}

// ─────────────────────────────────────────────────────────────────────

export interface Loan {
  id: string;
  customerName: string;
  customerKdnr: string; // Mesonic Kontonummer (immer: Bestandskunde)
  ticketId: string | null;
  startedAt: IsoDate; // Leihbeginn / Check-out
  expectedReturn: IsoDate | null;
  note: string | null;
  // Mesonic-Beleg-Export (Leih-Lieferschein). mesonicBelegKey (<konto>-<n>) ist
  // der Idempotenz-Anker — ist er gesetzt, wird nicht erneut exportiert.
  mesonicBelegLaufnummer: number | null;
  mesonicBelegKey: string | null;
  mesonicBelegCreatedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated by joins
  devices?: LoanDevice[];
}

export interface LoanDevice {
  id: string;
  loanId: string;
  deviceId: string;
  returnedAt: IsoDate | null; // null = noch verliehen
  note: string | null;
  createdAt: string;
  // Populated by joins
  device?: LoanerDevice;
}

// Check-out payload: eine Leihstellung (Kopf) mit einem oder mehreren Geräten.
export interface CheckOutInput {
  customerName: string;
  customerKdnr: string;
  ticketId?: string | null;
  startedAt?: IsoDate;
  expectedReturn?: IsoDate | null;
  note?: string | null;
  deviceIds: string[];
  createdBy?: string | null;
}
