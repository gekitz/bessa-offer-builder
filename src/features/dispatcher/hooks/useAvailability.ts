// useAvailability — fetches the data needed to compute free slots
// for the dispatcher's next-N-days lookahead and runs the availability
// engine.
//
// The hook does NOT auto-fetch on mount: the dispatcher only wants to
// hit the DB when they explicitly press "Slots finden" with a chosen
// duration. Call `refetch()` to trigger a load. This avoids surprising
// loads while the dispatcher is still typing in the search panel.

import { useCallback, useState } from 'react';
import {
  listAppointments,
  listBankHolidays,
  listEmployees,
  listLeaveRequests,
  listShifts,
  listSlotKinds,
} from '../../calendar/api/calendarApi';
import type { Appointment } from '../../tickets/types';
import { findFreeSlots, isoDate, type FreeSlot } from '../lib/availability';

export interface UseAvailabilityOptions {
  slotMinutes: number;
  daysAhead: number;
  employeeIds?: string[];
  maxPerEmployeePerDay?: number;
}

export interface UseAvailabilityResult {
  slots: FreeSlot[];
  // Raw appointments returned by the latest refetch — exposed so the
  // dispatcher can run hasConflict() synchronously when a slot pill
  // is clicked (a slot returned by findFreeSlots is conflict-free at
  // fetch time, but the appointments list captures races since then).
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  hasRun: boolean;
  refetch: (opts: UseAvailabilityOptions) => Promise<void>;
  reset: () => void;
}

export function useAvailability(): UseAvailabilityResult {
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const refetch = useCallback(async (opts: UseAvailabilityOptions) => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const from = isoDate(now);
      const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + opts.daysAhead - 1);
      const to = isoDate(toDate);
      const startsAtFrom = `${from}T00:00:00`;
      const endsAtTo = `${to}T23:59:59`;

      const [fetchedAppointments, leaves, shifts, slotKinds, holidaysAll, employees] = await Promise.all([
        listAppointments({ from: startsAtFrom, to: endsAtTo }),
        listLeaveRequests({ rangeStart: from, rangeEnd: to, status: ['pending', 'approved'] }),
        listShifts({ rangeStart: from, rangeEnd: to, status: ['assigned', 'swap_pending'] }),
        listSlotKinds(),
        listBankHolidays(now.getFullYear()),
        listEmployees({ activeOnly: true }),
      ]);

      const holidays = holidaysAll.filter((h) => h.date >= from && h.date <= to);

      const result = findFreeSlots({
        employees,
        appointments: fetchedAppointments,
        leaves,
        shifts,
        slotKinds,
        holidays,
        now,
        daysAhead: opts.daysAhead,
        slotMinutes: opts.slotMinutes,
        employeeIds: opts.employeeIds,
        maxPerEmployeePerDay: opts.maxPerEmployeePerDay,
      });
      setSlots(result);
      setAppointments(fetchedAppointments);
      setHasRun(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSlots([]);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSlots([]);
    setAppointments([]);
    setHasRun(false);
    setError(null);
  }, []);

  return { slots, appointments, loading, error, hasRun, refetch, reset };
}
