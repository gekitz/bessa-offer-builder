import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar as CalendarIcon, Check, FileText, Loader2, RefreshCw, User, X } from 'lucide-react';
import {
  cancelLeaveRequest,
  decideLeaveRequest,
  listEmployees,
  listLeaveRequests,
  listLeaveTypes,
  type LeaveType,
} from '../api/vacationApi';
import LeaveStatusBadge from './LeaveStatusBadge';
import type { Employee, IsoDate, LeaveRequest, LeaveStatus, LeaveTypeCode } from '../types';

interface LeaveRequestsListProps {
  statusFilter?: LeaveStatus | LeaveStatus[];
  employeeId?: string;
  // Bumping this counter externally forces a re-fetch.
  reloadKey?: number;
  // Render heading + refresh control. Defaults to true; pass false
  // when embedding inside a parent that already provides a header.
  showHeader?: boolean;
  emptyLabel?: string;
  // When true, render approve/reject (for pending) and cancel
  // (for pending+approved) buttons per row. Each click confirms()
  // before calling the API.
  actionable?: boolean;
  // Currently logged-in user's employees.id, recorded as decided_by
  // when an approve/reject succeeds. Falls back to NULL on the
  // server when omitted.
  decidedBy?: string;
}

function formatGermanDate(iso: IsoDate): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function formatRange(start: IsoDate, end: IsoDate): string {
  return start === end ? formatGermanDate(start) : `${formatGermanDate(start)} – ${formatGermanDate(end)}`;
}

export default function LeaveRequestsList({
  statusFilter = ['pending', 'approved'],
  employeeId,
  reloadKey = 0,
  showHeader = true,
  emptyLabel = 'Keine Anträge.',
  actionable = false,
  decidedBy,
}: LeaveRequestsListProps) {
  const [requests, setRequests] = useState<Array<LeaveRequest & { id: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalReload, setInternalReload] = useState(0);
  // Per-row pending state so the right buttons spin while their
  // action is in flight.
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Stabilise the status array so it doesn't trigger an effect re-run on every parent render.
  const statusKey = Array.isArray(statusFilter) ? statusFilter.join(',') : statusFilter;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listLeaveRequests({ status: statusFilter, employeeId }),
      listEmployees({ activeOnly: false }),
      listLeaveTypes(),
    ]).then(([reqs, emps, types]) => {
      if (cancelled) return;
      setRequests(reqs);
      setEmployees(emps);
      setLeaveTypes(types);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, employeeId, reloadKey, internalReload]);

  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const typeByCode = useMemo(
    () => new Map<LeaveTypeCode, LeaveType>(leaveTypes.map((t) => [t.code, t])),
    [leaveTypes],
  );

  async function handleDecide(id: string, decision: 'approved' | 'rejected') {
    const verb = decision === 'approved' ? 'genehmigen' : 'ablehnen';
    if (!window.confirm(`Antrag ${verb}?`)) return;
    setActionInFlight(id);
    setActionError(null);
    try {
      await decideLeaveRequest(id, decision, decidedBy ?? null);
      setInternalReload((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Antrag stornieren?')) return;
    setActionInFlight(id);
    setActionError(null);
    try {
      await cancelLeaveRequest(id);
      setInternalReload((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionInFlight(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
      {showHeader && (
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-slate-500" />
            <span className="font-bold text-slate-600" style={{ fontSize: 12 }}>
              Anträge {!loading && !error ? `(${requests.length})` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setInternalReload((k) => k + 1)}
            className="rounded-lg bg-white border border-slate-200 text-slate-500 p-1.5 hover:text-slate-700 hover:border-slate-300 transition-colors"
            title="Aktualisieren"
            aria-label="Aktualisieren"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-slate-400">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
          <p style={{ fontSize: 12 }}>Anträge werden geladen…</p>
        </div>
      )}

      {!loading && error && (
        <div className="p-5 bg-red-50 border-t-2 border-red-200">
          <div className="flex items-start gap-2 text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold" style={{ fontSize: 13 }}>
                Anträge konnten nicht geladen werden
              </div>
              <div className="font-mono mt-0.5" style={{ fontSize: 11 }}>{error}</div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <CalendarIcon size={28} className="mx-auto mb-2 opacity-50" />
          <p style={{ fontSize: 12 }}>{emptyLabel}</p>
        </div>
      )}

      {actionError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 flex items-start gap-2" style={{ fontSize: 12 }}>
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span>Aktion fehlgeschlagen: {actionError}</span>
        </div>
      )}

      {!loading && !error && requests.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {requests.map((req) => {
            const emp = employeeById.get(req.employeeId);
            const type = typeByCode.get(req.leaveTypeCode);
            const sub = req.substituteId ? employeeById.get(req.substituteId) : undefined;
            const status = req.status ?? 'pending';
            const isBusy = actionInFlight === req.id;
            const canDecide = actionable && status === 'pending';
            const canCancel = actionable && (status === 'pending' || status === 'approved');
            return (
              <li key={req.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <User size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-700 truncate" style={{ fontSize: 13 }}>
                      {emp?.name ?? req.employeeId}
                    </span>
                  </div>
                  <LeaveStatusBadge status={status} />
                </div>
                <div className="flex items-center gap-2 text-slate-600" style={{ fontSize: 12 }}>
                  <span className="font-medium text-slate-700">{type?.label ?? req.leaveTypeCode}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">{formatRange(req.startDate, req.endDate)}</span>
                </div>
                {(req.reason || sub) && (
                  <div className="mt-1.5 space-y-0.5 text-slate-500" style={{ fontSize: 11 }}>
                    {req.reason && <div className="italic">„{req.reason}"</div>}
                    {sub && (
                      <div>
                        Vertretung: <span className="font-medium text-slate-600">{sub.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {(canDecide || canCancel) && (
                  <div className="mt-2 flex gap-1.5">
                    {canDecide && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDecide(req.id, 'approved')}
                          disabled={isBusy}
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                          style={{ fontSize: 11 }}
                        >
                          {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Genehmigen
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecide(req.id, 'rejected')}
                          disabled={isBusy}
                          className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 px-2.5 py-1 hover:bg-red-100 disabled:opacity-50 transition-colors"
                          style={{ fontSize: 11 }}
                        >
                          <X size={11} /> Ablehnen
                        </button>
                      </>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => handleCancel(req.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1 rounded-lg bg-slate-50 text-slate-500 px-2.5 py-1 hover:bg-slate-100 disabled:opacity-50 transition-colors ml-auto"
                        style={{ fontSize: 11 }}
                      >
                        Stornieren
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
