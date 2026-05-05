import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FileText, Loader2, Paperclip, X } from 'lucide-react';
import Select from '../../../components/Select';
import DatePicker from '../../../components/DatePicker';
import Checkbox from '../../../components/Checkbox';
import { validateLeaveRequest } from '../rules/validateLeaveRequest';
import {
  createLeaveRequest,
  listLeaveTypes,
  listSubstitutes,
  loadRuleContext,
  updateLeaveRequest,
  uploadLeaveAttachment,
  type LeaveType,
  type Substitute,
} from '../api/vacationApi';
import type { Employee, IsoDate, LeaveRequest, LeaveTypeCode, RuleContext, RuleResult } from '../types';

interface LeaveRequestFormProps {
  employees: Employee[];
  defaultEmployeeId?: string;
  // Pre-fill the date pickers — used by integration tests to avoid
  // navigating the calendar popover. Production callers pass neither.
  defaultStartDate?: IsoDate;
  defaultEndDate?: IsoDate;
  // When set, the form runs in edit mode: pre-fills with the
  // existing request's values and submits via updateLeaveRequest
  // instead of createLeaveRequest. The request must still be
  // editable (status='pending') — that's a UI-level guard the
  // caller is responsible for.
  existingRequest?: LeaveRequest & { id: string };
  // When true, the employee selector is hidden — non-approvers can
  // only request for themselves. Approvers keep the picker so they
  // can create on behalf of any employee.
  lockEmployee?: boolean;
  // SSO-matched current user's employees.id, recorded as actor on
  // the audit row. When omitted the audit defaults to the request's
  // own employeeId for create, and null for update.
  actorId?: string | null;
  // When true, the user can submit even if rule violations are
  // present (the violations stay visible as warnings) and gets a
  // "Direkt genehmigen" toggle that creates the row as approved
  // inline. Used for the approver-on-behalf flow including
  // historical entries that don't satisfy current guidelines.
  allowOverride?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LeaveRequestForm({
  employees,
  defaultEmployeeId,
  defaultStartDate,
  defaultEndDate,
  existingRequest,
  lockEmployee = false,
  actorId = null,
  allowOverride = false,
  onClose,
  onSuccess,
}: LeaveRequestFormProps) {
  const isEdit = !!existingRequest;
  const [employeeId, setEmployeeId] = useState<string>(
    existingRequest?.employeeId ?? defaultEmployeeId ?? employees[0]?.id ?? '',
  );
  const [leaveTypeCode, setLeaveTypeCode] = useState<LeaveTypeCode>(
    existingRequest?.leaveTypeCode ?? 'urlaub',
  );
  const [startDate, setStartDate] = useState<IsoDate>(
    existingRequest?.startDate ?? defaultStartDate ?? '',
  );
  const [endDate, setEndDate] = useState<IsoDate>(
    existingRequest?.endDate ?? defaultEndDate ?? '',
  );
  const [halfDayStart, setHalfDayStart] = useState(existingRequest?.halfDayStart ?? false);
  const [halfDayEnd, setHalfDayEnd] = useState(existingRequest?.halfDayEnd ?? false);
  const [reason, setReason] = useState(existingRequest?.reason ?? '');
  const [substituteId, setSubstituteId] = useState<string>(existingRequest?.substituteId ?? '');

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [substitutes, setSubstitutes] = useState<Substitute[]>([]);
  const [ruleCtx, setRuleCtx] = useState<RuleContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Approver-only "Direkt genehmigen" toggle. When true and the
  // submit goes through, the row is inserted as status='approved'
  // with decided_by=actor (no email, no second decision step).
  // Only meaningful in create mode (existingRequest unset) since
  // approving an edit is a separate decideLeaveRequest action.
  const [directlyApprove, setDirectlyApprove] = useState(allowOverride && !isEdit);
  // Krankmeldung file upload — only surfaced when the leave type is
  // krankenstand. Optional (some sick leaves are < 3 days and don't
  // legally require a doctor's note). Stored locally as the selected
  // File; the actual upload happens after createLeaveRequest /
  // updateLeaveRequest succeeds (we need the row id for the storage
  // path).
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load static reference data + rule context once whenever the
  // selected employee changes. The employee id flows into
  // loadRuleContext so the halfYearPlanning rule has the right
  // entitlement to compare against.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [types, ctx] = await Promise.all([
          listLeaveTypes(),
          loadRuleContext({ forEmployeeId: employeeId || undefined }),
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
  }, [employeeId]);

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
        // Pass the existing id when editing so the rules engine
        // doesn't treat the request as conflicting with itself.
        id: existingRequest?.id,
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
  }, [ruleCtx, employeeId, leaveTypeCode, startDate, endDate, halfDayStart, halfDayEnd, reason, substituteId, existingRequest?.id]);

  const violationsPresent = !!validation && validation.violations.length > 0;
  const canSubmit =
    !submitting
    && !!ruleCtx
    && !!employeeId
    && !!startDate
    && !!endDate
    && (allowOverride || (validation?.ok ?? false));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        employeeId,
        leaveTypeCode,
        startDate,
        endDate,
        halfDayStart,
        halfDayEnd,
        reason: reason || undefined,
        substituteId: substituteId || undefined,
      };
      let leaveId: string;
      if (existingRequest) {
        await updateLeaveRequest(existingRequest.id, payload, { actorId });
        leaveId = existingRequest.id;
      } else {
        const createOpts: Parameters<typeof createLeaveRequest>[1] = { actorId };
        if (allowOverride && directlyApprove && actorId) {
          createOpts.directlyApprove = {
            decidedBy: actorId,
            note: violationsPresent ? 'Direkt erfasst (Regelausnahme)' : 'Direkt erfasst',
            overrodeViolations: violationsPresent,
          };
        }
        const created = await createLeaveRequest(payload, createOpts);
        leaveId = created.id;
      }

      // Upload Krankmeldung after the row exists so we have the id
      // for the storage path. Failure here surfaces as a submit error
      // but the leave row itself is already saved — caller can retry
      // from the edit screen if needed.
      if (attachment && leaveTypeCode === 'krankenstand') {
        await uploadLeaveAttachment(leaveId, attachment);
      }

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
          <span className="font-bold" style={{ fontSize: 16 }}>
            {isEdit ? 'Antrag bearbeiten' : 'Neuer Urlaubsantrag'}
          </span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
          <div className="p-5 space-y-4">
            {/* Employee selector — hidden when locked (non-approvers can only request for themselves) */}
            {!lockEmployee && (
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
            )}

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
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  ariaLabel="Startdatum"
                />
                <Checkbox
                  checked={halfDayStart}
                  onChange={setHalfDayStart}
                  className="mt-1.5 text-slate-500"
                >
                  <span style={{ fontSize: 11 }}>halber Tag (vormittags frei)</span>
                </Checkbox>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bis</label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  ariaLabel="Enddatum"
                  min={startDate || undefined}
                />
                <Checkbox
                  checked={halfDayEnd}
                  onChange={setHalfDayEnd}
                  className="mt-1.5 text-slate-500"
                >
                  <span style={{ fontSize: 11 }}>halber Tag (nachmittags frei)</span>
                </Checkbox>
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

            {/* Krankmeldung — only for Krankenstand */}
            {leaveTypeCode === 'krankenstand' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Krankmeldung (optional)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  data-testid="krankmeldung-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setAttachment(f);
                  }}
                />
                {attachment ? (
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                    <FileText size={14} className="text-slate-500 flex-shrink-0" />
                    <span className="text-slate-700 truncate flex-1" style={{ fontSize: 12 }}>
                      {attachment.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Anhang entfernen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2 text-slate-500 hover:border-red-400 hover:text-red-600 transition-colors"
                    style={{ fontSize: 12 }}
                  >
                    <Paperclip size={14} />
                    PDF / Foto auswählen
                  </button>
                )}
                <p className="text-slate-400 mt-1" style={{ fontSize: 11 }}>
                  Ab dem 3. Krankenstandstag verlangt.
                </p>
              </div>
            )}

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
                    {allowOverride
                      ? 'Regelverletzung — als Approver kannst du speichern'
                      : 'Antrag wird so nicht akzeptiert'}
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

            {/* Approver-only direct-approval toggle. Hidden in edit
                mode (existing requests use decideLeaveRequest). */}
            {allowOverride && !isEdit && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <Checkbox
                  checked={directlyApprove}
                  onChange={setDirectlyApprove}
                >
                  <div>
                    <div className="font-medium text-slate-700" style={{ fontSize: 13 }}>
                      Direkt genehmigen
                    </div>
                    <div className="text-slate-500" style={{ fontSize: 11 }}>
                      Eintrag wird sofort als „Genehmigt" gespeichert (kein Workflow, keine E-Mail).
                      Nützlich für rückwirkende Erfassung aus dem Papierkalender.
                    </div>
                  </div>
                </Checkbox>
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
              {submitting
                ? 'Wird gespeichert…'
                : isEdit
                  ? 'Änderungen speichern'
                  : allowOverride && directlyApprove
                    ? (violationsPresent ? 'Trotzdem speichern (genehmigt)' : 'Speichern (genehmigt)')
                    : (allowOverride && violationsPresent ? 'Trotzdem einreichen' : 'Antrag einreichen')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
