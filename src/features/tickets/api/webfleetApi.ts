// Webfleet API layer — trip lookups (via the webfleet-proxy Edge
// Function) + vehicle_assignments CRUD (Supabase). Raw-trip parsing lives
// in ../lib/webfleetTrips (pure + tested); this module only handles I/O
// and snake_case ↔ camelCase mapping.

import { supabase } from '../../../lib/supabase';
import { normalizeTrip, type RawWebfleetTrip } from '../lib/webfleetTrips';
import type { IsoDate } from '../../vacation/types';
import type {
  TripSuggestion,
  VehicleAssignment,
  VehicleAssignmentInput,
} from '../types';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// ─────────────────────────────────────────────────────────────────────
// Webfleet vehicles + trips (through the proxy)

export interface WebfleetVehicle {
  objectno: string;
  objectName: string | null;
  driverName: string | null;
}

export async function fetchWebfleetVehicles(): Promise<WebfleetVehicle[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('webfleet-proxy', {
    body: { action: 'objects' },
  });
  if (error) throw new Error(`Webfleet: ${error.message}`);
  if (data?.error) throw new Error(`Webfleet: ${data.error}`);
  const objects: Record<string, unknown>[] = data?.objects ?? [];
  return objects.map((o) => ({
    objectno: String(o.objectno ?? ''),
    objectName: (o.objectname as string) ?? null,
    driverName: (o.drivername as string) ?? null,
  }));
}

// UTC window generous enough to cover the whole Europe/Vienna local day
// (±~1.5 days); trips are then filtered to the exact local date in the
// UI via tripsForDate. Webfleet interprets the range in UTC, so we avoid
// clipping local early-morning/late-evening trips.
function localDayWindow(date: IsoDate): { from: string; to: string } {
  const noonUtc = new Date(`${date}T12:00:00Z`).getTime();
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
  return { from: iso(noonUtc - 36 * 3600 * 1000), to: iso(noonUtc + 36 * 3600 * 1000) };
}

// All trips a vehicle made around the given local date, normalised.
export async function fetchTrips(objectno: string, date: IsoDate): Promise<TripSuggestion[]> {
  const sb = requireSupabase();
  const { from, to } = localDayWindow(date);
  const { data, error } = await sb.functions.invoke('webfleet-proxy', {
    body: { action: 'trips', objectno, from, to },
  });
  if (error) throw new Error(`Webfleet: ${error.message}`);
  if (data?.error) throw new Error(`Webfleet: ${data.error}`);
  const raw: RawWebfleetTrip[] = data?.trips ?? [];
  return raw
    .map(normalizeTrip)
    .filter((t): t is TripSuggestion => t !== null);
}

// ─────────────────────────────────────────────────────────────────────
// vehicle_assignments CRUD

function rowToAssignment(r: Record<string, unknown>): VehicleAssignment {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    webfleetObjectNo: r.webfleet_object_no as string,
    plate: (r.plate as string) ?? null,
    label: (r.label as string) ?? null,
    validFrom: r.valid_from as IsoDate,
    validTo: (r.valid_to as IsoDate) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listVehicleAssignments(): Promise<VehicleAssignment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('vehicle_assignments')
    .select('*')
    .order('valid_from', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToAssignment);
}

export async function createVehicleAssignment(
  input: VehicleAssignmentInput,
): Promise<VehicleAssignment> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('vehicle_assignments')
    .insert({
      employee_id: input.employeeId,
      webfleet_object_no: input.webfleetObjectNo,
      plate: input.plate ?? null,
      label: input.label ?? null,
      valid_from: input.validFrom ?? undefined,
      valid_to: input.validTo ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToAssignment(data);
}

export async function deleteVehicleAssignment(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('vehicle_assignments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
