import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Car, Loader2, MapPin, Save, Trash2, X } from 'lucide-react';
import { addEntry, deleteEntry, listServiceRates, listTravelZones, updateEntry } from '../api/ticketApi';
import { fetchTrips, fetchWebfleetVehicles, listVehicleAssignments, type WebfleetVehicle } from '../api/webfleetApi';
import { formatTripNote, resolveVehicle, tripsForDate } from '../lib/webfleetTrips';
import type { Employee, IsoDate } from '../../vacation/types';
import Select from '../../../components/Select';
import type {
  RepairOrderEntry,
  RepairOrderEntryInput,
  ServiceRate,
  TravelMode,
  TravelZone,
  TripSuggestion,
} from '../types';

interface TimeEntryFormProps {
  repairOrderId: string;
  // The repair order's service date — used to look up Webfleet trips.
  performedAt: IsoDate;
  // null = create mode, otherwise edit
  entry?: RepairOrderEntry | null;
  employees: Employee[];
  defaultEmployeeId?: string | null;
  onSaved: (entry: RepairOrderEntry) => void;
  onDeleted?: () => void;
  onCancel: () => void;
}

const TRAVEL_MODE_LABEL: Record<NonNullable<TravelMode>, string> = {
  none: 'Keine Anfahrt',
  pauschale: 'KFZ-Pauschale (Zone)',
  km_plus_wegzeit: 'KM-Geld + Wegzeit',
  km_inkl_wegzeit: 'KM-Geld inkl. Wegzeit',
};

function parseInt0(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseFloat0(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function TimeEntryForm({
  repairOrderId,
  performedAt,
  entry = null,
  employees,
  defaultEmployeeId = null,
  onSaved,
  onDeleted,
  onCancel,
}: TimeEntryFormProps) {
  const isEdit = !!entry;

  const [rates, setRates] = useState<ServiceRate[]>([]);
  const [zones, setZones] = useState<TravelZone[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [employeeId, setEmployeeId] = useState(entry?.employeeId ?? defaultEmployeeId ?? '');
  const [serviceRateCode, setServiceRateCode] = useState(entry?.serviceRateCode ?? 'PC_NB');
  const [workHours, setWorkHours] = useState(
    entry ? String(Math.floor(entry.workMinutes / 60)) : '0',
  );
  const [workMinsExtra, setWorkMinsExtra] = useState(
    entry ? String(entry.workMinutes % 60) : '0',
  );
  const [travelMode, setTravelMode] = useState<TravelMode>(entry?.travelMode ?? 'none');
  const [travelZoneCode, setTravelZoneCode] = useState(entry?.travelZoneCode ?? '');
  const [travelKm, setTravelKm] = useState(entry?.travelKm != null ? String(entry.travelKm) : '');
  const [travelWegzeitHours, setTravelWegzeitHours] = useState(
    entry ? String(Math.floor((entry.travelWegzeitMinutes ?? 0) / 60)) : '0',
  );
  const [travelWegzeitMinsExtra, setTravelWegzeitMinsExtra] = useState(
    entry ? String((entry.travelWegzeitMinutes ?? 0) % 60) : '0',
  );
  const [note, setNote] = useState(entry?.note ?? '');

  // Webfleet trip suggestions — loaded lazily when a km-based travel
  // mode is active and a technician is selected.
  const [trips, setTrips] = useState<TripSuggestion[] | null>(null);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Vehicle resolution + override. assigned* comes from the technician's
  // standing assignment; overrideObjectno lets them pick a different car
  // (swap days). activeObjectno is whichever is currently shown.
  const [assignedObjectno, setAssignedObjectno] = useState<string | null>(null);
  const [assignedLabel, setAssignedLabel] = useState<string | null>(null);
  const [overrideObjectno, setOverrideObjectno] = useState<string | null>(null);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [vehicles, setVehicles] = useState<WebfleetVehicle[] | null>(null);

  const kmMode = travelMode === 'km_plus_wegzeit' || travelMode === 'km_inkl_wegzeit';
  const activeObjectno = overrideObjectno ?? assignedObjectno;

  useEffect(() => {
    let cancelled = false;
    Promise.all([listServiceRates(), listTravelZones()])
      .then(([r, z]) => {
        if (cancelled) return;
        setRates(r);
        setZones(z);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLookupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ratesByCategory = useMemo(() => {
    const groups = new Map<string, ServiceRate[]>();
    for (const r of rates) {
      const arr = groups.get(r.category) ?? [];
      arr.push(r);
      groups.set(r.category, arr);
    }
    return groups;
  }, [rates]);

  // Reset the vehicle override whenever the technician or date changes —
  // an override only makes sense for the tech/day it was chosen on.
  useEffect(() => {
    setOverrideObjectno(null);
    setShowVehiclePicker(false);
  }, [employeeId, performedAt]);

  // Resolve the assigned vehicle (unless overridden) and load its trips
  // for the service date. A technician with no assignment and no override
  // simply gets an empty list + the "other vehicle" escape hatch.
  useEffect(() => {
    if (!kmMode || !employeeId) {
      setTrips(null);
      setTripsError(null);
      setAssignedObjectno(null);
      return;
    }
    let cancelled = false;
    setTripsLoading(true);
    setTripsError(null);
    (async () => {
      try {
        let objectno = overrideObjectno;
        if (!objectno) {
          const assignments = await listVehicleAssignments();
          const vehicle = resolveVehicle(assignments, employeeId, performedAt);
          if (!cancelled) {
            setAssignedObjectno(vehicle?.webfleetObjectNo ?? null);
            setAssignedLabel(vehicle?.label ?? null);
          }
          objectno = vehicle?.webfleetObjectNo ?? null;
        }
        if (!objectno) {
          if (!cancelled) setTrips([]);
          return;
        }
        const all = await fetchTrips(objectno, performedAt);
        if (!cancelled) setTrips(tripsForDate(all, performedAt));
      } catch (err) {
        if (!cancelled) setTripsError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setTripsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kmMode, employeeId, performedAt, overrideObjectno]);

  // Reveal the vehicle picker and lazily load the vehicle list.
  async function openVehiclePicker() {
    setShowVehiclePicker(true);
    if (vehicles == null) {
      try {
        setVehicles(await fetchWebfleetVehicles());
      } catch {
        setVehicles([]);
      }
    }
  }

  // Friendly "001 Renault Kangoo lang" label for an objectno, from the
  // loaded vehicle list or the assignment's stored label as a fallback.
  function vehicleName(objectno: string | null): string | null {
    if (!objectno) return null;
    const v = vehicles?.find((x) => x.objectno === objectno);
    if (v?.objectName) return `${v.objectno} ${v.objectName}`;
    if (objectno === assignedObjectno && assignedLabel) return `${objectno} ${assignedLabel}`;
    return objectno;
  }

  // Fill km (+ Wegzeit for the km_plus mode) from a picked trip, and
  // prefill the note with the trip's origin if the tech hasn't typed one.
  function applyTrip(trip: TripSuggestion) {
    setSelectedTripId(trip.tripId);
    setTravelKm(String(trip.km).replace('.', ','));
    if (travelMode === 'km_plus_wegzeit') {
      setTravelWegzeitHours(String(Math.floor(trip.durationMinutes / 60)));
      setTravelWegzeitMinsExtra(String(trip.durationMinutes % 60));
    }
    setNote((prev) => (prev.trim() ? prev : formatTripNote(trip)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) {
      setError('Bitte einen Techniker wählen.');
      return;
    }
    const workMinutes = parseInt0(workHours) * 60 + parseInt0(workMinsExtra);
    if (workMinutes <= 0 && travelMode === 'none') {
      setError('Arbeitszeit oder Anfahrt muss erfasst werden.');
      return;
    }
    const wegzeitMinutes =
      parseInt0(travelWegzeitHours) * 60 + parseInt0(travelWegzeitMinsExtra);
    const kmVal = travelKm.trim() ? parseFloat0(travelKm) : null;

    if (travelMode === 'pauschale' && !travelZoneCode) {
      setError('Bitte eine KFZ-Zone wählen.');
      return;
    }
    if ((travelMode === 'km_plus_wegzeit' || travelMode === 'km_inkl_wegzeit') && (kmVal == null || kmVal < 0)) {
      setError('Bitte KM eingeben.');
      return;
    }

    const input: RepairOrderEntryInput = {
      employeeId,
      serviceRateCode,
      workMinutes,
      travelMode,
      travelZoneCode: travelMode === 'pauschale' ? travelZoneCode : null,
      travelKm: travelMode === 'pauschale' || travelMode === 'none' ? null : kmVal,
      travelWegzeitMinutes: travelMode === 'km_plus_wegzeit' ? wegzeitMinutes : 0,
      note: note.trim() || null,
    };

    setSaving(true);
    setError(null);
    try {
      const saved = isEdit
        ? await updateEntry(entry!.id, input)
        : await addEntry(repairOrderId, input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry || !onDeleted) return;
    if (!window.confirm('Eintrag wirklich löschen?')) return;
    setSaving(true);
    setError(null);
    try {
      await deleteEntry(entry.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3"
      data-testid="time-entry-form"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">
          {isEdit ? 'Zeiteintrag bearbeiten' : 'Zeiteintrag hinzufügen'}
        </span>
        <button type="button" onClick={onCancel} className="rounded p-1 hover:bg-slate-200">
          <X size={14} className="text-slate-500" />
        </button>
      </div>

      {/* Tech + Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Techniker</label>
          <Select
            value={employeeId}
            onChange={setEmployeeId}
            options={[
              { value: '', label: '—' },
              ...employees.map((emp) => ({ value: emp.id, label: emp.name })),
            ]}
            ariaLabel="Techniker"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Stundensatz</label>
          {/* Categories are flattened into a single list; the category
              name shows on the right as a hint (the Select component
              doesn't support optgroups). */}
          <Select
            value={serviceRateCode}
            onChange={setServiceRateCode}
            options={Array.from(ratesByCategory.entries()).flatMap(([category, items]) =>
              items.map((r) => ({
                value: r.code,
                label: `${r.label} (€${r.rate.toFixed(2)}/${r.unit === 'hour' ? 'h' : r.unit === 'km' ? 'km' : 'Pauschale'})`,
                hint: category,
              })),
            )}
            disabled={lookupsLoading}
            ariaLabel="Stundensatz"
          />
        </div>
      </div>

      {/* Work time */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Arbeitszeit</label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            value={workHours}
            onChange={(e) => setWorkHours(e.target.value)}
            className="w-16 px-2 py-1.5 rounded border border-slate-200 text-sm text-right"
            data-testid="work-hours"
          />
          <span className="text-xs text-slate-500">h</span>
          <input
            type="text"
            inputMode="numeric"
            value={workMinsExtra}
            onChange={(e) => setWorkMinsExtra(e.target.value)}
            className="w-16 px-2 py-1.5 rounded border border-slate-200 text-sm text-right"
            data-testid="work-mins"
          />
          <span className="text-xs text-slate-500">min</span>
        </div>
      </div>

      {/* Travel */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Car size={12} className="text-slate-400" />
          <label className="block text-xs font-medium text-slate-600">Anfahrt</label>
        </div>
        <Select
          value={travelMode ?? 'none'}
          onChange={(v) => setTravelMode(v as TravelMode)}
          options={(Object.keys(TRAVEL_MODE_LABEL) as Array<NonNullable<TravelMode>>).map((m) => ({
            value: m,
            label: TRAVEL_MODE_LABEL[m],
          }))}
          ariaLabel="Anfahrt-Modus"
        />

        {travelMode === 'pauschale' && (
          <Select
            value={travelZoneCode ?? ''}
            onChange={setTravelZoneCode}
            options={[
              { value: '', label: '— Zone wählen —' },
              ...zones.map((z) => ({
                value: z.code,
                label: `${z.label} (€${z.flatRate.toFixed(2)})`,
              })),
            ]}
            ariaLabel="KFZ-Zone"
          />
        )}

        {kmMode && (
          <div className="space-y-2">
            <WebfleetTrips
              loading={tripsLoading}
              error={tripsError}
              trips={trips}
              selectedTripId={selectedTripId}
              onPick={applyTrip}
              vehicleLabel={vehicleName(activeObjectno)}
              noVehicle={activeObjectno == null}
            />
            {!tripsLoading && !tripsError && (
              showVehiclePicker ? (
                vehicles == null ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 size={11} className="animate-spin" />
                    Fahrzeuge werden geladen…
                  </div>
                ) : (
                  <Select
                    value={activeObjectno ?? ''}
                    onChange={(v) => setOverrideObjectno(v || null)}
                    options={vehicles.map((veh) => ({
                      value: veh.objectno,
                      label:
                        `${veh.objectno} ${veh.objectName ?? ''}`.trim() +
                        (veh.objectno === assignedObjectno ? '  (zugeordnet)' : ''),
                    }))}
                    ariaLabel="Fahrzeug wählen"
                  />
                )
              ) : (
                <button
                  type="button"
                  onClick={openVehiclePicker}
                  className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
                >
                  Anderes Fahrzeug wählen ›
                </button>
              )
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={travelKm}
                  onChange={(e) => setTravelKm(e.target.value)}
                  placeholder="0"
                  className="w-20 px-2 py-1.5 rounded border border-slate-200 text-sm text-right"
                />
                <span className="text-xs text-slate-500">km</span>
              </div>
              {travelMode === 'km_plus_wegzeit' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">Wegzeit:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={travelWegzeitHours}
                    onChange={(e) => setTravelWegzeitHours(e.target.value)}
                    className="w-14 px-2 py-1.5 rounded border border-slate-200 text-sm text-right"
                  />
                  <span className="text-xs text-slate-500">h</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={travelWegzeitMinsExtra}
                    onChange={(e) => setTravelWegzeitMinsExtra(e.target.value)}
                    className="w-14 px-2 py-1.5 rounded border border-slate-200 text-sm text-right"
                  />
                  <span className="text-xs text-slate-500">min</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notiz</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional"
          className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-sm"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {isEdit && onDeleted ? (
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-red-600 hover:bg-red-50"
            disabled={saving}
          >
            <Trash2 size={12} />
            Löschen
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-100"
            disabled={saving}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 disabled:opacity-50"
            disabled={saving || lookupsLoading}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {isEdit ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </form>
  );
}

function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

interface WebfleetTripsProps {
  loading: boolean;
  error: string | null;
  // null = not loaded yet; [] = loaded but nothing to offer.
  trips: TripSuggestion[] | null;
  selectedTripId: string | null;
  onPick: (trip: TripSuggestion) => void;
  // Friendly label of the vehicle whose trips are shown, or null when
  // no vehicle could be resolved.
  vehicleLabel: string | null;
  noVehicle: boolean;
}

// Webfleet trip suggestions for a vehicle on the service date. Tapping a
// trip fills km + Wegzeit above. The vehicle-override control is rendered
// by the parent, just below this.
function WebfleetTrips({
  loading,
  error,
  trips,
  selectedTripId,
  onPick,
  vehicleLabel,
  noVehicle,
}: WebfleetTripsProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={12} className="animate-spin" />
        Webfleet-Fahrten werden geladen…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600">
        <AlertCircle size={12} />
        Webfleet nicht erreichbar: {error}
      </div>
    );
  }
  if (trips == null) return null;

  const header = (
    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <Car size={12} className="text-slate-400" />
      Webfleet-Fahrten
      {vehicleLabel && <span className="font-normal text-slate-400">· {vehicleLabel}</span>}
    </div>
  );

  if (trips.length === 0) {
    return (
      <div className="space-y-1" data-testid="webfleet-trips">
        {header}
        <div className="text-xs text-slate-400">
          {noVehicle
            ? 'Kein Fahrzeug zugeordnet.'
            : 'Keine Fahrten an diesem Tag.'}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1" data-testid="webfleet-trips">
      {header}
      {trips.map((t) => {
        const selected = t.tripId != null && t.tripId === selectedTripId;
        return (
          <button
            key={t.tripId ?? `${t.startTime}-${t.km}`}
            type="button"
            onClick={() => onPick(t)}
            className={`w-full text-left rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              selected
                ? 'border-slate-800 bg-slate-800/5'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-2 font-medium text-slate-700">
              <span>{hhmm(t.startTime)}–{hhmm(t.endTime)}</span>
              <span className="text-slate-300">·</span>
              <span>{t.km.toFixed(2).replace('.', ',')} km</span>
              <span className="text-slate-300">·</span>
              <span>{t.durationMinutes} min</span>
            </div>
            {t.endAddress && (
              <div className="flex items-center gap-1 mt-0.5 text-slate-500 truncate">
                <MapPin size={10} className="flex-shrink-0" />
                <span className="truncate">{t.endAddress}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
