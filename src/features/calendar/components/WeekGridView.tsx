import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  listAppointments,
  listLeaveRequests,
  listEmployees,
} from '../api/calendarApi';
import AppointmentForm from '../../tickets/components/AppointmentForm';
import type { Appointment, AppointmentStatus } from '../../tickets/types';
import type { Employee, IsoDate, LeaveRequest } from '../../vacation/types';
import type { LayerVisibility } from '../types';
import { getAppointment } from '../../tickets/api/ticketApi';

// ─────────────────────────────────────────────────────────────────────
// Arbeitswoche: time-grid Mo–Fr × 7:00–19:00. Appointment blocks live
// at their real start/end times; click an empty slot to create, click
// a block to edit. Each block is coloured per primary technician so
// "wer ist wo?" is scannable from across the room.
// ─────────────────────────────────────────────────────────────────────

const HOUR_START = 7;
const HOUR_END = 19;
const HOUR_PX = 56; // height per hour row; one row = `${HOUR_PX}px`
const DAY_COUNT = 5; // Mo–Fr — Arbeitswoche
const WEEKDAY_LABEL_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

// Tailwind needs static class names, so pre-build the palette. Each
// entry: bg / border / text / dot variant. Hashed by employee_id.
const TECH_PALETTE: Array<{ bg: string; border: string; text: string }> = [
  { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-900' },
  { bg: 'bg-blue-100',   border: 'border-blue-400',   text: 'text-blue-900' },
  { bg: 'bg-emerald-100',border: 'border-emerald-400',text: 'text-emerald-900' },
  { bg: 'bg-amber-100',  border: 'border-amber-400',  text: 'text-amber-900' },
  { bg: 'bg-pink-100',   border: 'border-pink-400',   text: 'text-pink-900' },
  { bg: 'bg-cyan-100',   border: 'border-cyan-400',   text: 'text-cyan-900' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-900' },
  { bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-900' },
];

const UNASSIGNED_PALETTE = { bg: 'bg-slate-100', border: 'border-slate-400', text: 'text-slate-700' };

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function paletteFor(empId: string | undefined): typeof TECH_PALETTE[number] {
  if (!empId) return UNASSIGNED_PALETTE;
  return TECH_PALETTE[hashStr(empId) % TECH_PALETTE.length]!;
}

// ─────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function toIso(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function isoToday(): IsoDate {
  return toIso(new Date());
}
function startOfIsoWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + diff);
  return out;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function combineDayHour(day: IsoDate, hour: number, minute = 0): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour, minute, 0, 0);
}

// ─────────────────────────────────────────────────────────────────────
// Overlap-lane layout — classic two-pass for fixed-track scheduling.
// Each appointment gets a "lane" index within a group of overlapping
// appointments. Lanes are 0..n-1; width per block = 1/n.
// ─────────────────────────────────────────────────────────────────────

interface LaneBlock {
  appointment: Appointment;
  startMin: number; // minutes since midnight on that day
  endMin: number;
  lane: number;
  laneCount: number; // lanes in this overlap-group
}

function layoutLanes(items: Array<{ appointment: Appointment; startMin: number; endMin: number }>): LaneBlock[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: LaneBlock[] = [];

  // Group overlapping items, then for each group assign lanes.
  let group: Array<{ appointment: Appointment; startMin: number; endMin: number }> = [];
  let groupEnd = -1;

  function flushGroup() {
    if (group.length === 0) return;
    // Greedy: place each in the first lane whose last endMin <= startMin.
    const laneEnds: number[] = [];
    const laneOf: number[] = [];
    for (const item of group) {
      let assigned = -1;
      for (let i = 0; i < laneEnds.length; i += 1) {
        if (laneEnds[i]! <= item.startMin) {
          laneEnds[i] = item.endMin;
          assigned = i;
          break;
        }
      }
      if (assigned === -1) {
        laneEnds.push(item.endMin);
        assigned = laneEnds.length - 1;
      }
      laneOf.push(assigned);
    }
    const laneCount = laneEnds.length;
    group.forEach((item, i) => {
      out.push({
        appointment: item.appointment,
        startMin: item.startMin,
        endMin: item.endMin,
        lane: laneOf[i]!,
        laneCount,
      });
    });
    group = [];
    groupEnd = -1;
  }

  for (const item of sorted) {
    if (group.length === 0) {
      group.push(item);
      groupEnd = item.endMin;
    } else if (item.startMin < groupEnd) {
      // overlaps current group
      group.push(item);
      groupEnd = Math.max(groupEnd, item.endMin);
    } else {
      flushGroup();
      group.push(item);
      groupEnd = item.endMin;
    }
  }
  flushGroup();
  return out;
}

// ─────────────────────────────────────────────────────────────────────

interface WeekGridViewProps {
  visibility: LayerVisibility;
  reloadKey?: number;
  currentEmployeeId?: string | null;
  // Called when the user clicks an empty slot — UnifiedCalendar
  // opens its standalone AppointmentForm with these prefilled.
  onCreateAt?: (defaultStartsAt: string, defaultEndsAt: string) => void;
}

export default function WeekGridView({
  visibility,
  reloadKey = 0,
  currentEmployeeId = null,
  onCreateAt,
}: WeekGridViewProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfIsoWeek(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leaves, setLeaves] = useState<Array<LeaveRequest & { id: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const days: IsoDate[] = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => toIso(addDays(weekStart, i))),
    [weekStart],
  );
  const rangeFrom = days[0]!;
  const rangeTo = days[DAY_COUNT - 1]!;
  const todayIso = isoToday();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startsAtFrom = `${rangeFrom}T00:00:00`;
      const endsAtTo = `${rangeTo}T23:59:59`;
      const [appts, lrs, emps] = await Promise.all([
        listAppointments({ from: startsAtFrom, to: endsAtTo }),
        listLeaveRequests({
          rangeStart: rangeFrom,
          rangeEnd: rangeTo,
          status: ['pending', 'approved'],
        }),
        listEmployees({ activeOnly: true }),
      ]);
      setAppointments(appts);
      setLeaves(lrs);
      setEmployees(emps);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // Bucket appointments by day, run lane-layout per day.
  const lanesByDay = useMemo(() => {
    if (!visibility.appointment) return new Map<IsoDate, LaneBlock[]>();
    const byDay = new Map<IsoDate, Array<{ appointment: Appointment; startMin: number; endMin: number }>>();
    for (const a of appointments) {
      if (a.allDay) continue;
      const start = new Date(a.startsAt);
      const end = new Date(a.endsAt);
      const dayIso = toIso(start);
      if (!days.includes(dayIso)) continue;
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();
      // Clamp to visible range so blocks always render in-view.
      const clampedStart = Math.max(HOUR_START * 60, startMin);
      const clampedEnd = Math.min(HOUR_END * 60, endMin);
      if (clampedEnd <= clampedStart) continue;
      const list = byDay.get(dayIso) ?? [];
      list.push({ appointment: a, startMin: clampedStart, endMin: clampedEnd });
      byDay.set(dayIso, list);
    }
    const out = new Map<IsoDate, LaneBlock[]>();
    for (const [day, items] of byDay) {
      out.set(day, layoutLanes(items));
    }
    return out;
  }, [appointments, days, visibility.appointment]);

  // All-day strip — currently leave rows (Urlaub/Krankenstand) per day.
  // Appointments with allDay=true would join this list but the existing
  // AppointmentForm always creates timed appointments, so this is leaves-only
  // until that changes.
  const leavesByDay = useMemo(() => {
    if (!visibility.leave) return new Map<IsoDate, Array<LeaveRequest & { id: string }>>();
    const out = new Map<IsoDate, Array<LeaveRequest & { id: string }>>();
    for (const day of days) out.set(day, []);
    for (const l of leaves) {
      for (const day of days) {
        if (day >= l.startDate && day <= l.endDate) {
          out.get(day)!.push(l);
        }
      }
    }
    return out;
  }, [leaves, days, visibility.leave]);

  // Hour rows for the time gutter + grid backdrop
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = HOUR_START; h < HOUR_END; h += 1) out.push(h);
    return out;
  }, []);

  function handleEmptySlotClick(day: IsoDate, hour: number) {
    if (!onCreateAt) return;
    const start = combineDayHour(day, hour, 0);
    const end = combineDayHour(day, hour + 1, 0);
    onCreateAt(start.toISOString(), end.toISOString());
  }

  async function handleBlockClick(a: Appointment) {
    // Re-fetch to get fresh assignees etc.
    try {
      const fresh = await getAppointment(a.id);
      setEditing(fresh ?? a);
    } catch {
      setEditing(a);
    }
  }

  function gotoPrevWeek() {
    setWeekStart((d) => addDays(d, -7));
  }
  function gotoNextWeek() {
    setWeekStart((d) => addDays(d, 7));
  }
  function gotoThisWeek() {
    setWeekStart(startOfIsoWeek(new Date()));
  }

  const weekLabel = `${weekStart.toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
  })} – ${addDays(weekStart, DAY_COUNT - 1).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;

  return (
    <div data-testid="week-grid-view">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-sm font-medium text-slate-700">{weekLabel}</div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={gotoPrevWeek}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Vorherige Woche"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={gotoThisWeek}
            className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={gotoNextWeek}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Nächste Woche"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        {/* Day header row */}
        <div className="grid sticky top-0 z-20 bg-white border-b border-slate-200" style={{
          gridTemplateColumns: `56px repeat(${DAY_COUNT}, minmax(140px, 1fr))`,
        }}>
          <div className="px-2 py-2" />
          {days.map((day, i) => {
            const d = new Date(day);
            const isToday = day === todayIso;
            return (
              <div
                key={day}
                className={`px-2 py-2 text-center text-xs font-semibold border-l border-slate-200 ${
                  isToday ? 'bg-red-50 text-red-700' : 'text-slate-600'
                }`}
              >
                <div>{WEEKDAY_LABEL_DE[i]}</div>
                <div className="font-mono font-normal text-slate-400">
                  {pad2(d.getDate())}.{pad2(d.getMonth() + 1)}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day strip (leaves spanning the day) */}
        {visibility.leave && Array.from(leavesByDay.values()).some((arr) => arr.length > 0) && (
          <div className="grid border-b border-slate-200 bg-red-50/30" style={{
            gridTemplateColumns: `56px repeat(${DAY_COUNT}, minmax(140px, 1fr))`,
          }}>
            <div className="px-2 py-1 text-[10px] text-slate-400 self-center">ganztägig</div>
            {days.map((day) => {
              const items = leavesByDay.get(day) ?? [];
              return (
                <div key={day} className="border-l border-slate-200 p-1 space-y-0.5">
                  {items.map((l) => {
                    const emp = employeesById.get(l.employeeId);
                    return (
                      <div
                        key={l.id}
                        className="rounded bg-red-200/70 text-red-900 text-xs px-1.5 py-0.5 truncate"
                        title={`${emp?.name ?? '—'} · ${l.leaveTypeCode}`}
                      >
                        {emp?.name ?? '—'}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid */}
        <div className="relative">
          {loading && appointments.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          )}
          <div className="grid" style={{
            gridTemplateColumns: `56px repeat(${DAY_COUNT}, minmax(140px, 1fr))`,
          }}>
            {/* Time gutter */}
            <div>
              {hours.map((h) => (
                <div
                  key={h}
                  className="text-[10px] text-slate-400 text-right pr-1.5 border-b border-slate-100"
                  style={{ height: HOUR_PX }}
                >
                  {pad2(h)}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day) => {
              const blocks = lanesByDay.get(day) ?? [];
              const isToday = day === todayIso;
              return (
                <div
                  key={day}
                  className={`relative border-l border-slate-200 ${isToday ? 'bg-red-50/15' : ''}`}
                  style={{ height: (HOUR_END - HOUR_START) * HOUR_PX }}
                >
                  {/* Hour separator backdrop */}
                  {hours.map((h, idx) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleEmptySlotClick(day, h)}
                      aria-label={`Termin am ${day} um ${h}:00 erstellen`}
                      className="absolute left-0 right-0 border-b border-slate-100 hover:bg-violet-50/40 transition-colors"
                      style={{ top: idx * HOUR_PX, height: HOUR_PX }}
                      data-testid={`week-empty-${day}-${h}`}
                    />
                  ))}

                  {/* Appointment blocks */}
                  {blocks.map((b) => {
                    const top = ((b.startMin - HOUR_START * 60) / 60) * HOUR_PX;
                    const height = Math.max(20, ((b.endMin - b.startMin) / 60) * HOUR_PX);
                    const widthPct = 100 / b.laneCount;
                    const leftPct = b.lane * widthPct;
                    const a = b.appointment;
                    const primaryEmpId = a.assignees?.[0]?.employeeId;
                    const pal = paletteFor(primaryEmpId);
                    const empName = primaryEmpId ? employeesById.get(primaryEmpId)?.name : null;
                    const customer = a.customerName;
                    const start = new Date(a.startsAt);
                    const end = new Date(a.endsAt);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleBlockClick(a)}
                        className={`absolute rounded-md border-l-4 ${pal.bg} ${pal.border} ${pal.text} px-1.5 py-1 text-left overflow-hidden hover:shadow-md transition-shadow`}
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          zIndex: 10,
                        }}
                        title={`${a.title}${customer ? ` — ${customer}` : ''}${empName ? ` · ${empName}` : ''}`}
                        data-testid={`week-block-${a.id}`}
                      >
                        <div className="text-[10px] font-mono opacity-80 leading-tight">
                          {pad2(start.getHours())}:{pad2(start.getMinutes())}–
                          {pad2(end.getHours())}:{pad2(end.getMinutes())}
                        </div>
                        <div className="text-xs font-semibold leading-tight truncate">{a.title}</div>
                        {customer && (
                          <div className="text-[11px] truncate opacity-85">{customer}</div>
                        )}
                        {empName && (
                          <div className="text-[10px] truncate opacity-70">{empName}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editing && (
        <AppointmentForm
          appointment={editing}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
