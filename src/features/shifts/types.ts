// Shift / weekend-duty domain types.
//
// Mirrors supabase/migrations/20260508120000_create_shifts.sql in the
// app's preferred camelCase + ISO date string convention. Mapping
// to/from supabase rows happens in the API layer.

import type { IsoDate } from '../vacation/types';

export type SlotKindCode = 'fri_pm' | 'sat' | 'sun' | 'holiday';

export type ShiftStatus =
  | 'unassigned'
  | 'assigned'
  | 'swap_pending'
  | 'completed'
  | 'cancelled';

export type SwapStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface ShiftSlotKind {
  id: number;
  code: SlotKindCode;
  label: string;
  startTime: string; // 'HH:mm'
  endTime: string;   // 'HH:mm'
}

export interface BankHoliday {
  date: IsoDate;
  name: string;
}

export interface RosterEntry {
  employeeId: string;
  position: number;
  active: boolean;
}

export interface Shift {
  id: string;
  date: IsoDate;
  slotKindId: number;
  slotKindCode: SlotKindCode;
  employeeId: string | null;
  status: ShiftStatus;
  notes: string | null;
}

export interface ShiftSwap {
  id: string;
  requesterShiftId: string;
  targetShiftId: string;
  requesterId: string;
  targetId: string;
  message: string | null;
  status: SwapStatus;
  createdAt: string;
  decidedAt: string | null;
}
