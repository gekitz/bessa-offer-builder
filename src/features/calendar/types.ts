// Unified calendar event model — normalizes appointments, leaves,
// shifts, and bank holidays into a single shape consumed by
// useCalendarEvents and the TeamView/UnifiedCalendar components.

import type { IsoDate } from '../vacation/types';
// NB: ../vacation/types is correct from src/features/calendar/types.ts
// (one level up to features/, then into vacation/types).

export type CalendarEventType = 'appointment' | 'leave' | 'shift' | 'holiday';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  startsAt: string;       // ISO timestamp (UTC). Use the day in local time for all-day events.
  endsAt: string;         // ISO timestamp (exclusive for all-day).
  allDay: boolean;
  color: LayerColor;
  employeeIds: string[];  // empty for holidays
  metadata: Record<string, unknown>;
}

// Layer colour per the plan: appointments lila, leave rot, shifts
// orange, holidays grün. Kept as a closed string union so the
// consumer can switch on it deterministically.
export type LayerColor = 'lila' | 'rot' | 'orange' | 'gruen';

export const LAYER_COLOR_BY_TYPE: Record<CalendarEventType, LayerColor> = {
  appointment: 'lila',
  leave: 'rot',
  shift: 'orange',
  holiday: 'gruen',
};

export const LAYER_LABEL_BY_TYPE: Record<CalendarEventType, string> = {
  appointment: 'Termine',
  leave: 'Urlaub/Kranken',
  shift: 'Schichten',
  holiday: 'Feiertage',
};

// User-controlled layer visibility, persisted to localStorage.
export type LayerVisibility = Record<CalendarEventType, boolean>;

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  appointment: true,
  leave: true,
  shift: true,
  holiday: true,
};

// Range covering a single month. Both endpoints are inclusive ISO
// dates ('YYYY-MM-DD').
export interface MonthRange {
  year: number;
  month: number; // 0..11
  from: IsoDate;
  to: IsoDate;
}
