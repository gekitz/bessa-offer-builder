import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  listEmployees,
  listLeaveRequests,
  listLeaveTypes,
  type LeaveType,
} from '../api/vacationApi';
import type { Employee, IsoDate, LeaveRequest, LeaveTypeCode } from '../types';
import DayDetailModal from './DayDetailModal';

interface LeaveCalendarProps {
  initialYear?: number;
  initialMonth?: number; // 0..11
  // Bumping this counter externally forces a re-fetch.
  reloadKey?: number;
  // When set, both the right-click context menu ("Antrag erstellen")
  // and the drag-to-range gesture across cells call this. For single-day
  // creates start === end; for ranges, start <= end.
  onAddRequest?: (start: IsoDate, end: IsoDate) => void;
}

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
  reloadKey = 0,
  onAddRequest,
}: LeaveCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(initialYear ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth ?? today.getMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<Array<LeaveRequest & { id: string }>>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
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
  const rangeStart = grid[0]!.iso;
  const rangeEnd = grid[grid.length - 1]!.iso;

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
    ]).then(([reqs, emps, types]) => {
      if (cancelled) return;
      setLeaves(reqs);
      setEmployees(emps);
      setLeaveTypes(types);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    });
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, reloadKey]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const typeByCode = useMemo(
    () => new Map<LeaveTypeCode, LeaveType>(leaveTypes.map((t) => [t.code, t])),
    [leaveTypes],
  );
  const todayIso: IsoDate = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const leavesOnOpenDay = useMemo(() => {
    if (!openDay) return [];
    return leaves.filter((l) => leaveCoversDay(l, openDay));
  }, [openDay, leaves]);

  function handlePrev() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function handleNext() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }
  function handleToday() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
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

  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Vorheriger Monat"
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
            aria-label="Nächster Monat"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="font-bold text-slate-700" style={{ fontSize: 13 }}>
          {MONTHS_DE[viewMonth]} {viewYear}
        </div>
        <div style={{ width: 76 }} />{/* spacer to balance the nav block */}
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

      {(!loading || hasLoadedOnce) && !error && (
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
                  className={`min-h-[64px] rounded-md border p-1 text-left flex flex-col gap-0.5 hover:border-red-300 transition-colors select-none ${
                    inDrag
                      ? 'bg-red-50 border-red-300'
                      : cell.current
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div
                    className={`flex justify-end ${
                      isToday
                        ? 'text-red-600 font-semibold'
                        : cell.current ? 'text-slate-700' : 'text-slate-400'
                    }`}
                    style={{ fontSize: 11 }}
                  >
                    {cell.day}
                  </div>
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
                        className={`truncate rounded px-1 ${colorClass}`}
                        style={{ fontSize: 10 }}
                        title={tooltip}
                      >
                        {halfMarker}{emp ? firstName(emp.name) : l.employeeId}
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <div className="text-slate-500 px-1" style={{ fontSize: 10 }}>
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
              employees={employeeById}
              leaveTypes={typeByCode}
              onClose={() => setOpenDay(null)}
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
