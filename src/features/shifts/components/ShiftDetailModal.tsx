import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarDays, Loader2, User, X } from 'lucide-react';
import type { Employee } from '../../vacation/types';
import type { Shift, ShiftSlotKind, ShiftSwap } from '../types';
import {
  acceptShiftSwap,
  cancelShiftSwap,
  declineShiftSwap,
} from '../api/shiftApi';
import { longSlotLabel } from '../lib/format';
import { formatGermanDate } from '../../vacation/lib/formatDate';
import ShiftSwapForm from './ShiftSwapForm';

interface ShiftDetailModalProps {
  shift: Shift;
  // All shifts (used by the swap form to pick a target shift).
  allShifts: Shift[];
  slotKinds: Map<number, ShiftSlotKind>;
  employees: Map<string, Employee>;
  // Pending swap involving this shift, if any.
  pendingSwap?: ShiftSwap | null;
  // The current logged-in employee. Drives action availability.
  currentEmployeeId?: string | null;
  onClose: () => void;
  onChange: () => void;
}

// Detail panel for a single shift. Surfaces:
//   * Who has it, when, what slot.
//   * "Tausch anbieten" if it's the current user's shift.
//   * Accept / decline if a pending swap targets the current user.
//   * Cancel if the current user requested a still-pending swap.
export default function ShiftDetailModal({
  shift,
  allShifts,
  slotKinds,
  employees,
  pendingSwap,
  currentEmployeeId,
  onClose,
  onChange,
}: ShiftDetailModalProps) {
  const [mode, setMode] = useState<'detail' | 'swap'>('detail');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const assignee = shift.employeeId ? employees.get(shift.employeeId) : null;
  const slotKind = slotKinds.get(shift.slotKindId);
  const isMine = !!currentEmployeeId && shift.employeeId === currentEmployeeId;

  const swapPartnerShift = useMemo(() => {
    if (!pendingSwap) return null;
    const partnerId = pendingSwap.requesterShiftId === shift.id
      ? pendingSwap.targetShiftId
      : pendingSwap.requesterShiftId;
    return allShifts.find((s) => s.id === partnerId) ?? null;
  }, [pendingSwap, allShifts, shift.id]);

  const isTargetOfPending = !!pendingSwap
    && pendingSwap.targetId === currentEmployeeId
    && pendingSwap.status === 'pending';
  const isRequesterOfPending = !!pendingSwap
    && pendingSwap.requesterId === currentEmployeeId
    && pendingSwap.status === 'pending';

  async function runAction(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'swap') {
    return (
      <ShiftSwapForm
        myShift={shift}
        allShifts={allShifts}
        slotKinds={slotKinds}
        employees={employees}
        currentEmployeeId={currentEmployeeId}
        onCancel={() => setMode('detail')}
        onSuccess={() => {
          onChange();
          onClose();
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="shift-detail-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} />
            <span className="font-bold" style={{ fontSize: 16 }}>
              {formatGermanDate(shift.date)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-slate-500 uppercase tracking-wider font-semibold" style={{ fontSize: 10 }}>
              Schicht
            </div>
            <div className="font-medium text-slate-700" style={{ fontSize: 14 }}>
              {longSlotLabel(slotKind, shift.slotKindCode)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-slate-500 uppercase tracking-wider font-semibold" style={{ fontSize: 10 }}>
              Zugewiesen an
            </div>
            <div className="flex items-center gap-2 text-slate-700" style={{ fontSize: 14 }}>
              <User size={14} className="text-slate-400" />
              <span className="font-medium">{assignee?.name ?? shift.employeeId ?? '—'}</span>
            </div>
          </div>

          {pendingSwap && swapPartnerShift && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-800 font-semibold" style={{ fontSize: 12 }}>
                <ArrowLeftRight size={12} /> Offene Tauschanfrage
              </div>
              <div className="text-amber-800" style={{ fontSize: 12 }}>
                {pendingSwap.requesterId === shift.employeeId ? 'Hingibt' : 'Übernimmt'}{' '}
                <strong>{employees.get(pendingSwap.requesterId)?.name ?? pendingSwap.requesterId}</strong>{' '}
                ↔ <strong>{employees.get(pendingSwap.targetId)?.name ?? pendingSwap.targetId}</strong>
              </div>
              <div className="text-amber-700" style={{ fontSize: 11 }}>
                Tauschpartner-Schicht: {formatGermanDate(swapPartnerShift.date)}
              </div>
              {pendingSwap.message && (
                <div className="text-amber-700 italic mt-1" style={{ fontSize: 11 }}>
                  „{pendingSwap.message}"
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700" style={{ fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex flex-wrap gap-2 justify-end">
          {isTargetOfPending && pendingSwap && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(() => declineShiftSwap(pendingSwap.id))}
                className="rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 px-3 py-1.5 disabled:opacity-50"
                style={{ fontSize: 12 }}
              >
                Ablehnen
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(() => acceptShiftSwap(pendingSwap.id))}
                className="rounded-lg bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
                style={{ fontSize: 12 }}
              >
                {busy && <Loader2 size={11} className="animate-spin" />}
                Tausch annehmen
              </button>
            </>
          )}

          {isRequesterOfPending && pendingSwap && (
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction(() => cancelShiftSwap(pendingSwap.id))}
              className="rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 px-3 py-1.5 disabled:opacity-50"
              style={{ fontSize: 12 }}
            >
              Anfrage zurückziehen
            </button>
          )}

          {!pendingSwap && isMine && (
            <button
              type="button"
              onClick={() => setMode('swap')}
              className="rounded-lg bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 flex items-center gap-1.5"
              style={{ fontSize: 12 }}
            >
              <ArrowLeftRight size={12} /> Tausch anbieten
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 px-3 py-1.5"
            style={{ fontSize: 12 }}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
