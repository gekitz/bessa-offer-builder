// useCalendarEvents — fetches all 4 calendar layers in parallel for
// a given month and returns a unified, sorted CalendarEvent[].
//
// The hook owns its own data fetching for use cases that need the
// merged stream (TeamView, future widgets, iCal feed). LeaveCalendar
// continues to manage its own grid + leave/shift fetching; this hook
// is the supplement that adds appointments and gives consumers a
// single source of truth.

import { useEffect, useMemo, useState } from 'react';
import {
  listAppointments,
  listBankHolidays,
  listEmployees,
  listLeaveRequests,
  listShifts,
  listSlotKinds,
} from '../api/calendarApi';
import { normaliseAll } from '../lib/normalizeEvents';
import type { CalendarEvent, MonthRange } from '../types';
import type { IsoDate } from '../../vacation/types';

// Build the month-range covering [first day of month, last day of
// month]. Used as the query window for all four sources.
export function monthRange(year: number, month: number): MonthRange {
  const last = new Date(year, month + 1, 0).getDate();
  const from: IsoDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to:   IsoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { year, month, from, to };
}

interface UseCalendarEventsResult {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCalendarEvents(year: number, month: number): UseCalendarEventsResult {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const range = useMemo(() => monthRange(year, month), [year, month]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const startsAtFrom = `${range.from}T00:00:00`;
    const endsAtTo     = `${range.to}T23:59:59`;

    Promise.all([
      listAppointments({ from: startsAtFrom, to: endsAtTo }),
      listLeaveRequests({
        rangeStart: range.from,
        rangeEnd: range.to,
        status: ['pending', 'approved'],
      }),
      listShifts({
        rangeStart: range.from,
        rangeEnd: range.to,
        status: ['assigned', 'swap_pending'],
      }),
      listSlotKinds(),
      listBankHolidays(year),
      listEmployees({ activeOnly: false }),
    ])
      .then(([appts, leaves, shifts, slotKinds, holidaysAll, employees]) => {
        if (cancelled) return;

        // Filter holidays to the month range (listBankHolidays returns
        // the whole year).
        const holidays = holidaysAll.filter((h) => h.date >= range.from && h.date <= range.to);

        const employeeNameById = new Map(employees.map((e) => [e.id, e.name] as const));
        const slotLabelById = new Map(slotKinds.map((k) => [k.id, k.label] as const));

        setEvents(
          normaliseAll({
            appointments: appts,
            leaves,
            shifts,
            holidays,
            employeeNameById,
            slotLabelById,
          }),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, year, reloadKey]);

  return {
    events,
    loading,
    error,
    refetch: () => setReloadKey((k) => k + 1),
  };
}
