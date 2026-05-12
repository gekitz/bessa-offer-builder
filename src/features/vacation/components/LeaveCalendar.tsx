import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import {
  listEmployees,
  listLeaveRequests,
  listLeaveTypes,
  type LeaveType,
} from '../api/vacationApi';
import {
  listShifts,
  listSlotKinds,
  listSwaps,
} from '../../shifts/api/shiftApi';
import type { Shift, ShiftSlotKind, ShiftSwap } from '../../shifts/types';
import { firstName as shiftFirstName, shortSlotLabel } from '../../shifts/lib/format';
import ShiftDetailModal from '../../shifts/components/ShiftDetailModal';
import type { Employee, IsoDate, LeaveRequest, LeaveTypeCode } from '../types';
import type { CalendarEvent } from '../../calendar/types';
import DayDetailModal from './DayDetailModal';

interface LeaveCalendarProps {
  initialYear?: number;
  initialMonth?: number; // 0..11
  // Initial view mode. Defaults to month.
  initialViewMode?: 'month' | 'year';
  // Bumping this counter externally forces a re-fetch.
  reloadKey?: number;
  // When set, both the right-click context menu ("Antrag erstellen")
  // and the drag-to-range gesture across cells call this. For single-day
  // creates start === end; for ranges, start <= end.
  onAddRequest?: (start: IsoDate, end: IsoDate) => void;
  // Logged-in employee. Drives "is this my shift" affordances on the
  // shift detail modal (Tausch anbieten, accept/decline pending swap).
  currentEmployeeId?: string | null;
  // Optional appointment layer — when provided, each day cell shows
  // a violet badge with the count of appointments starting on that
  // day, and the DayDetailModal lists them.
  appointments?: CalendarEvent[];
}

type ViewMode = 'month' | 'year';

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const TYPE_COLORS: Record<LeaveTypeCode, string> = {
  urlaub:        'bg-blue-100 text-blue-800',
  zeitausgleich: 'bg-indigo-100 text-indigo-800',
  krankenstand:  'bg-red-100 text-red-800',
  schule:        'bg-cyan-100 text-cyan-800',
  pflege:        'bg-orange-100 text-orange-800',
  schulung:      'bg-violet-100 text-violet-800',
  sonderurlaub:  'bg-slate-100 text-slate-700',
};

// Pull just the bg-* / text-* tokens out of a TYPE_COLORS entry. Used
// by the year-view mini cell where we layer a half-fill overlay on
// top of the cell rather than tint the whole background.
function splitColorClass(combined: string): { bg: string; text: string } {
  const parts = combined.split(/\s+/);
  return {
    bg: parts.find((p) => p.startsWith('bg-')) ?? '',
    text: parts.find((p) => p.startsWith('text-')) ?? '',
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toIso(year: number, month: number, day: number): IsoDate {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

interface GridCell {
  iso: IsoDate;
  year: number;
  month: number; // 0..11
  day: number;
  current: boolean;
}

// 6-row Mon-first grid for the given (year, month).
export function buildMonthGrid(year: number, month: number): GridCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const dow = (firstOfMonth.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const start = new Date(Date.UTC(year, month, 1 - dow));
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    cells.push({ iso: toIso(y, m, day), year: y, month: m, day, current: m === month });
  }
  return cells;
}

// True if the leave range covers the day (inclusive on both ends),
// using string compare which works for YYYY-MM-DD ISO dates.
function leaveCoversDay(leave: { startDate: IsoDate; endDate: IsoDate }, day: IsoDate): boolean {
  return leave.startDate <= day && day <= leave.endDate;
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export default function LeaveCalendar({
  initialYear,
  initialMonth,
  initialViewMode = 'month',
  reloadKey = 0,
  onAddRequest,
  currentEmployeeId = null,
  appointments,
}: LeaveCalendarProps) {
  const today = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  // Fullscreen overlay — fixed inset-0 z-50 when on. Escape collapses.
  // The fixed overlay also fixes the year-view mini grids being cramped
  // in a 720px max-w-3xl page container.
  const [expanded, setExpanded] = useState(false);
  const [viewYear, setViewYear] = useState(initialYear ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth ?? today.getMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<Array<LeaveRequest & { id: string }>>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [slotKinds, setSlotKinds] = useState<ShiftSlotKind[]>([]);
  const [pendingSwaps, setPendingSwaps] = useState<ShiftSwap[]>([]);
  // Internal counter that re-fires the data fetch after a swap action
  // (separate from the parent-controlled reloadKey so internal state
  // changes don't ping the parent).
  const [internalReload, setInternalReload] = useState(0);
  // The shift currently open in the detail modal, or null.
  const [openShift, setOpenShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  // Becomes true after the first successful (or failed) fetch.
  // Subsequent month navigations keep the previous grid mounted
  // and only show a small inline spinner — no full panel swap, no
  // height collapse, no flicker.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ISO of the cell the user clicked, if any. Drives the day-detail modal.
  const [openDay, setOpenDay] = useState<IsoDate | null>(null);
  // Right-click context menu state — null when closed.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; day: IsoDate } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  // Drag-to-range select. While `drag` is set, mouse-enter on a cell
  // updates `drag.end`; mouse-up commits the range.
  const [drag, setDrag] = useState<{ start: IsoDate; end: IsoDate } | null>(null);
  // Tracks whether the user actually moved across cells during the
  // drag — used to suppress the onClick day-detail modal on drag-end
  // (mouseUp on a different cell than mouseDown).
  const dragMovedRef = useRef(false);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const rangeStart = viewMode === 'year'
    ? toIso(viewYear, 0, 1)
    : grid[0]!.iso;
  const rangeEnd = viewMode === 'year'
    ? toIso(viewYear, 11, 31)
    : grid[grid.length - 1]!.iso;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listLeaveRequests({
        status: ['pending', 'approved'],
        rangeStart,
        rangeEnd,
      }),
      listEmployees({ activeOnly: false }),
      listLeaveTypes(),
      listShifts({
        rangeStart,
        rangeEnd,
        status: ['assigned', 'swap_pending'],
      }),
      listSlotKinds(),
      listSwaps({ status: 'pending' }),
    ]).then(([reqs, emps, types, shifts_, slotKinds_, swaps_]) => {
      if (cancelled) return;
      setLeaves(reqs);
      setEmployees(emps);
      setLeaveTypes(types);
      setShifts(shifts_);
      setSlotKinds(slotKinds_);
      setPendingSwaps(swaps_);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    });
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, reloadKey, internalReload]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const typeByCode = useMemo(
    () => new Map<LeaveTypeCode, LeaveType>(leaveTypes.map((t) => [t.code, t])),
    [leaveTypes],
  );
  const slotKindById = useMemo(
    () => new Map<number, ShiftSlotKind>(slotKinds.map((k) => [k.id, k])),
    [slotKinds],
  );
  // Group shifts by date so cell rendering is O(1) per cell.
  const shiftsByDate = useMemo(() => {
    const out = new Map<IsoDate, Shift[]>();
    for (const s of shifts) {
      const arr = out.get(s.date);
      if (arr) arr.push(s);
      else out.set(s.date, [s]);
    }
    return out;
  }, [shifts]);
  // Index appointments by their starting calendar day (in local time).
  // Multi-day appointments still appear only on their start day for
  // now — the cells just show a violet count badge.
  const appointmentsByDate = useMemo(() => {
    const out = new Map<IsoDate, CalendarEvent[]>();
    for (const a of appointments ?? []) {
      const d = new Date(a.startsAt);
      const iso = toIso(d.getFullYear(), d.getMonth(), d.getDate());
      const arr = out.get(iso);
      if (arr) arr.push(a);
      else out.set(iso, [a]);
    }
    return out;
  }, [appointments]);
  // Index pending swaps by shift id (each shift can have at most one
  // pending swap touching it).
  const pendingSwapByShiftId = useMemo(() => {
    const out = new Map<string, ShiftSwap>();
    for (const sw of pendingSwaps) {
      out.set(sw.requesterShiftId, sw);
      out.set(sw.targetShiftId, sw);
    }
    return out;
  }, [pendingSwaps]);
  const todayIso: IsoDate = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const leavesOnOpenDay = useMemo(() => {
    if (!openDay) return [];
    return leaves.filter((l) => leaveCoversDay(l, openDay));
  }, [openDay, leaves]);

  const appointmentsOnOpenDay = useMemo(() => {
    if (!openDay) return [];
    return appointmentsByDate.get(openDay) ?? [];
  }, [openDay, appointmentsByDate]);

  function handlePrev() {
    if (viewMode === 'year') {
      setViewYear((y) => y - 1);
      return;
    }
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function handleNext() {
    if (viewMode === 'year') {
      setViewYear((y) => y + 1);
      return;
    }
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }
  function handleToday() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  }
  // Click a mini-month header in year view → switch to month view for it.
  function handleOpenMonth(year: number, month: number) {
    setViewYear(year);
    setViewMonth(month);
    setViewMode('month');
  }

  // Right-click any cell opens the context menu, anchored at the
  // mouse position. No-op when the parent didn't supply onAddRequest.
  function handleCellContextMenu(e: React.MouseEvent, day: IsoDate) {
    if (!onAddRequest) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, day });
  }

  function handleCellMouseDown(e: React.MouseEvent, day: IsoDate) {
    // Only the primary button starts a drag. Right-click is handled
    // separately, middle-click does nothing.
    if (e.button !== 0 || !onAddRequest) return;
    dragMovedRef.current = false;
    setDrag({ start: day, end: day });
  }

  function handleCellMouseEnter(day: IsoDate) {
    if (!drag) return;
    if (day !== drag.end) {
      dragMovedRef.current = true;
      setDrag({ start: drag.start, end: day });
    }
  }

  // Single document-level mouseup handler commits the drag — works
  // whether the user releases on a cell, on the calendar header, or
  // outside the component entirely. Multi-cell drags commit as a
  // range; single-cell mouseDown+mouseUp with no movement falls
  // through to the cell's normal onClick (which opens day-detail).
  useEffect(() => {
    if (!drag) return;
    function onUp() {
      if (dragMovedRef.current && onAddRequest && drag) {
        const a = drag.start;
        const b = drag.end;
        const start = a <= b ? a : b;
        const end = a <= b ? b : a;
        onAddRequest(start, end);
      }
      setDrag(null);
    }
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [drag, onAddRequest]);

  // Membership check for highlighting cells inside the active drag.
  function isInDrag(iso: IsoDate): boolean {
    if (!drag) return false;
    const lo = drag.start <= drag.end ? drag.start : drag.end;
    const hi = drag.start <= drag.end ? drag.end : drag.start;
    return lo <= iso && iso <= hi;
  }

  // Escape exits fullscreen. Skip while a context menu or day-detail
  // modal is open — those have their own Escape handlers we don't
  // want to steal from.
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (contextMenu || openDay) return;
      setExpanded(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, contextMenu, openDay]);

  // Close the context menu on any click outside the menu, or Escape.
  // Use a target-aware bubble-phase listener so a click on the
  // menuitem itself can fire its own onClick before we tear the
  // menu down.
  useEffect(() => {
    if (!contextMenu) return;
    function maybeClose(e: MouseEvent) {
      const target = e.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) return;
      setContextMenu(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setContextMenu(null); }
    document.addEventListener('mousedown', maybeClose);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', maybeClose);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const wrapperClass = expanded
    // Fullscreen overlay: cover the whole viewport, scroll if needed.
    ? 'fixed inset-0 z-50 bg-white border-0 overflow-auto flex flex-col'
    : 'bg-white rounded-xl border-2 border-slate-200 overflow-hidden';

  return (
    <div className={wrapperClass} data-testid="leave-calendar">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrev}
            aria-label={viewMode === 'year' ? 'Vorheriges Jahr' : 'Vorheriger Monat'}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-200"
            style={{ fontSize: 11 }}
          >
            Heute
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label={viewMode === 'year' ? 'Nächstes Jahr' : 'Nächster Monat'}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="font-bold text-slate-700" style={{ fontSize: 13 }}>
          {viewMode === 'year' ? viewYear : `${MONTHS_DE[viewMonth]} ${viewYear}`}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex bg-slate-200 rounded-lg p-0.5" role="group" aria-label="Ansicht">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              aria-pressed={viewMode === 'month'}
              className={`rounded-md px-2 py-0.5 transition-colors ${
                viewMode === 'month' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              style={{ fontSize: 11 }}
            >
              Monat
            </button>
            <button
              type="button"
              onClick={() => setViewMode('year')}
              aria-pressed={viewMode === 'year'}
              className={`rounded-md px-2 py-0.5 transition-colors ${
                viewMode === 'year' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              style={{ fontSize: 11 }}
            >
              Jahr
            </button>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Vollbild verlassen' : 'Vollbild'}
            aria-pressed={expanded}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200"
            title={expanded ? 'Vollbild verlassen (Esc)' : 'Vollbild'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Only show the full loading panel before we have any data
          to draw. Subsequent navigations keep the previous grid
          mounted to avoid a height jump + flicker. */}
      {loading && !hasLoadedOnce && (
        <div className="text-center py-8 text-slate-400">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
          <p style={{ fontSize: 12 }}>Kalender wird geladen…</p>
        </div>
      )}

      {!loading && error && (
        <div className="p-5 bg-red-50 border-t-2 border-red-200">
          <div className="flex items-start gap-2 text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold" style={{ fontSize: 13 }}>
                Kalender konnte nicht geladen werden
              </div>
              <div className="font-mono mt-0.5" style={{ fontSize: 11 }}>{error}</div>
            </div>
          </div>
        </div>
      )}

      {(!loading || hasLoadedOnce) && !error && viewMode === 'year' && (
        <div className="p-3 relative" data-testid="calendar-year-grid">
          {loading && hasLoadedOnce && (
            <div
              className="absolute top-2 right-3 flex items-center gap-1.5 text-slate-400"
              style={{ fontSize: 10 }}
              aria-live="polite"
            >
              <Loader2 size={11} className="animate-spin" />
              <span>Aktualisieren…</span>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {MONTHS_DE.map((monthName, m) => (
              <MiniMonthGrid
                key={m}
                year={viewYear}
                month={m}
                monthName={monthName}
                leaves={leaves}
                shiftsByDate={shiftsByDate}
                currentEmployeeId={currentEmployeeId}
                todayIso={todayIso}
                onClickDay={(iso) => setOpenDay(iso)}
                onClickMonth={handleOpenMonth}
              />
            ))}
          </div>

          {openDay && (
            <DayDetailModal
              day={openDay}
              leaves={leavesOnOpenDay}
              appointments={appointmentsOnOpenDay}
              employees={employeeById}
              leaveTypes={typeByCode}
              onClose={() => setOpenDay(null)}
            />
          )}

          {leaveTypes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
              {leaveTypes.map((t) => (
                <span
                  key={t.code}
                  className={`inline-flex items-center rounded px-1.5 ${TYPE_COLORS[t.code] ?? 'bg-slate-100 text-slate-700'}`}
                  style={{ fontSize: 10 }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {(!loading || hasLoadedOnce) && !error && viewMode === 'month' && (
        <div className="p-3 relative" data-testid="calendar-grid">
          {/* Subtle in-flight indicator on month navigation. */}
          {loading && hasLoadedOnce && (
            <div
              className="absolute top-2 right-3 flex items-center gap-1.5 text-slate-400"
              style={{ fontSize: 10 }}
              aria-live="polite"
            >
              <Loader2 size={11} className="animate-spin" />
              <span>Aktualisieren…</span>
            </div>
          )}
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS_DE.map((w) => (
              <div
                key={w}
                className="text-center text-slate-400 font-medium"
                style={{ fontSize: 10 }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const dayLeaves = leaves.filter((l) => leaveCoversDay(l, cell.iso));
              const dayShifts = shiftsByDate.get(cell.iso) ?? [];
              const dayAppointments = appointmentsByDate.get(cell.iso) ?? [];
              const isToday = cell.iso === todayIso;
              const visible = dayLeaves.slice(0, 3);
              const overflow = dayLeaves.length - visible.length;
              const inDrag = isInDrag(cell.iso);
              return (
                <button
                  type="button"
                  key={cell.iso}
                  data-testid={`cal-cell-${cell.iso}`}
                  onClick={() => setOpenDay(cell.iso)}
                  onContextMenu={(e) => handleCellContextMenu(e, cell.iso)}
                  onMouseDown={(e) => handleCellMouseDown(e, cell.iso)}
                  onMouseEnter={() => handleCellMouseEnter(cell.iso)}
                  className={`min-h-[64px] rounded-md border p-1 text-left flex flex-col gap-1 hover:border-red-300 transition-colors select-none ${
                    inDrag
                      ? 'bg-red-50 border-red-300'
                      : cell.current
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between ${
                      isToday
                        ? 'text-red-600 font-semibold'
                        : cell.current ? 'text-slate-700' : 'text-slate-400'
                    }`}
                    style={{ fontSize: 11 }}
                  >
                    {dayAppointments.length > 0 ? (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5"
                        style={{ fontSize: 9 }}
                        title={`${dayAppointments.length} Termin${dayAppointments.length === 1 ? '' : 'e'}`}
                        data-testid={`cal-appointment-badge-${cell.iso}`}
                      >
                        <span className="inline-block w-1 h-1 rounded-full bg-violet-600" />
                        {dayAppointments.length}
                      </span>
                    ) : <span />}
                    <span>{cell.day}</span>
                  </div>
                  {dayShifts.map((s) => {
                    const emp = s.employeeId ? employeeById.get(s.employeeId) : null;
                    const isMine = !!currentEmployeeId && s.employeeId === currentEmployeeId;
                    const pending = s.status === 'swap_pending';
                    const tone = pending
                      ? 'bg-amber-200 text-amber-900 border-amber-400'
                      : isMine
                        ? 'bg-red-700 text-white border-red-700'
                        : 'bg-slate-700 text-white border-slate-700';
                    return (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        data-testid={`cal-shift-${s.id}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenShift(s);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenShift(s);
                          }
                        }}
                        className={`truncate rounded px-1 py-0.5 border ${tone} cursor-pointer`}
                        style={{ fontSize: 10 }}
                        title={`${emp?.name ?? s.employeeId ?? '—'} · ${shortSlotLabel(s.slotKindCode)}${pending ? ' · Tausch offen' : ''}`}
                      >
                        {emp ? shiftFirstName(emp.name) : '—'} · {shortSlotLabel(s.slotKindCode)}
                      </div>
                    );
                  })}
                  {visible.map((l) => {
                    const emp = employeeById.get(l.employeeId);
                    const colorClass = TYPE_COLORS[l.leaveTypeCode] ?? 'bg-slate-100 text-slate-700';
                    // Mark half days only on the start or end day
                    // they apply to. A multi-day leave with a half-day
                    // start renders as "½ Stefan" on its first cell
                    // and plain "Stefan" on subsequent cells.
                    const isHalfStart = l.startDate === cell.iso && l.halfDayStart;
                    const isHalfEnd = l.endDate === cell.iso && l.halfDayEnd;
                    const halfMarker = isHalfStart || isHalfEnd ? '½ ' : '';
                    const tooltip = `${emp?.name ?? l.employeeId} · ${l.leaveTypeCode}${halfMarker ? ' · halber Tag' : ''}`;
                    return (
                      <div
                        key={l.id}
                        className={`truncate rounded px-1 py-0.5 ${colorClass}`}
                        style={{ fontSize: 10 }}
                        title={tooltip}
                      >
                        {halfMarker}{emp ? firstName(emp.name) : l.employeeId}
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <div className="text-slate-500 px-1 py-0.5" style={{ fontSize: 10 }}>
                      +{overflow} weitere
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {openDay && (
            <DayDetailModal
              day={openDay}
              leaves={leavesOnOpenDay}
              appointments={appointmentsOnOpenDay}
              employees={employeeById}
              leaveTypes={typeByCode}
              onClose={() => setOpenDay(null)}
            />
          )}

          {openShift && (
            <ShiftDetailModal
              shift={openShift}
              allShifts={shifts}
              slotKinds={slotKindById}
              employees={employeeById}
              pendingSwap={pendingSwapByShiftId.get(openShift.id) ?? null}
              currentEmployeeId={currentEmployeeId}
              onClose={() => setOpenShift(null)}
              onChange={() => setInternalReload((k) => k + 1)}
            />
          )}

          {contextMenu && onAddRequest && (
            <div
              ref={contextMenuRef}
              role="menu"
              data-testid="calendar-context-menu"
              className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 160 }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onAddRequest(contextMenu.day, contextMenu.day);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
                style={{ fontSize: 13 }}
              >
                Antrag erstellen
              </button>
            </div>
          )}

          {/* Legend */}
          {leaveTypes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
              {leaveTypes.map((t) => (
                <span
                  key={t.code}
                  className={`inline-flex items-center rounded px-1.5 ${TYPE_COLORS[t.code] ?? 'bg-slate-100 text-slate-700'}`}
                  style={{ fontSize: 10 }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MiniMonthGridProps {
  year: number;
  month: number;
  monthName: string;
  leaves: Array<LeaveRequest & { id: string }>;
  // Day → list of shifts on that day. Used to render a small bottom
  // marker so users can spot weekend / holiday duty at a glance in
  // year view.
  shiftsByDate: Map<IsoDate, Shift[]>;
  // Logged-in employee. When one of their shifts falls on a day,
  // the marker uses red instead of slate.
  currentEmployeeId: string | null;
  todayIso: IsoDate;
  onClickDay: (iso: IsoDate) => void;
  onClickMonth: (year: number, month: number) => void;
}

// Compact 7×6 month grid used by the year overview. Each day is a
// small square; if any leave covers it, the cell is tinted with the
// primary leave's type color. Click on the month name jumps to month
// view; click on a day opens the day-detail modal.
function MiniMonthGrid({
  year,
  month,
  monthName,
  leaves,
  shiftsByDate,
  currentEmployeeId,
  todayIso,
  onClickDay,
  onClickMonth,
}: MiniMonthGridProps) {
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  return (
    <div className="bg-white rounded-md border border-slate-200">
      <button
        type="button"
        onClick={() => onClickMonth(year, month)}
        className="w-full text-center px-2 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 rounded-t-md border-b border-slate-100"
        style={{ fontSize: 11 }}
        aria-label={`${monthName} ${year} öffnen`}
      >
        {monthName}
      </button>
      <div className="p-1.5">
        <div className="grid grid-cols-7 gap-0.5 mb-0.5">
          {WEEKDAYS_DE.map((w) => (
            <div
              key={w}
              className="text-center text-slate-400 font-medium"
              style={{ fontSize: 8 }}
            >
              {w[0]}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {grid.map((cell) => {
            if (!cell.current) {
              return <div key={cell.iso} className="aspect-square" />;
            }
            const dayLeaves = leaves.filter((l) => leaveCoversDay(l, cell.iso));
            const primary = dayLeaves[0];
            const { bg: primaryBg, text: primaryText } = primary
              ? splitColorClass(TYPE_COLORS[primary.leaveTypeCode] ?? 'bg-slate-100 text-slate-700')
              : { bg: '', text: 'text-slate-500' };
            const isToday = cell.iso === todayIso;
            const overflow = dayLeaves.length > 1;
            // Half-day visualization. halfDayStart on the start cell
            // means the morning is FREE (afternoon is the leave); we
            // tint only the right half. halfDayEnd on the end cell
            // means the afternoon is free; we tint the left half.
            // Convention chosen so the tinted side reads as "you are
            // out during this half of the day".
            const halfStart = !!primary && primary.startDate === cell.iso && primary.halfDayStart;
            const halfEnd = !!primary && primary.endDate === cell.iso && primary.halfDayEnd;
            // Both flags on the same cell (rare edge case: a one-day
            // request flagged both ways) → tint the full cell rather
            // than visualize an empty leave.
            const fullTint = !!primary && !(halfStart !== halfEnd);
            const titleSuffix = halfStart || halfEnd ? ' · ½ Tag' : '';
            return (
              <button
                type="button"
                key={cell.iso}
                onClick={() => onClickDay(cell.iso)}
                data-testid={`cal-mini-cell-${cell.iso}`}
                className={`aspect-square rounded-sm flex items-center justify-center relative ${primaryText} ${
                  isToday ? 'ring-1 ring-red-500' : ''
                } ${primary ? 'font-semibold' : 'hover:bg-slate-100'}`}
                style={{ fontSize: 9 }}
                title={dayLeaves.length > 0
                  ? `${cell.iso} · ${dayLeaves.length} ${dayLeaves.length === 1 ? 'Antrag' : 'Anträge'}${titleSuffix}`
                  : cell.iso}
              >
                {primary && fullTint && (
                  <span
                    aria-hidden="true"
                    data-testid={`cal-mini-fill-${cell.iso}`}
                    className={`absolute inset-0 rounded-sm ${primaryBg}`}
                  />
                )}
                {primary && halfStart && !halfEnd && (
                  <span
                    aria-hidden="true"
                    data-testid={`cal-mini-half-start-${cell.iso}`}
                    className={`absolute right-0 top-0 bottom-0 w-1/2 rounded-r-sm ${primaryBg}`}
                  />
                )}
                {primary && halfEnd && !halfStart && (
                  <span
                    aria-hidden="true"
                    data-testid={`cal-mini-half-end-${cell.iso}`}
                    className={`absolute left-0 top-0 bottom-0 w-1/2 rounded-l-sm ${primaryBg}`}
                  />
                )}
                <span className="relative">{cell.day}</span>
                {overflow && (
                  <span
                    aria-hidden="true"
                    data-testid={`cal-mini-multi-${cell.iso}`}
                    className="absolute top-0.5 right-0.5 rounded-full bg-slate-700"
                    style={{ width: 4, height: 4 }}
                  />
                )}
                {/* Bottom stripe marks shift days. Red when the
                    logged-in user is on duty, slate for everyone
                    else. Stays under the day number (no overlap). */}
                {(() => {
                  const dayShifts = shiftsByDate.get(cell.iso);
                  if (!dayShifts || dayShifts.length === 0) return null;
                  const mine = !!currentEmployeeId
                    && dayShifts.some((s) => s.employeeId === currentEmployeeId);
                  return (
                    <span
                      aria-hidden="true"
                      data-testid={`cal-mini-shift-${cell.iso}`}
                      className={`absolute left-0 right-0 bottom-0 rounded-b-sm ${mine ? 'bg-red-700' : 'bg-slate-700'}`}
                      style={{ height: 2 }}
                    />
                  );
                })()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
