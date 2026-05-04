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
import DecisionDialog from './DecisionDialog';
import Select from '../../../components/Select';
import { formatRange } from '../lib/formatDate';
import type { Employee, LeaveRequest, LeaveStatus, LeaveTypeCode } from '../types';

interface LeaveRequestsListProps {
  statusFilter?: LeaveStatus | LeaveStatus[];
  employeeId?: string;
  // Bumping this counter externally forces a re-fetch.
  reloadKey?: number;
  // Render heading + refresh control. Defaults to true; pass false
  // when embedding inside a parent that already provides a header.
  showHeader?: boolean;
  emptyLabel?: string;
  // When true, render the cancel button on pending/approved rows.
  // Each click confirms() before calling the API.
  actionable?: boolean;
  // When true, render the Genehmigen / Ablehnen buttons on pending
  // rows. Independent of `actionable` because cancellation is a
  // self-service action while decisions are approver-only.
  canDecide?: boolean;
  // Currently logged-in user's employees.id, recorded as decided_by
  // when an approve/reject succeeds. Falls back to NULL on the
  // server when omitted.
  decidedBy?: string;
  // When set, pending rows render a "Bearbeiten" button. The
  // callback receives the full request object so the parent can
  // open an edit form pre-filled with it.
  onEdit?: (request: LeaveRequest & { id: string }) => void;
  // When true, render the Alle/Offen/Genehmigt/Abgelehnt/Storniert
  // tab row. Internal state takes over from the statusFilter prop —
  // statusFilter is treated as the seed value only.
  showStatusTabs?: boolean;
  // When set, render a "Nur meine / Alle Mitarbeiter" toggle that
  // filters the list to leaves belonging to this employee. Useful
  // for the page-level Urlaub view where the same component serves
  // both employees (their own leaves) and approvers (everyone's).
  myEmployeeId?: string;
  // Initial state of the toggle; only matters when myEmployeeId is
  // set. Default is false (= "Alle Mitarbeiter").
  defaultMyOnly?: boolean;
}

type StatusTab = 'all' | LeaveStatus;

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: 'all',       label: 'Alle' },
  { key: 'pending',   label: 'Offen' },
  { key: 'approved',  label: 'Genehmigt' },
  { key: 'rejected',  label: 'Abgelehnt' },
  { key: 'cancelled', label: 'Storniert' },
];

export default function LeaveRequestsList({
  statusFilter = ['pending', 'approved'],
  employeeId,
  reloadKey = 0,
  showHeader = true,
  emptyLabel = 'Keine Anträge.',
  actionable = false,
  canDecide = false,
  decidedBy,
  showStatusTabs = false,
  myEmployeeId,
  defaultMyOnly = false,
  onEdit,
}: LeaveRequestsListProps) {
  const [requests, setRequests] = useState<Array<LeaveRequest & { id: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalReload, setInternalReload] = useState(0);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // When set, the DecisionDialog renders for that request + decision.
  const [decisionTarget, setDecisionTarget] = useState<
    { id: string; decision: 'approved' | 'rejected'; summary: string } | null
  >(null);
  // Tab selection — defaults to "Offen" since approvers care about
  // pending requests first. Used only when showStatusTabs is on.
  const [selectedStatus, setSelectedStatus] = useState<StatusTab>('pending');
  // Own-leaves toggle. Rendered + active only when myEmployeeId is set.
  const [myOnly, setMyOnly] = useState(defaultMyOnly);
  // Leave-type filter. 'all' means no filter. The dropdown is only
  // useful when the full set is loaded — i.e. when showStatusTabs
  // is on; otherwise it's still rendered but has fewer rows to
  // narrow down.
  const [typeFilter, setTypeFilter] = useState<LeaveTypeCode | 'all'>('all');

  // When tabs are on, fetch the full set unfiltered and filter
  // client-side so the tab labels can show accurate counts.
  // When tabs are off, the API filter still does the work.
  const apiStatusFilter = showStatusTabs ? undefined : statusFilter;
  const statusKey = Array.isArray(apiStatusFilter) ? apiStatusFilter.join(',') : (apiStatusFilter ?? '');
  // Effective employee filter: the explicit prop takes precedence,
  // otherwise the toggle decides between myEmployeeId and "all".
  const effectiveEmployeeId = employeeId ?? (myEmployeeId && myOnly ? myEmployeeId : undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listLeaveRequests({ status: apiStatusFilter, employeeId: effectiveEmployeeId }),
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
  }, [statusKey, effectiveEmployeeId, reloadKey, internalReload]);

  // Apply the type filter once — counts AND the visible slice both
  // respect it so the tab numbers reflect the user's current scope.
  const typeFiltered = useMemo(
    () => (typeFilter === 'all' ? requests : requests.filter((r) => r.leaveTypeCode === typeFilter)),
    [requests, typeFilter],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = {
      all: typeFiltered.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const req of typeFiltered) {
      const s = (req.status ?? 'pending') as LeaveStatus;
      counts[s] += 1;
    }
    return counts;
  }, [typeFiltered]);

  const visibleRequests = useMemo(() => {
    if (!showStatusTabs) return typeFiltered;
    if (selectedStatus === 'all') return typeFiltered;
    return typeFiltered.filter((r) => (r.status ?? 'pending') === selectedStatus);
  }, [typeFiltered, showStatusTabs, selectedStatus]);

  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const typeByCode = useMemo(
    () => new Map<LeaveTypeCode, LeaveType>(leaveTypes.map((t) => [t.code, t])),
    [leaveTypes],
  );

  function openDecisionDialog(req: LeaveRequest & { id: string }, decision: 'approved' | 'rejected') {
    const emp = employeeById.get(req.employeeId);
    const type = typeByCode.get(req.leaveTypeCode);
    const summary = `${emp?.name ?? req.employeeId} · ${type?.label ?? req.leaveTypeCode} · ${formatRange(req.startDate, req.endDate, req.halfDayStart, req.halfDayEnd)}`;
    setDecisionTarget({ id: req.id, decision, summary });
  }

  async function submitDecision(note: string | undefined) {
    if (!decisionTarget) return;
    const { id, decision } = decisionTarget;
    setActionInFlight(id);
    setActionError(null);
    try {
      await decideLeaveRequest(id, decision, decidedBy ?? null, note);
      setDecisionTarget(null);
      setInternalReload((k) => k + 1);
    } catch (e) {
      // The DecisionDialog surfaces the error; re-throw so it can
      // render the message in-place.
      throw e;
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
              Anträge {!loading && !error ? `(${visibleRequests.length})` : ''}
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

      {(myEmployeeId || leaveTypes.length > 0) && (
        <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-2 items-center">
          {myEmployeeId && (
            <>
              <span className="text-slate-500" style={{ fontSize: 11 }}>Anzeigen:</span>
              <button
                type="button"
                onClick={() => setMyOnly(false)}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  !myOnly ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                style={{ fontSize: 11 }}
              >
                Alle Mitarbeiter
              </button>
              <button
                type="button"
                onClick={() => setMyOnly(true)}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  myOnly ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                style={{ fontSize: 11 }}
              >
                Nur meine
              </button>
            </>
          )}

          {leaveTypes.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-slate-500" style={{ fontSize: 11 }}>Art:</span>
              <Select
                value={typeFilter}
                onChange={(v) => setTypeFilter(v as LeaveTypeCode | 'all')}
                size="sm"
                className="w-44"
                ariaLabel="Art filtern"
                options={[
                  { value: 'all', label: 'Alle Arten' },
                  ...leaveTypes.map((t) => ({ value: t.code, label: t.label })),
                ]}
              />
            </div>
          )}
        </div>
      )}

      {showStatusTabs && (
        <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const active = tab.key === selectedStatus;
            const count = statusCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedStatus(tab.key)}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  active
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                style={{ fontSize: 11 }}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {actionError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 flex items-start gap-2" style={{ fontSize: 12 }}>
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span>Aktion fehlgeschlagen: {actionError}</span>
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

      {!loading && !error && visibleRequests.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <CalendarIcon size={28} className="mx-auto mb-2 opacity-50" />
          <p style={{ fontSize: 12 }}>{emptyLabel}</p>
        </div>
      )}

      {!loading && !error && visibleRequests.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {visibleRequests.map((req) => {
            const emp = employeeById.get(req.employeeId);
            const type = typeByCode.get(req.leaveTypeCode);
            const sub = req.substituteId ? employeeById.get(req.substituteId) : undefined;
            const status = req.status ?? 'pending';
            const isBusy = actionInFlight === req.id;
            const showDecide = canDecide && status === 'pending';
            const showCancel = actionable && (status === 'pending' || status === 'approved');
            const showEdit = !!onEdit && status === 'pending';
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
                  <span className="text-slate-500">{formatRange(req.startDate, req.endDate, req.halfDayStart, req.halfDayEnd)}</span>
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

                {req.decisionNote && (
                  <div className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-slate-600" style={{ fontSize: 11 }}>
                    <span className="font-semibold text-slate-700">Entscheidung:</span>{' '}
                    <span className="italic">„{req.decisionNote}"</span>
                  </div>
                )}

                {(showDecide || showCancel || showEdit) && (
                  <div className="mt-2 flex gap-1.5">
                    {showEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit!(req)}
                        disabled={isBusy}
                        className="flex items-center gap-1 rounded-lg bg-slate-100 text-slate-700 px-2.5 py-1 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                        style={{ fontSize: 11 }}
                      >
                        Bearbeiten
                      </button>
                    )}
                    {showDecide && (
                      <>
                        <button
                          type="button"
                          onClick={() => openDecisionDialog(req, 'approved')}
                          disabled={isBusy}
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                          style={{ fontSize: 11 }}
                        >
                          {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Genehmigen
                        </button>
                        <button
                          type="button"
                          onClick={() => openDecisionDialog(req, 'rejected')}
                          disabled={isBusy}
                          className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 px-2.5 py-1 hover:bg-red-100 disabled:opacity-50 transition-colors"
                          style={{ fontSize: 11 }}
                        >
                          <X size={11} /> Ablehnen
                        </button>
                      </>
                    )}
                    {showCancel && (
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

      {decisionTarget && (
        <DecisionDialog
          decision={decisionTarget.decision}
          summary={decisionTarget.summary}
          onConfirm={submitDecision}
          onClose={() => setDecisionTarget(null)}
        />
      )}
    </div>
  );
}
