import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  listAppointments,
  listBankHolidays,
  listEmployees,
  listLeaveRequests,
  listShifts,
  listSlotKinds,
} from '../api/calendarApi';
import { normaliseAll } from '../lib/normalizeEvents';
import type { CalendarEvent, CalendarEventType, LayerVisibility } from '../types';
import type { Employee, IsoDate, LeaveRequest } from '../../vacation/types';
import DayDetailModal from '../../vacation/components/DayDetailModal';
import type { LeaveType } from '../../vacation/api/vacationApi';
import { listLeaveTypes } from '../api/calendarApi';

interface TeamViewProps {
  visibility: LayerVisibility;
}

// ─────────────────────────────────────────────────────────────────────
// Date helpers — week starts Monday (ISO).
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
  // JS: 0=Sun..6=Sat. ISO: Mon=1, Sun=7. Walk back to Mon.
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

const WEEKDAY_LABEL_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const LAYER_DOT_CLASS: Record<CalendarEventType, string> = {
  appointment: 'bg-violet-500',
  leave: 'bg-red-500',
  shift: 'bg-orange-500',
  holiday: 'bg-emerald-500',
};

// ─────────────────────────────────────────────────────────────────────

interface CellEvents {
  appointment: number;
  leave: number;
  shift: number;
  holiday: number;
  total: number;
}

function emptyCell(): CellEvents {
  return { appointment: 0, leave: 0, shift: 0, holiday: 0, total: 0 };
}

export default function TeamView({ visibility }: TeamViewProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfIsoWeek(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [leaves, setLeaves] = useState<Array<LeaveRequest & { id: string }>>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<IsoDate | null>(null);
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);

  const days: IsoDate[] = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toIso(addDays(weekStart, i))),
    [weekStart],
  );
  const rangeFrom = days[0]!;
  const rangeTo = days[6]!;
  const todayIso = isoToday();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startsAtFrom = `${rangeFrom}T00:00:00`;
      const endsAtTo = `${rangeTo}T23:59:59`;
      const year = new Date(rangeFrom).getFullYear();
      const [appts, lrs, shiftRows, slotKinds, holidaysAll, emps, types] = await Promise.all([
        listAppointments({ from: startsAtFrom, to: endsAtTo }),
        listLeaveRequests({
          rangeStart: rangeFrom,
          rangeEnd: rangeTo,
          status: ['pending', 'approved'],
        }),
        listShifts({
          rangeStart: rangeFrom,
          rangeEnd: rangeTo,
          status: ['assigned', 'swap_pending'],
        }),
        listSlotKinds(),
        listBankHolidays(year),
        listEmployees({ activeOnly: true }),
        listLeaveTypes(),
      ]);
      const holidays = holidaysAll.filter((h) => h.date >= rangeFrom && h.date <= rangeTo);
      const employeeNameById = new Map(emps.map((e) => [e.id, e.name] as const));
      const slotLabelById = new Map(slotKinds.map((k) => [k.id, k.label] as const));

      setEmployees(emps);
      setLeaves(lrs);
      setLeaveTypes(types);
      setEvents(
        normaliseAll({
          appointments: appts,
          leaves: lrs,
          shifts: shiftRows,
          holidays,
          employeeNameById,
          slotLabelById,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    load();
  }, [load]);

  // Cell index: (employeeId, day) → counts per layer. Holidays always
  // count on every employee row because they apply to everyone.
  const cellIndex = useMemo(() => {
    const map = new Map<string, CellEvents>();
    function bump(empId: string, day: IsoDate, type: CalendarEventType) {
      const k = `${empId}|${day}`;
      const cur = map.get(k) ?? emptyCell();
      cur[type] += 1;
      cur.total += 1;
      map.set(k, cur);
    }
    for (const e of events) {
      if (!visibility[e.type]) continue;
      // Day of the event (use startsAt's local date).
      const eventDay = toIso(new Date(e.startsAt));
      if (e.type === 'holiday') {
        for (const emp of employees) bump(emp.id, eventDay, 'holiday');
        continue;
      }
      // Leaves span multiple days — bump every day in the window.
      if (e.type === 'leave') {
        const endDay = toIso(new Date(e.endsAt));
        for (const empId of e.employeeIds) {
          for (const day of days) {
            if (day >= eventDay && day <= endDay) bump(empId, day, 'leave');
          }
        }
        continue;
      }
      // Appointments / shifts: single-day, fan out across assignees.
      for (const empId of e.employeeIds) {
        if (days.includes(eventDay)) bump(empId, eventDay, e.type);
      }
    }
    return map;
  }, [events, employees, days, visibility]);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const typeByCode = useMemo(
    () => new Map(leaveTypes.map((t) => [t.code, t] as const)),
    [leaveTypes],
  );

  const leavesOnOpenDay = useMemo(() => {
    if (!openDay) return [];
    return leaves.filter((l) => {
      if (l.startDate > openDay || l.endDate < openDay) return false;
      if (openEmployeeId && l.employeeId !== openEmployeeId) return false;
      return true;
    });
  }, [openDay, openEmployeeId, leaves]);

  const appointmentsOnOpenDay = useMemo(() => {
    if (!openDay) return [];
    return events.filter((e) => {
      if (e.type !== 'appointment') return false;
      const eventDay = toIso(new Date(e.startsAt));
      if (eventDay !== openDay) return false;
      if (openEmployeeId && !e.employeeIds.includes(openEmployeeId)) return false;
      return true;
    });
  }, [openDay, openEmployeeId, events]);

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
  })} – ${addDays(weekStart, 6).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;

  return (
    <div data-testid="team-view">
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

      {/* Grid — horizontally scrolls on mobile, employee column is sticky. */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-600"
                style={{ minWidth: 140 }}
              >
                Mitarbeiter
              </th>
              {days.map((day, i) => {
                const d = new Date(day);
                const isToday = day === todayIso;
                return (
                  <th
                    key={day}
                    scope="col"
                    className={`border-b border-slate-200 px-2 py-2 text-center text-xs font-semibold ${
                      isToday ? 'bg-red-50 text-red-700' : 'text-slate-600'
                    }`}
                    style={{ minWidth: 56 }}
                  >
                    <div>{WEEKDAY_LABEL_DE[i]}</div>
                    <div className="font-mono font-normal text-slate-400">
                      {pad2(d.getDate())}.{pad2(d.getMonth() + 1)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center">
                  <Loader2 size={20} className="inline-block animate-spin text-slate-400" />
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                  Keine aktiven Mitarbeiter.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white border-r border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-700"
                    style={{ minWidth: 140 }}
                  >
                    <span className="truncate block" title={emp.name}>{emp.name}</span>
                  </th>
                  {days.map((day) => {
                    const cell = cellIndex.get(`${emp.id}|${day}`) ?? emptyCell();
                    const isToday = day === todayIso;
                    return (
                      <td
                        key={day}
                        className={`border-b border-slate-100 px-1 py-1 text-center align-middle ${
                          isToday ? 'bg-red-50/30' : ''
                        }`}
                        style={{ minWidth: 56, height: 38 }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenDay(day);
                            setOpenEmployeeId(emp.id);
                          }}
                          aria-label={`${emp.name} ${day}: ${cell.total} Einträge`}
                          className={`w-full h-full inline-flex items-center justify-center gap-0.5 rounded transition-colors ${
                            cell.total > 0 ? 'hover:bg-slate-100' : 'opacity-40 hover:opacity-100 hover:bg-slate-50'
                          }`}
                          data-testid={`team-cell-${emp.id}-${day}`}
                        >
                          {cell.total === 0 ? (
                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                          ) : (
                            (['appointment', 'leave', 'shift', 'holiday'] as CalendarEventType[]).map((type) =>
                              cell[type] > 0 ? (
                                <span
                                  key={type}
                                  className={`inline-block w-2 h-2 rounded-full ${LAYER_DOT_CLASS[type]}`}
                                  data-testid={`dot-${type}`}
                                />
                              ) : null,
                            )
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openDay && (
        <DayDetailModal
          day={openDay}
          leaves={leavesOnOpenDay}
          appointments={appointmentsOnOpenDay}
          employees={employeesById}
          leaveTypes={typeByCode}
          onClose={() => {
            setOpenDay(null);
            setOpenEmployeeId(null);
          }}
        />
      )}
    </div>
  );
}
