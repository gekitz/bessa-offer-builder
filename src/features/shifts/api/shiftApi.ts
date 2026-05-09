import { supabase } from '../../../lib/supabase';
import type { IsoDate } from '../../vacation/types';
import type {
  BankHoliday,
  RosterEntry,
  Shift,
  ShiftSlotKind,
  ShiftSwap,
  ShiftStatus,
  SlotKindCode,
  SwapStatus,
} from '../types';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// ---------------------------------------------------------
// Slot kinds (small, cached after first fetch by callers)
// ---------------------------------------------------------

function rowToSlotKind(row: any): ShiftSlotKind {
  return {
    id: row.id,
    code: row.code as SlotKindCode,
    label: row.label,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
  };
}

export async function listSlotKinds(): Promise<ShiftSlotKind[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('shift_slot_kinds')
    .select('id, code, label, start_time, end_time')
    .order('id');
  if (error) throw error;
  return (data ?? []).map(rowToSlotKind);
}

// ---------------------------------------------------------
// Bank holidays
// ---------------------------------------------------------

export async function listBankHolidays(year?: number): Promise<BankHoliday[]> {
  const sb = requireSupabase();
  let q = sb.from('bank_holidays_at').select('holiday_date, name').order('holiday_date');
  if (year !== undefined) {
    q = q.gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    date: row.holiday_date,
    name: row.name,
  }));
}

// ---------------------------------------------------------
// Roster
// ---------------------------------------------------------

function rowToRoster(row: any): RosterEntry {
  return {
    employeeId: row.employee_id,
    position: row.position,
    active: row.active,
  };
}

export async function listRoster(): Promise<RosterEntry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('shift_roster')
    .select('employee_id, position, active')
    .order('position');
  if (error) throw error;
  return (data ?? []).map(rowToRoster);
}

export async function upsertRosterEntry(
  employeeId: string,
  position: number,
  active = true,
): Promise<RosterEntry> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('shift_roster')
    .upsert(
      { employee_id: employeeId, position, active },
      { onConflict: 'employee_id' },
    )
    .select('employee_id, position, active')
    .single();
  if (error) throw error;
  return rowToRoster(data);
}

export async function removeRosterEntry(employeeId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('shift_roster').delete().eq('employee_id', employeeId);
  if (error) throw error;
}

// ---------------------------------------------------------
// Shifts
// ---------------------------------------------------------

const SHIFT_COLUMNS =
  'id, shift_date, slot_kind_id, employee_id, status, notes, shift_slot_kinds!inner(code)';

function rowToShift(row: any): Shift {
  return {
    id: row.id,
    date: row.shift_date,
    slotKindId: row.slot_kind_id,
    slotKindCode: (row.shift_slot_kinds?.code ?? row.slot_kind_code) as SlotKindCode,
    employeeId: row.employee_id ?? null,
    status: row.status as ShiftStatus,
    notes: row.notes ?? null,
  };
}

export interface ListShiftsFilter {
  rangeStart?: IsoDate;
  rangeEnd?: IsoDate;
  employeeId?: string;
  status?: ShiftStatus | ShiftStatus[];
}

export async function listShifts(filter: ListShiftsFilter = {}): Promise<Shift[]> {
  const sb = requireSupabase();
  let q = sb.from('shifts').select(SHIFT_COLUMNS).order('shift_date').order('slot_kind_id');
  if (filter.rangeStart) q = q.gte('shift_date', filter.rangeStart);
  if (filter.rangeEnd) q = q.lte('shift_date', filter.rangeEnd);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.status) {
    if (Array.isArray(filter.status)) q = q.in('status', filter.status);
    else q = q.eq('status', filter.status);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToShift);
}

// Used by the leave-request validation rule + the day detail panel.
export async function listShiftsForEmployee(
  employeeId: string,
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
): Promise<Shift[]> {
  return listShifts({
    employeeId,
    rangeStart,
    rangeEnd,
    status: ['assigned', 'swap_pending'],
  });
}

// Manual seed assignment from the admin UI.
export async function assignShift(shiftId: string, employeeId: string): Promise<Shift> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('shifts')
    .update({ employee_id: employeeId, status: 'assigned' })
    .eq('id', shiftId)
    .select(SHIFT_COLUMNS)
    .single();
  if (error) throw error;
  return rowToShift(data);
}

export async function unassignShift(shiftId: string): Promise<Shift> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('shifts')
    .update({ employee_id: null, status: 'unassigned' })
    .eq('id', shiftId)
    .select(SHIFT_COLUMNS)
    .single();
  if (error) throw error;
  return rowToShift(data);
}

// ---------------------------------------------------------
// RPCs (year scaffolding + filling)
// ---------------------------------------------------------

export async function scaffoldShiftYear(year: number): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('scaffold_shift_year', { p_year: year });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fillRemainingShifts(year: number): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('fill_remaining_shifts', { p_year: year });
  if (error) throw error;
  return Number(data ?? 0);
}

// ---------------------------------------------------------
// Swaps
// ---------------------------------------------------------

const SWAP_COLUMNS =
  'id, requester_shift_id, target_shift_id, requester_id, target_id, message, status, created_at, decided_at';

function rowToSwap(row: any): ShiftSwap {
  return {
    id: row.id,
    requesterShiftId: row.requester_shift_id,
    targetShiftId: row.target_shift_id,
    requesterId: row.requester_id,
    targetId: row.target_id,
    message: row.message ?? null,
    status: row.status as SwapStatus,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
  };
}

export interface ListSwapsFilter {
  status?: SwapStatus | SwapStatus[];
  // Only swaps where this employee is requester OR target.
  involvingEmployeeId?: string;
}

export async function listSwaps(filter: ListSwapsFilter = {}): Promise<ShiftSwap[]> {
  const sb = requireSupabase();
  let q = sb.from('shift_swaps').select(SWAP_COLUMNS).order('created_at', { ascending: false });
  if (filter.status) {
    if (Array.isArray(filter.status)) q = q.in('status', filter.status);
    else q = q.eq('status', filter.status);
  }
  if (filter.involvingEmployeeId) {
    q = q.or(`requester_id.eq.${filter.involvingEmployeeId},target_id.eq.${filter.involvingEmployeeId}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToSwap);
}

// Fire-and-forget notification dispatch. Mirrors the
// notify-leave-decision pattern: never await; the user-facing RPC
// already succeeded by the time we get here, so an email outage
// shouldn't fail/rollback their action. Errors only land in
// console.warn so they're visible in dev tools without bothering
// the user.
function notifySwap(swapId: string, event: 'created' | 'accepted' | 'declined' | 'cancelled'): void {
  if (!supabase) return;
  void supabase.functions.invoke('notify-shift-swap', { body: { swapId, event } })
    .catch((err) => {
      console.warn('notify-shift-swap invoke failed:', err);
    });
}

export async function createShiftSwap(
  requesterShiftId: string,
  targetShiftId: string,
  message?: string,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('create_shift_swap', {
    p_requester_shift: requesterShiftId,
    p_target_shift: targetShiftId,
    p_message: message ?? null,
  });
  if (error) throw error;
  const swapId = String(data);
  notifySwap(swapId, 'created');
  return swapId;
}

export async function acceptShiftSwap(swapId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('accept_shift_swap', { p_swap_id: swapId });
  if (error) throw error;
  notifySwap(swapId, 'accepted');
}

export async function declineShiftSwap(swapId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('decline_shift_swap', { p_swap_id: swapId });
  if (error) throw error;
  notifySwap(swapId, 'declined');
}

export async function cancelShiftSwap(swapId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('cancel_shift_swap', { p_swap_id: swapId });
  if (error) throw error;
  notifySwap(swapId, 'cancelled');
}
