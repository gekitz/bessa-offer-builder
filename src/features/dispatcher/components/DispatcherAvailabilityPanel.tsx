// Right column of the dispatcher view.
//
// Lets the dispatcher choose a slot duration and look-ahead window,
// then computes the next free slots per technician using the engine
// in lib/availability.ts. Slot pills are click-targets for the booking
// flow wired in a follow-up PR — here they just render with a no-op
// onClick prop so the integration test can assert the grouping.
//
// Pills (not a Select) for slot duration per feedback memory: ≤7 short
// options, often-switched.

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw, Search, AlertCircle } from 'lucide-react';
import type { FreeSlot } from '../lib/availability';
import type { UseAvailabilityOptions } from '../hooks/useAvailability';
import { listEmployees } from '../../calendar/api/calendarApi';
import type { Employee } from '../../vacation/types';

interface Props {
  slots: FreeSlot[];
  loading: boolean;
  error: string | null;
  hasRun: boolean;
  onFindSlots: (opts: UseAvailabilityOptions) => void;
  onPickSlot?: (slot: FreeSlot) => void;
}

const DURATION_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 90, label: '90 min' },
  { minutes: 120, label: '2 h' },
];

const DEFAULT_DAYS_AHEAD = 7;
const STORAGE_KEY = 'dispatcher.slotMinutes';

function readStoredSlotMinutes(): number {
  if (typeof window === 'undefined') return 60;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  return DURATION_OPTIONS.some((o) => o.minutes === n) ? n : 60;
}

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function formatDateLong(iso: string, today: string = todayIsoLocal()): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const base = dt.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (iso === today) return `Heute · ${base}`;
  if (iso === addDaysIso(today, 1)) return `Morgen · ${base}`;
  return base;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
}

interface SlotsByEmpDate {
  employeeId: string;
  employeeName: string;
  byDate: { date: string; slots: FreeSlot[] }[];
}

function groupSlots(
  slots: FreeSlot[],
  nameById: Map<string, string>,
): SlotsByEmpDate[] {
  const map = new Map<string, Map<string, FreeSlot[]>>();
  for (const s of slots) {
    let byDate = map.get(s.employeeId);
    if (!byDate) {
      byDate = new Map();
      map.set(s.employeeId, byDate);
    }
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  const out: SlotsByEmpDate[] = [];
  for (const [employeeId, byDate] of map.entries()) {
    const dates: SlotsByEmpDate['byDate'] = [];
    for (const [date, list] of byDate.entries()) {
      dates.push({ date, slots: list });
    }
    dates.sort((a, b) => (a.date < b.date ? -1 : 1));
    out.push({
      employeeId,
      employeeName: nameById.get(employeeId) ?? employeeId,
      byDate: dates,
    });
  }
  out.sort((a, b) => (a.employeeName < b.employeeName ? -1 : 1));
  return out;
}

export default function DispatcherAvailabilityPanel({
  slots,
  loading,
  error,
  hasRun,
  onFindSlots,
  onPickSlot,
}: Props) {
  const [slotMinutes, setSlotMinutes] = useState<number>(() => readStoredSlotMinutes());
  const [daysAhead, setDaysAhead] = useState<number>(DEFAULT_DAYS_AHEAD);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, String(slotMinutes));
  }, [slotMinutes]);

  useEffect(() => {
    let cancelled = false;
    listEmployees({ activeOnly: true })
      .then((data) => {
        if (!cancelled) setEmployees(data);
      })
      .catch(() => {
        // Non-fatal: we fall back to showing the employeeId.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) for (const t of e.tags ?? []) set.add(t);
    return [...set].sort();
  }, [employees]);
  const filteredEmployeeIds = useMemo(() => {
    if (!activeTag) return undefined;
    return employees.filter((e) => (e.tags ?? []).includes(activeTag)).map((e) => e.id);
  }, [activeTag, employees]);
  const groups = useMemo(() => groupSlots(slots, nameById), [slots, nameById]);

  function handleSearch(overrides?: Partial<{ slotMinutes: number; daysAhead: number; employeeIds: string[] }>) {
    onFindSlots({
      slotMinutes: overrides?.slotMinutes ?? slotMinutes,
      daysAhead: overrides?.daysAhead ?? daysAhead,
      employeeIds: overrides?.employeeIds ?? filteredEmployeeIds,
    });
  }

  function handlePickTag(tag: string | null) {
    setActiveTag(tag);
    if (hasRun) {
      const nextIds = tag ? employees.filter((e) => (e.tags ?? []).includes(tag)).map((e) => e.id) : undefined;
      handleSearch({ employeeIds: nextIds });
    }
  }

  function handleExtendDays() {
    const next = daysAhead + 7;
    setDaysAhead(next);
    handleSearch({ daysAhead: next });
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="text-slate-700 font-semibold mb-2" style={{ fontSize: 13 }}>
          Nächste freie Termine
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {DURATION_OPTIONS.map((opt) => {
            const active = slotMinutes === opt.minutes;
            return (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => setSlotMinutes(opt.minutes)}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  active ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                style={{ fontSize: 11 }}
                data-testid={`dispatcher-duration-${opt.minutes}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2" data-testid="dispatcher-tag-filter">
            <button
              type="button"
              onClick={() => handlePickTag(null)}
              className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                activeTag === null ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              style={{ fontSize: 10 }}
              data-testid="dispatcher-tag-all"
            >
              Alle
            </button>
            {allTags.map((tag) => {
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handlePickTag(active ? null : tag)}
                  className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                    active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  style={{ fontSize: 10 }}
                  data-testid={`dispatcher-tag-${tag}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white px-3 py-1.5 font-medium transition-colors"
            style={{ fontSize: 12 }}
            data-testid="dispatcher-find-slots"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Slots finden
          </button>
          {hasRun && (
            <button
              type="button"
              onClick={handleExtendDays}
              disabled={loading}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 disabled:text-slate-300"
              style={{ fontSize: 11 }}
              title="Weitere 7 Tage einbeziehen"
              data-testid="dispatcher-extend-days"
            >
              <RefreshCw size={11} />+7 Tage
            </button>
          )}
          <span className="ml-auto text-slate-400" style={{ fontSize: 11 }}>
            {daysAhead} Tage
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2">
        {error && (
          <div
            className="flex items-center gap-2 p-2 rounded-lg bg-red-50 text-red-600 border border-red-200"
            style={{ fontSize: 11 }}
          >
            <AlertCircle size={12} /> {error}
          </div>
        )}
        {!hasRun && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 px-4 text-center">
            <CalendarClock size={28} className="mb-3 text-slate-300" />
            <div style={{ fontSize: 12 }}>Dauer wählen und auf „Slots finden" klicken.</div>
          </div>
        )}
        {hasRun && !loading && groups.length === 0 && (
          <div className="text-center py-8 text-slate-400" style={{ fontSize: 12 }}>
            Keine freien Slots in den nächsten {daysAhead} Tagen.
          </div>
        )}
        {groups.length > 0 && (
          <div className="space-y-3" data-testid="dispatcher-slot-groups">
            {groups.map((group) => (
              <div key={group.employeeId} className="rounded-lg border border-slate-200" data-testid="dispatcher-slot-employee">
                <div className="px-2.5 py-1.5 bg-slate-50 rounded-t-lg border-b border-slate-100">
                  <div className="font-semibold text-slate-700" style={{ fontSize: 12 }}>
                    {group.employeeName}
                  </div>
                </div>
                <div className="px-2.5 py-2 space-y-1.5">
                  {group.byDate.map(({ date, slots: daySlots }) => (
                    <div key={date}>
                      <div className="text-slate-500 mb-0.5" style={{ fontSize: 10 }}>
                        {formatDateLong(date)}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {daySlots.map((slot) => (
                          <button
                            key={slot.startsAt}
                            type="button"
                            onClick={() => onPickSlot?.(slot)}
                            className="rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1 font-medium transition-colors"
                            style={{ fontSize: 11 }}
                            data-testid="dispatcher-slot-pill"
                          >
                            {formatTime(slot.startsAt)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
