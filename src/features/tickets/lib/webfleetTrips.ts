// Pure Webfleet trip logic — no network, no Supabase, fully testable.
//
// Two jobs:
//   1. resolveVehicle()  — given a technician + date, which car (Webfleet
//      objectno) were they in? Handles the "usually fixed car, sometimes
//      a swap" reality via dated vehicle_assignments rows.
//   2. normalizeTrip()   — map a raw WEBFLEET.connect trip record into the
//      units a repair-order entry needs (km + minutes), tolerating the
//      API's field-name variations.
//
// The raw field names below are WEBFLEET.connect's documented ones, with
// fallbacks for known aliases. Confirm against a live response via the
// webfleet-proxy `debug` action before relying on any single one.

import type { IsoDate } from '../../vacation/types';
import type { TripSuggestion, VehicleAssignment } from '../types';

// Loose shape — the API returns many more fields than we consume.
export type RawWebfleetTrip = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────
// Vehicle resolution

// Which vehicle assignment applies to this employee on this date?
// A row applies when validFrom <= date <= validTo (validTo null = open).
// If several apply (a day-swap row layered over the standing one), the
// latest validFrom wins — the more specific assignment.
export function resolveVehicle(
  assignments: VehicleAssignment[],
  employeeId: string,
  date: IsoDate,
): VehicleAssignment | null {
  const applicable = assignments.filter(
    (a) =>
      a.employeeId === employeeId &&
      a.validFrom <= date &&
      (a.validTo == null || date <= a.validTo),
  );
  if (applicable.length === 0) return null;
  // ISO dates (YYYY-MM-DD) compare correctly as strings.
  return applicable.reduce((best, a) => (a.validFrom > best.validFrom ? a : best));
}

// ─────────────────────────────────────────────────────────────────────
// Raw-record helpers

function pickString(raw: RawWebfleetTrip, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(raw: RawWebfleetTrip, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      // Webfleet may send "1.234" (meters) or localized numbers; be lenient.
      const n = Number(v.replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Join address parts into one line, dropping empty parts. (Webfleet's
// `*_postext` is already a full line; the split street/city fields are
// only fallbacks for other account configs.)
function joinAddress(...parts: (string | null)[]): string | null {
  const joined = parts.filter((p) => p && p.trim() !== '').join(', ');
  return joined || null;
}

// Webfleet reports timestamps in UTC (…Z). Convert an absolute instant
// to Europe/Vienna wall-clock ISO ('YYYY-MM-DDTHH:mm:ss') so the day a
// trip is bucketed under, and the HH:mm we display, match the
// technician's local day (handles CET/CEST via the Intl tz database).
export function toViennaIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g: Record<string, string> = {};
  for (const p of parts) g[p.type] = p.value;
  const hour = g.hour === '24' ? '00' : g.hour; // Intl edge case at midnight
  return `${g.year}-${g.month}-${g.day}T${hour}:${g.minute}:${g.second}`;
}

// ─────────────────────────────────────────────────────────────────────
// Normalisation

// Map one raw trip record to a TripSuggestion. Returns null if the record
// lacks the minimum fields (start/end time) to be usable.
export function normalizeTrip(raw: RawWebfleetTrip): TripSuggestion | null {
  // Keep the raw (absolute, UTC) timestamps for duration maths; convert
  // to Vienna-local only for the stored/display values.
  const rawStart = pickString(raw, 'start_time', 'starttime', 'start');
  const rawEnd = pickString(raw, 'end_time', 'endtime', 'end');
  if (!rawStart || !rawEnd) return null;

  // Distance is reported in metres (`distance`, with aliases).
  const meters = pickNumber(raw, 'distance', 'tripdistance', 'trip_distance') ?? 0;
  const km = round2(meters / 1000);

  const durationMinutes = tripDurationMinutes(raw, rawStart, rawEnd);

  return {
    tripId: pickString(raw, 'tripid', 'trip_id'),
    objectno: pickString(raw, 'objectno', 'objectuid') ?? '',
    objectName: pickString(raw, 'objectname', 'object_name'),
    driverName: pickString(raw, 'drivername', 'driver_name'),
    startTime: toViennaIso(rawStart),
    endTime: toViennaIso(rawEnd),
    km,
    durationMinutes,
    // `*_postext` is the full formatted address line; the split
    // street/city fields are fallbacks for other account configs.
    startAddress: joinAddress(
      pickString(raw, 'start_postext', 'start_streetname', 'start_position'),
      pickString(raw, 'start_city', 'start_citypostcode'),
    ),
    endAddress: joinAddress(
      pickString(raw, 'end_postext', 'end_streetname', 'end_position'),
      pickString(raw, 'end_city', 'end_citypostcode'),
    ),
  };
}

// Prefer an explicit trip-time field (seconds) when present; otherwise
// derive from the ISO start/end timestamps.
function tripDurationMinutes(
  raw: RawWebfleetTrip,
  startTime: string,
  endTime: string,
): number {
  const seconds = pickNumber(raw, 'triptime', 'trip_time', 'duration');
  if (seconds != null && seconds > 0) return Math.round(seconds / 60);
  const ms = Date.parse(endTime) - Date.parse(startTime);
  if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 60000);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────
// Filtering + formatting for the UI

// The local calendar date (YYYY-MM-DD) an ISO timestamp falls on, taken
// verbatim from the string's date part so we honour Webfleet's local
// time rather than re-projecting through the JS Date timezone.
export function tripDate(isoTime: string): IsoDate {
  return isoTime.slice(0, 10);
}

// Trips a technician made on a given date, newest first — the candidate
// list to offer as fill-suggestions on a repair-order entry.
export function tripsForDate(trips: TripSuggestion[], date: IsoDate): TripSuggestion[] {
  return trips
    .filter((t) => tripDate(t.startTime) === date)
    .sort((a, b) => b.startTime.localeCompare(a.startTime));
}

function hhmm(isoTime: string): string {
  return isoTime.slice(11, 16);
}

function kmLabel(km: number): string {
  return km.toFixed(2).replace('.', ',');
}

// Human-readable summary stored in repair_orders.gps_travel_note so the
// origin of an auto-filled km/Wegzeit value stays visible.
// e.g. "Webfleet: 09:12–09:46 · 23,40 km · W-1234 → Kundenstr. 5, Wien"
export function formatTripNote(trip: TripSuggestion): string {
  const parts = [
    `${hhmm(trip.startTime)}–${hhmm(trip.endTime)}`,
    `${kmLabel(trip.km)} km`,
  ];
  const vehicle = trip.objectName || trip.objectno;
  const route = trip.endAddress
    ? `${vehicle} → ${trip.endAddress}`
    : vehicle;
  if (route) parts.push(route);
  return `Webfleet: ${parts.join(' · ')}`;
}
