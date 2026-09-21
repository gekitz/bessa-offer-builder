// Leihstellungen (loaner inventory) API layer. Mirrors deliveryNoteApi.ts and
// supabase/migrations/20260916120000_create_loaner_inventory.sql.
//
// snake_case ↔ camelCase mapping happens here so the rest of the app talks to
// the camelCase types from ../types. Siehe docs/leihstellungen.md.
//
// Deferred to later phases (kept out of this layer on purpose):
//   • Mesonic Leih-Lieferschein on check-out  → Phase 4 (lib/loanBeleg.ts)
//   • CRM check-in comment on the customer     → Phase 3 wire-up
// checkOut/checkIn here do the DB writes + device-status bookkeeping only.

import { supabase } from '../../../lib/supabase';
import type {
  CheckOutInput,
  Loan,
  LoanDevice,
  LoanerDevice,
  LoanerDeviceInput,
} from '../types';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────
// Row mappers
// ─────────────────────────────────────────────────────────────────────

function rowToDevice(r: any): LoanerDevice {
  return {
    id: r.id,
    productId: r.product_id ?? null,
    bezeichnung: r.bezeichnung,
    serialNumber: r.serial_number,
    inventoryNo: r.inventory_no ?? null,
    acquisitionCost: r.acquisition_cost != null ? Number(r.acquisition_cost) : null,
    acquiredAt: r.acquired_at ?? null,
    notionalDailyValue: r.notional_daily_value != null ? Number(r.notional_daily_value) : null,
    status: r.status,
    standort: r.standort ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    note: r.note ?? null,
    active: !!r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToLoan(r: any): Loan {
  return {
    id: r.id,
    customerName: r.customer_name,
    customerKdnr: r.customer_kdnr,
    ticketId: r.ticket_id ?? null,
    startedAt: r.started_at,
    expectedReturn: r.expected_return ?? null,
    note: r.note ?? null,
    mesonicBelegLaufnummer: r.mesonic_beleg_laufnummer ?? null,
    mesonicBelegKey: r.mesonic_beleg_key ?? null,
    mesonicBelegCreatedAt: r.mesonic_beleg_created_at ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToLoanDevice(r: any): LoanDevice {
  return {
    id: r.id,
    loanId: r.loan_id,
    deviceId: r.device_id,
    returnedAt: r.returned_at ?? null,
    note: r.note ?? null,
    createdAt: r.created_at,
  };
}

function deviceInputToRow(input: LoanerDeviceInput): Record<string, unknown> {
  return {
    product_id: input.productId ?? null,
    bezeichnung: input.bezeichnung.trim(),
    serial_number: input.serialNumber.trim(),
    inventory_no: input.inventoryNo ?? null,
    acquisition_cost: input.acquisitionCost ?? null,
    acquired_at: input.acquiredAt ?? null,
    notional_daily_value: input.notionalDailyValue ?? null,
    standort: input.standort ?? null,
    tags: input.tags ?? [],
    note: input.note ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Column lists
// ─────────────────────────────────────────────────────────────────────

const DEVICE_COLS =
  'id, product_id, bezeichnung, serial_number, inventory_no, acquisition_cost, acquired_at, notional_daily_value, status, standort, tags, note, active, created_at, updated_at';
const LOAN_COLS =
  'id, customer_name, customer_kdnr, ticket_id, started_at, expected_return, note, mesonic_beleg_laufnummer, mesonic_beleg_key, mesonic_beleg_created_at, created_by, created_at, updated_at';
const LOAN_DEVICE_COLS = 'id, loan_id, device_id, returned_at, note, created_at';

// ─────────────────────────────────────────────────────────────────────
// Devices
// ─────────────────────────────────────────────────────────────────────

// Fleet view: active devices only (retired/inactive hidden).
export async function listDevices(): Promise<LoanerDevice[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loaner_devices')
    .select(DEVICE_COLS)
    .eq('active', true)
    .order('serial_number');
  if (error) throw error;
  return (data ?? []).map(rowToDevice);
}

// Admin view: everything, including inactive/retired.
export async function listDevicesAdmin(): Promise<LoanerDevice[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loaner_devices')
    .select(DEVICE_COLS)
    .order('serial_number');
  if (error) throw error;
  return (data ?? []).map(rowToDevice);
}

// Device + full loan history (each line carries its loan header's startedAt so
// callers can feed computeDeviceMetrics()).
export async function getDevice(
  id: string,
): Promise<{ device: LoanerDevice; history: Array<LoanDevice & { loan: Loan }> } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loaner_devices')
    .select(`${DEVICE_COLS}, loan_devices(${LOAN_DEVICE_COLS}, loans(${LOAN_COLS}))`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const history = ((data as any).loan_devices ?? [])
    .map((ld: any) => ({ ...rowToLoanDevice(ld), loan: rowToLoan(ld.loans) }))
    .sort((a: any, b: any) => (a.loan.startedAt < b.loan.startedAt ? 1 : -1));
  return { device: rowToDevice(data), history };
}

export async function createDevice(input: LoanerDeviceInput): Promise<LoanerDevice> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loaner_devices')
    .insert(deviceInputToRow(input))
    .select(DEVICE_COLS)
    .single();
  if (error) throw error;
  return rowToDevice(data);
}

export async function updateDevice(
  id: string,
  patch: Partial<LoanerDeviceInput> & { status?: LoanerDevice['status']; active?: boolean },
): Promise<LoanerDevice> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.productId !== undefined) dbPatch.product_id = patch.productId;
  if (patch.bezeichnung !== undefined) dbPatch.bezeichnung = patch.bezeichnung.trim();
  if (patch.serialNumber !== undefined) dbPatch.serial_number = patch.serialNumber.trim();
  if (patch.inventoryNo !== undefined) dbPatch.inventory_no = patch.inventoryNo;
  if (patch.acquisitionCost !== undefined) dbPatch.acquisition_cost = patch.acquisitionCost;
  if (patch.acquiredAt !== undefined) dbPatch.acquired_at = patch.acquiredAt;
  if (patch.notionalDailyValue !== undefined) dbPatch.notional_daily_value = patch.notionalDailyValue;
  if (patch.standort !== undefined) dbPatch.standort = patch.standort;
  if (patch.tags !== undefined) dbPatch.tags = patch.tags;
  if (patch.note !== undefined) dbPatch.note = patch.note;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.active !== undefined) dbPatch.active = patch.active;
  const { data, error } = await sb
    .from('loaner_devices')
    .update(dbPatch)
    .eq('id', id)
    .select(DEVICE_COLS)
    .single();
  if (error) throw error;
  return rowToDevice(data);
}

// Soft-decommission: hide from the fleet but keep the row for history.
export async function retireDevice(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('loaner_devices')
    .update({ status: 'retired', active: false })
    .eq('id', id);
  if (error) throw error;
}

// The lookup the Lieferschein scan hook calls: resolve a scanned serial to a
// device plus its currently-open loan line (if the device is out).
export async function findDeviceBySerial(
  serial: string,
): Promise<{ device: LoanerDevice; openLoan: Loan | null; openLoanDevice: LoanDevice | null } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loaner_devices')
    .select(`${DEVICE_COLS}, loan_devices(${LOAN_DEVICE_COLS}, loans(${LOAN_COLS}))`)
    .eq('serial_number', serial.trim())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const open = ((data as any).loan_devices ?? []).find((ld: any) => ld.returned_at == null);
  return {
    device: rowToDevice(data),
    openLoan: open ? rowToLoan(open.loans) : null,
    openLoanDevice: open ? rowToLoanDevice(open) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Loans (check-out / check-in)
// ─────────────────────────────────────────────────────────────────────

// A loan currently has at least one device still out.
export async function listOpenLoans(): Promise<Loan[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loans')
    .select(`${LOAN_COLS}, loan_devices(${LOAN_DEVICE_COLS})`)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => (r.loan_devices ?? []).some((ld: any) => ld.returned_at == null))
    .map((r: any) => ({ ...rowToLoan(r), devices: (r.loan_devices ?? []).map(rowToLoanDevice) }));
}

// A loan header plus the full device rows on it — the set the Leih-Lieferschein
// export needs (bezeichnung + serial live on loaner_devices, not the line).
// Used to (re-)generate the Mesonic Beleg for an existing loan, e.g. when the
// fire-and-forget export at check-out never reached Mesonic.
export async function getLoanWithDevices(
  loanId: string,
): Promise<{ loan: Loan; devices: LoanerDevice[] } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loans')
    .select(`${LOAN_COLS}, loan_devices(${LOAN_DEVICE_COLS}, loaner_devices(${DEVICE_COLS}))`)
    .eq('id', loanId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const devices = ((data as any).loan_devices ?? [])
    .map((ld: any) => (ld.loaner_devices ? rowToDevice(ld.loaner_devices) : null))
    .filter(Boolean) as LoanerDevice[];
  return { loan: rowToLoan(data), devices };
}

// Hand one or more devices to a Bestandskunde: create the loan header, one
// loan_devices line per device, and flip each device to 'on_loan'. The partial
// unique index (device_id WHERE returned_at IS NULL) is the hard guard against
// double-loaning a device. Best-effort rollback of the header if lines fail,
// since supabase-js has no client-side transaction.
// NOTE: the Mesonic Leih-Lieferschein export is fired separately (Phase 4).
export async function checkOut(input: CheckOutInput): Promise<{ loan: Loan; devices: LoanDevice[] }> {
  if (input.deviceIds.length === 0) throw new Error('Keine Geräte zum Verleihen ausgewählt');
  const sb = requireSupabase();

  const { data: loanRow, error: loanErr } = await sb
    .from('loans')
    .insert({
      customer_name: input.customerName,
      customer_kdnr: input.customerKdnr,
      ticket_id: input.ticketId ?? null,
      started_at: input.startedAt ?? today(),
      expected_return: input.expectedReturn ?? null,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(LOAN_COLS)
    .single();
  if (loanErr) throw loanErr;

  const { data: lineRows, error: lineErr } = await sb
    .from('loan_devices')
    .insert(input.deviceIds.map((deviceId) => ({ loan_id: loanRow.id, device_id: deviceId })))
    .select(LOAN_DEVICE_COLS);
  if (lineErr) {
    // Roll back the orphaned header (unique-index violation = device already out).
    await sb.from('loans').delete().eq('id', loanRow.id);
    throw lineErr;
  }

  const { error: statusErr } = await sb
    .from('loaner_devices')
    .update({ status: 'on_loan' })
    .in('id', input.deviceIds);
  if (statusErr) throw statusErr;

  return { loan: rowToLoan(loanRow), devices: (lineRows ?? []).map(rowToLoanDevice) };
}

// Return a single device on a loan: set the line's returned_at and flip the
// device back to 'available'. Posts the CRM check-in comment (Phase 3 wire-up).
export async function checkInDevice(
  loanDeviceId: string,
  opts: { returnedAt?: string; note?: string | null } = {},
): Promise<LoanDevice> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('loan_devices')
    .update({ returned_at: opts.returnedAt ?? today(), note: opts.note ?? null })
    .eq('id', loanDeviceId)
    .select(LOAN_DEVICE_COLS)
    .single();
  if (error) throw error;
  const line = rowToLoanDevice(data);

  const { error: statusErr } = await sb
    .from('loaner_devices')
    .update({ status: 'available' })
    .eq('id', line.deviceId);
  if (statusErr) throw statusErr;

  return line;
}

// Return every still-open device on a loan at once.
export async function checkInLoan(loanId: string, returnedAt?: string): Promise<void> {
  const sb = requireSupabase();
  const { data: lines, error } = await sb
    .from('loan_devices')
    .select('id, device_id, returned_at')
    .eq('loan_id', loanId)
    .is('returned_at', null);
  if (error) throw error;
  const stamp = returnedAt ?? today();
  for (const line of lines ?? []) {
    await checkInDevice(line.id, { returnedAt: stamp });
  }
}

// Persist Laufnummer + Beleg-Key on the loan (idempotency anchor for the
// Leih-Lieferschein export — analog zu setDeliveryNoteBelegExport).
export async function setLoanBelegExport(
  loanId: string,
  laufnummer: number,
  belegKey: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('loans')
    .update({
      mesonic_beleg_laufnummer: laufnummer,
      mesonic_beleg_key: belegKey,
      mesonic_beleg_created_at: new Date().toISOString(),
    })
    .eq('id', loanId);
  if (error) throw error;
}
