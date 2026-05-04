import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import Select from '../../../components/Select';
import { validateLeaveRequest } from '../rules/validateLeaveRequest';
import {
  createLeaveRequest,
  listLeaveTypes,
  listSubstitutes,
  loadRuleContext,
  type LeaveType,
  type Substitute,
} from '../api/vacationApi';
import type { Employee, IsoDate, LeaveTypeCode, RuleContext, RuleResult } from '../types';

interface LeaveRequestFormProps {
  employees: Employee[];
  defaultEmployeeId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LeaveRequestForm({
  employees,
  defaultEmployeeId,
  onClose,
  onSuccess,
}: LeaveRequestFormProps) {
  const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId ?? employees[0]?.id ?? '');
  const [leaveTypeCode, setLeaveTypeCode] = useState<LeaveTypeCode>('urlaub');
  const [startDate, setStartDate] = useState<IsoDate>('');
  const [endDate, setEndDate] = useState<IsoDate>('');
  const [halfDayStart, setHalfDayStart] = useState(false);
  const [halfDayEnd, setHalfDayEnd] = useState(false);
  const [reason, setReason] = useState('');
  const [substituteId, setSubstituteId] = useState<string>('');

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [substitutes, setSubstitutes] = useState<Substitute[]>([]);
  const [ruleCtx, setRuleCtx] = useState<RuleContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load static reference data + rule context once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [types, ctx] = await Promise.all([
          listLeaveTypes(),
          loadRuleContext(),
        ]);
        if (cancelled) return;
        setLeaveTypes(types);
        setRuleCtx(ctx);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingCtx(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reload substitutes whenever the selected employee changes.
  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    (async () => {
      try {
        const subs = await listSubstitutes(employeeId);
        if (!cancelled) setSubstitutes(subs);
      } catch {
        if (!cancelled) setSubstitutes([]);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  // Live validation. Runs only once both dates are filled in.
  const validation: RuleResult | null = useMemo(() => {
    if (!ruleCtx) return null;
    if (!employeeId || !startDate || !endDate) return null;
    if (startDate > endDate) {
      return {
        ok: false,
        violations: [{ rule: 'dateRange', message: 'Enddatum darf nicht vor dem Startdatum liegen.' }],
        warnings: [],
      };
    }
    return validateLeaveRequest(
      {
        employeeId,
        leaveTypeCode,
        startDate,
        endDate,
        halfDayStart,
        halfDayEnd,
        reason: reason || undefined,
        substituteId: substituteId || undefined,
      },
      ruleCtx,
    );
  }, [ruleCtx, employeeId, leaveTypeCode, startDate, endDate, halfDayStart, halfDayEnd, reason, substituteId]);

  const canSubmit =
    !submitting
    && !!ruleCtx
    && !!employeeId
    && !!startDate
    && !!endDate
    && (validation?.ok ?? false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createLeaveRequest({
        employeeId,
        leaveTypeCode,
        startDate,
        endDate,
        halfDayStart,
        halfDayEnd,
        reason: reason || undefined,
        substituteId: substituteId || undefined,
      });
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const substituteOptions = substitutes
    .map((s) => {
      const sub = employees.find((e) => e.id === s.substituteEmployeeId);
      return sub ? { id: sub.id, name: sub.name, priority: s.priority } : null;
    })
    .filter((x): x is { id: string; name: string; priority: number } => x !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <span className="font-bold" style={{ fontSize: 16 }}>Neuer Urlaubsantrag</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
          <div className="p-5 space-y-4">
            {/* Employee selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mitarbeiter</label>
              <Select
                value={employeeId}
                onChange={setEmployeeId}
                options={employees.map((e) => ({ value: e.id, label: e.name, hint: e.code }))}
                placeholder="Mitarbeiter wählen…"
                ariaLabel="Mitarbeiter"
              />
            </div>

            {/* Leave type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Art</label>
              <Select
                value={leaveTypeCode}
                onChange={(v) => setLeaveTypeCode(v as LeaveTypeCode)}
                options={leaveTypes.map((t) => ({ value: t.code, label: t.label }))}
                ariaLabel="Art der Abwesenheit"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Von</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  required
                />
                <label className="flex items-center gap-1.5 mt-1 text-slate-500" style={{ fontSize: 11 }}>
                  <input type="checkbox" checked={halfDayStart} onChange={(e) => setHalfDayStart(e.target.checked)} />
                  halber Tag (vormittags frei)
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bis</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  required
                />
                <label className="flex items-center gap-1.5 mt-1 text-slate-500" style={{ fontSize: 11 }}>
                  <input type="checkbox" checked={halfDayEnd} onChange={(e) => setHalfDayEnd(e.target.checked)} />
                  halber Tag (nachmittags frei)
                </label>
              </div>
            </div>

            {/* Substitute */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vertretung (optional)</label>
              <Select
                value={substituteId}
                onChange={setSubstituteId}
                options={[
                  { value: '', label: 'Keine Auswahl' },
                  ...substituteOptions.map((s) => ({
                    value: s.id,
                    label: s.name,
                    hint: `Priorität ${s.priority}`,
                  })),
                ]}
                ariaLabel="Vertretung"
              />
              {substitutes.length === 0 && employeeId && (
                <p className="text-slate-400 mt-1" style={{ fontSize: 11 }}>
                  Keine vordefinierten Vertretungen für diesen Mitarbeiter.
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Anmerkung (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="z.B. Familienurlaub"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>

            {/* Loading state */}
            {loadingCtx && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Regelwerk wird geladen…
              </div>
            )}

            {/* Load error */}
            {loadError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Regelwerk konnte nicht geladen werden</div>
                    <div className="font-mono mt-0.5" style={{ fontSize: 11 }}>{loadError}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Validation result */}
            {validation && validation.violations.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-red-700 mb-1">
                  <AlertCircle size={14} />
                  <span className="font-semibold" style={{ fontSize: 12 }}>
                    Antrag wird so nicht akzeptiert
                  </span>
                </div>
                <ul className="text-red-700 list-disc pl-5 space-y-1" style={{ fontSize: 12 }}>
                  {validation.violations.map((v, i) => <li key={i}>{v.message}</li>)}
                </ul>
              </div>
            )}

            {validation && validation.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-amber-700 mb-1">
                  <AlertTriangle size={14} />
                  <span className="font-semibold" style={{ fontSize: 12 }}>Hinweise</span>
                </div>
                <ul className="text-amber-700 list-disc pl-5 space-y-1" style={{ fontSize: 12 }}>
                  {validation.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                </ul>
              </div>
            )}

            {validation && validation.ok && validation.warnings.length === 0 && startDate && endDate && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-700 text-sm flex items-center gap-2">
                <CheckCircle2 size={14} />
                Alle Regeln erfüllt.
              </div>
            )}

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">
                Fehler beim Speichern: {submitError}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="border-t border-slate-200 p-4 flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3 hover:bg-slate-200 active:scale-[0.98] transition-all"
              style={{ fontSize: 14 }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold py-3 active:scale-[0.98] transition-all shadow-lg ${
                canSubmit
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
              style={{ fontSize: 14 }}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? 'Wird gespeichert…' : 'Antrag einreichen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
