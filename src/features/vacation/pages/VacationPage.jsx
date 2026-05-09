import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, CalendarPlus, ChevronDown, Info, Loader2, MapPin, Plus, Users } from 'lucide-react';
import { listEmployees, listStandorte } from '../api/vacationApi';
import LeaveRequestForm from '../components/LeaveRequestForm';
import LeaveRequestsList from '../components/LeaveRequestsList';
import LeaveCalendar from '../components/LeaveCalendar';
import CalendarSubscriptionModal from '../components/CalendarSubscriptionModal';
import BalancePanel from '../components/BalancePanel';
import EmployeeBalanceTable from '../components/EmployeeBalanceTable';
import ShiftAdminPanel from '../../shifts/components/ShiftAdminPanel';
import MyShiftsPanel from '../../shifts/components/MyShiftsPanel';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { TEAM } from '../../offers/data/catalogs';
import { isApprover } from '../lib/permissions';

// Urlaubsplaner landing page. Shows the team grouped by Standort and
// gives every row a "Antrag stellen" button that opens the request
// form pre-filled with that employee. Future iterations add: my
// requests list, calendar view, approver inbox, balance dashboard.
export default function VacationPage() {
  const { profile, user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [standorte, setStandorte] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [requestForEmployeeId, setRequestForEmployeeId] = useState(null);
  // When set, the request form opens in edit mode pre-filled with this
  // existing leave request. Mutually exclusive with the create flow.
  const [editingRequest, setEditingRequest] = useState(null);
  // Date range pre-filled for new-request creation from the calendar
  // (right-click context menu sends start === end; drag-to-range sends
  // start <= end). Mutually exclusive with the other create flows.
  const [requestForRange, setRequestForRange] = useState(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  // Approvers can expand any roster row to inspect that employee's
  // per-type breakdown (used / planned / remaining for Urlaub +
  // Krankenstand etc.). Tracks the expanded employee.id, or null
  // when nothing is open.
  const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);

  // Match the logged-in SSO user to one of our employees. The TEAM
  // array's `id` field happens to equal employees.code (both 'gkitz',
  // 'hbauer', etc.), so we go SSO email -> TEAM id -> employees row
  // by code. Once employees.email is populated by HR we can match
  // employees directly.
  const currentEmail = profile?.microsoft_email || user?.email || '';
  const currentEmployee = useMemo(() => {
    const teamId = findIdBySsoEmail(currentEmail, TEAM);
    if (!teamId) return null;
    return employees.find((e) => e.code === teamId) ?? null;
  }, [currentEmail, employees]);
  const userIsApprover = isApprover(currentEmployee);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const [es, ss] = await Promise.all([listEmployees(), listStandorte()]);
        if (cancelled) return;
        setEmployees(es);
        setStandorte(ss);
      } catch (e) {
        if (!cancelled) setError(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  function handleRequestSuccess() {
    setRequestForEmployeeId(null);
    setEditingRequest(null);
    setRequestForRange(null);
    setReloadKey((k) => k + 1);
  }

  function handleCloseForm() {
    setRequestForEmployeeId(null);
    setEditingRequest(null);
    setRequestForRange(null);
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-red-600" />
            <h1 className="font-bold text-slate-700" style={{ fontSize: 18 }}>Urlaubsplaner</h1>
          </div>
          {!loading && !error && employees.length > 0 && (
            <div className="flex items-center gap-2">
              {currentEmployee && (
                <button
                  onClick={() => setShowSubscribeModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-700 px-3 py-1.5 hover:bg-slate-200 transition-colors"
                  style={{ fontSize: 12 }}
                >
                  <CalendarPlus size={13} /> Kalender abonnieren
                </button>
              )}
              <button
                onClick={() => setRequestForEmployeeId(currentEmployee?.id ?? employees[0].id)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 transition-colors"
                style={{ fontSize: 12 }}
              >
                <Plus size={13} /> Neuer Antrag
              </button>
            </div>
          )}
        </div>

        {/* State: loading */}
        {loading && (
          <div className="text-center py-12 text-slate-400">
            <Loader2 size={28} className="mx-auto mb-3 animate-spin" />
            <p style={{ fontSize: 13 }}>Mitarbeiter werden geladen…</p>
          </div>
        )}

        {/* State: error (probably migration not yet applied) */}
        {!loading && error && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-900 mb-1" style={{ fontSize: 14 }}>
                  Mitarbeiterdaten konnten nicht geladen werden
                </div>
                <p className="text-amber-800 mb-2" style={{ fontSize: 12 }}>
                  Wahrscheinlich wurde die Migration noch nicht angewendet.
                  Pfad:{' '}
                  <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                    supabase/migrations/20260504120000_create_workforce.sql
                  </code>
                </p>
                <p className="text-amber-700 font-mono" style={{ fontSize: 11 }}>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Balance — only when we matched an SSO user to an employee
            (otherwise we don't know whose balance to show). Approvers
            inspect other employees via the per-row Info button on the
            team roster below. */}
        {!loading && !error && currentEmployee && (
          <div className="mb-4">
            <BalancePanel employeeId={currentEmployee.id} reloadKey={reloadKey} />
          </div>
        )}

        {/* My shifts — strip showing the next ~6 upcoming weekend/holiday
            duties. Self-hides if the employee isn't in the rotation. */}
        {!loading && !error && currentEmployee && (
          <div className="mb-4">
            <MyShiftsPanel
              employees={employees}
              currentEmployeeId={currentEmployee.id}
              reloadKey={reloadKey}
            />
          </div>
        )}

        {/* Calendar — visible once employees load. */}
        {!loading && !error && employees.length > 0 && (
          <div className="mb-4">
            <LeaveCalendar
              reloadKey={reloadKey}
              currentEmployeeId={currentEmployee?.id ?? null}
              onAddRequest={(start, end) => setRequestForRange({ start, end })}
            />
          </div>
        )}

        {/* Leave requests — visible once employees load (so the list has names to render). */}
        {!loading && !error && employees.length > 0 && (
          <div className="mb-4">
            <LeaveRequestsList
              reloadKey={reloadKey}
              actionable
              showStatusTabs
              canDecide={userIsApprover}
              decidedBy={currentEmployee?.id}
              myEmployeeId={currentEmployee?.id}
              defaultMyOnly={!!currentEmployee && !userIsApprover}
              hideOthersDecidedRequests={!userIsApprover}
              onEdit={(req) => setEditingRequest(req)}
            />
          </div>
        )}

        {/* Team roster — approvers only. Lets Georg/Herbert create a
            request on behalf of any employee (the per-row "Antrag"
            button). Regular employees use the header "Neuer Antrag"
            button which pre-fills with themselves. */}
        {!loading && !error && employees.length > 0 && userIsApprover && (
          <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <Users size={14} className="text-slate-500" />
              <span className="font-bold text-slate-600" style={{ fontSize: 12 }}>
                Mitarbeiter ({employees.length})
              </span>
            </div>
            {standorte.map((s) => {
              const ours = employees.filter((e) => e.standortId === s.id);
              if (ours.length === 0) return null;
              return (
                <div key={s.id} className="border-b border-slate-100 last:border-b-0">
                  <div className="px-4 py-2 bg-slate-50/50 flex items-center gap-1.5 text-slate-500" style={{ fontSize: 11 }}>
                    <MapPin size={11} />
                    <span className="font-semibold uppercase tracking-wider">{s.name}</span>
                    <span className="text-slate-400">({ours.length})</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {ours.map((e) => {
                      const expanded = expandedEmployeeId === e.id;
                      return (
                        <div key={e.id}>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-700 truncate" style={{ fontSize: 13 }}>{e.name}</div>
                              <div className="text-slate-400" style={{ fontSize: 11 }}>
                                {e.code} · {e.weeklyHours}h/Woche
                                {e.employmentType !== 'fulltime' && <span className="ml-1.5 bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{e.employmentType}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => setExpandedEmployeeId(expanded ? null : e.id)}
                                aria-label={`Stand für ${e.name}`}
                                aria-expanded={expanded}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors ${
                                  expanded
                                    ? 'bg-slate-200 text-slate-700'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                                style={{ fontSize: 11 }}
                              >
                                {expanded ? <ChevronDown size={11} /> : <Info size={11} />}
                                Stand
                              </button>
                              <button
                                onClick={() => setRequestForEmployeeId(e.id)}
                                className="flex items-center gap-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors px-2.5 py-1"
                                style={{ fontSize: 11 }}
                              >
                                <Plus size={11} /> Antrag
                              </button>
                            </div>
                          </div>
                          {expanded && (
                            <div
                              className="px-4 pb-3 pt-0 bg-slate-50/40 border-t border-slate-100"
                              data-testid={`employee-stand-${e.code}`}
                            >
                              <EmployeeBalanceTable employeeId={e.id} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Shift admin — approvers only. Wedge between roster and the
            empty-state, so it only renders once employees load. */}
        {!loading && !error && employees.length > 0 && userIsApprover && (
          <div className="mt-4">
            <ShiftAdminPanel employees={employees} />
          </div>
        )}

        {/* State: success but no employees (migration applied but seed didn't run?) */}
        {!loading && !error && employees.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Users size={32} className="mx-auto mb-2 opacity-50" />
            <p style={{ fontSize: 13 }}>Noch keine Mitarbeiter im System.</p>
          </div>
        )}
      </div>

      {(requestForEmployeeId || editingRequest || requestForRange) && (
        <LeaveRequestForm
          employees={employees}
          defaultEmployeeId={
            requestForEmployeeId
            ?? editingRequest?.employeeId
            ?? currentEmployee?.id
            ?? undefined
          }
          defaultStartDate={requestForRange?.start ?? undefined}
          defaultEndDate={requestForRange?.end ?? undefined}
          existingRequest={editingRequest ?? undefined}
          lockEmployee={!userIsApprover}
          actorId={currentEmployee?.id ?? null}
          allowOverride={userIsApprover}
          onClose={handleCloseForm}
          onSuccess={handleRequestSuccess}
        />
      )}

      {showSubscribeModal && currentEmployee && (
        <CalendarSubscriptionModal
          employeeId={currentEmployee.id}
          employeeName={currentEmployee.name}
          onClose={() => setShowSubscribeModal(false)}
        />
      )}
    </div>
  );
}
