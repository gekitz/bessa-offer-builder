import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  listEmployees,
  listLeaveRequests,
  listLeaveTypes,
  type LeaveType,
} from '../api/vacationApi';
import type { Employee, IsoDate, LeaveRequest, LeaveTypeCode } from '../types';

interface LeaveCalendarProps {
  initialYear?: number;
  initialMonth?: number; // 0..11
  // Bumping this counter externally forces a re-fetch.
  reloadKey?: number;
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
}: LeaveCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(initialYear ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth ?? today.getMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<Array<LeaveRequest & { id: string }>>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, reloadKey]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const todayIso: IsoDate = toIso(today.getFullYear(), today.getMonth(), today.getDate());

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

      {loading && (
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

      {!loading && !error && (
        <div className="p-3" data-testid="calendar-grid">
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
              return (
                <div
                  key={cell.iso}
                  data-testid={`cal-cell-${cell.iso}`}
                  className={`min-h-[64px] rounded-md border p-1 text-left flex flex-col gap-0.5 ${
                    cell.current
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
                    return (
                      <div
                        key={l.id}
                        className={`truncate rounded px-1 ${colorClass}`}
                        style={{ fontSize: 10 }}
                        title={`${emp?.name ?? l.employeeId} · ${l.leaveTypeCode}`}
                      >
                        {emp ? firstName(emp.name) : l.employeeId}
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <div className="text-slate-500 px-1" style={{ fontSize: 10 }}>
                      +{overflow} weitere
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
