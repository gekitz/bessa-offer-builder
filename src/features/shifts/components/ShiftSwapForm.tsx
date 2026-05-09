import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, X } from 'lucide-react';
import type { Employee } from '../../vacation/types';
import type { Shift, ShiftSlotKind } from '../types';
import { createShiftSwap } from '../api/shiftApi';
import { longSlotLabel } from '../lib/format';
import { formatGermanDate } from '../../vacation/lib/formatDate';
import Select, { type SelectOption } from '../../../components/Select';

interface ShiftSwapFormProps {
  myShift: Shift;
  allShifts: Shift[];
  slotKinds: Map<number, ShiftSlotKind>;
  employees: Map<string, Employee>;
  currentEmployeeId?: string | null;
  onCancel: () => void;
  onSuccess: () => void;
}

// Two-step form: pick a colleague, then pick which of their assigned
// shifts to take in exchange. Submit creates the shift_swaps row.
export default function ShiftSwapForm({
  myShift,
  allShifts,
  slotKinds,
  employees,
  currentEmployeeId,
  onCancel,
  onSuccess,
}: ShiftSwapFormProps) {
  const [colleagueId, setColleagueId] = useState<string>('');
  const [targetShiftId, setTargetShiftId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // All assigned, future shifts — excluding my own and any locked by
  // a pending swap. The colleague picker comes from this set.
  const eligibleShifts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return allShifts.filter((s) =>
      s.id !== myShift.id
      && s.status === 'assigned'
      && s.employeeId
      && s.employeeId !== currentEmployeeId
      && s.date >= today,
    );
  }, [allShifts, myShift.id, currentEmployeeId]);

  const candidates = useMemo(() => {
    const ids = new Set<string>();
    for (const s of eligibleShifts) if (s.employeeId) ids.add(s.employeeId);
    return Array.from(ids)
      .map((id) => employees.get(id))
      .filter((e): e is Employee => !!e)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [eligibleShifts, employees]);

  const colleagueShifts = useMemo(() => {
    if (!colleagueId) return [];
    return eligibleShifts
      .filter((s) => s.employeeId === colleagueId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [colleagueId, eligibleShifts]);

  async function handleSubmit() {
    if (!targetShiftId) return;
    setSubmitting(true);
    setError(null);
    try {
      await createShiftSwap(myShift.id, targetShiftId, message.trim() || undefined);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const targetShift = colleagueShifts.find((s) => s.id === targetShiftId) ?? null;
  const myKind = slotKinds.get(myShift.slotKindId);
  const targetKind = targetShift ? slotKinds.get(targetShift.slotKindId) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
      data-testid="shift-swap-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={16} />
            <span className="font-bold" style={{ fontSize: 16 }}>Schichttausch anbieten</span>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1">
            <div className="text-slate-500 uppercase tracking-wider font-semibold" style={{ fontSize: 10 }}>
              Ich gebe ab
            </div>
            <div className="font-medium text-slate-700" style={{ fontSize: 13 }}>
              {formatGermanDate(myShift.date)} · {longSlotLabel(myKind, myShift.slotKindCode)}
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-slate-500 uppercase tracking-wider font-semibold" style={{ fontSize: 10 }}>
              Mit wem tauschen?
            </label>
            <Select
              value={colleagueId}
              onChange={(v) => {
                setColleagueId(v);
                setTargetShiftId('');
              }}
              placeholder="— Kollege wählen —"
              options={candidates.map<SelectOption>((c) => ({ value: c.id, label: c.name }))}
              ariaLabel="Kollege wählen"
            />
          </div>

          {colleagueId && (
            <div className="space-y-1">
              <label className="block text-slate-500 uppercase tracking-wider font-semibold" style={{ fontSize: 10 }}>
                Welche Schicht übernehme ich?
              </label>
              {colleagueShifts.length === 0 ? (
                <div className="text-slate-500 italic py-2" style={{ fontSize: 12 }}>
                  Diese Person hat keine zukünftigen Schichten.
                </div>
              ) : (
                <Select
                  value={targetShiftId}
                  onChange={(v) => setTargetShiftId(v)}
                  placeholder="— Schicht wählen —"
                  options={colleagueShifts.map<SelectOption>((s) => {
                    const k = slotKinds.get(s.slotKindId);
                    return {
                      value: s.id,
                      label: formatGermanDate(s.date),
                      hint: longSlotLabel(k, s.slotKindCode),
                    };
                  })}
                  ariaLabel="Schicht wählen"
                />
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-slate-500 uppercase tracking-wider font-semibold" style={{ fontSize: 10 }}>
              Nachricht (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-700 resize-none"
              style={{ fontSize: 13 }}
              placeholder="z. B. Hochzeit am Samstag, würde mir sehr helfen"
            />
          </div>

          {targetShift && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 space-y-1">
              <div className="text-blue-800 font-semibold" style={{ fontSize: 12 }}>
                Vorschau
              </div>
              <div className="text-blue-800" style={{ fontSize: 12 }}>
                Du übernimmst <strong>{formatGermanDate(targetShift.date)}</strong>
                {targetKind && <> · {longSlotLabel(targetKind, targetShift.slotKindCode)}</>}.
              </div>
              <div className="text-blue-800" style={{ fontSize: 12 }}>
                {employees.get(targetShift.employeeId ?? '')?.name ?? '—'} übernimmt{' '}
                <strong>{formatGermanDate(myShift.date)}</strong>
                {myKind && <> · {longSlotLabel(myKind, myShift.slotKindCode)}</>}.
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700" style={{ fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 px-3 py-1.5 disabled:opacity-50"
            style={{ fontSize: 12 }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!targetShiftId || submitting}
            onClick={handleSubmit}
            className="rounded-lg bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
            style={{ fontSize: 12 }}
            data-testid="swap-submit"
          >
            {submitting && <Loader2 size={11} className="animate-spin" />}
            Anfrage senden
          </button>
        </div>
      </div>
    </div>
  );
}
