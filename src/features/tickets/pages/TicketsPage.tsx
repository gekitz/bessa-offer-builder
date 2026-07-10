import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, LayoutGrid, List, Loader2, Plus, Search, Wrench } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { TEAM } from '../../offers/data/catalogs';
import { listAbteilungen, listEmployees, type Abteilung } from '../../vacation/api/vacationApi';
import { listTickets, listTicketCounts, setTicketStatus, updateTicket } from '../api/ticketApi';
import TicketBoard from '../components/TicketBoard';
import TicketDetail from '../components/TicketDetail';
import TicketForm from '../components/TicketForm';
import TicketMatrix from '../components/TicketMatrix';
import Select from '../../../components/Select';
import { isClosing, poolKeyToId, type TicketMove } from '../lib/boardDnd';
import type { CountRow } from '../lib/ticketMatrix';
import type { Employee } from '../../vacation/types';
import type { Ticket, TicketStatus } from '../types';

const STATUS_TABS: Array<{ id: TicketStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: 'open', label: 'Offen' },
  { id: 'in_progress', label: 'In Arbeit' },
  { id: 'waiting', label: 'Wartend' },
  { id: 'review', label: 'In Prüfung' },
  { id: 'closed', label: 'Geschlossen' },
];

const STATUS_BADGE: Record<TicketStatus, { label: string; cls: string }> = {
  open:        { label: 'Offen',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'In Arbeit',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  waiting:     { label: 'Wartend',      cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  review:      { label: 'In Prüfung',   cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  closed:      { label: 'Geschlossen',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled:   { label: 'Abgesagt',     cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const PRIORITY_BADGE: Record<Ticket['priority'], string> = {
  low:    'text-slate-500',
  normal: 'text-slate-600',
  high:   'text-amber-600 font-semibold',
  urgent: 'text-red-600 font-semibold',
};

const LS_VIEW_KEY = 'kitz.tickets.view';

function loadView(): 'list' | 'board' {
  if (typeof window === 'undefined') return 'list';
  return window.localStorage.getItem(LS_VIEW_KEY) === 'board' ? 'board' : 'list';
}
function saveView(v: 'list' | 'board') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LS_VIEW_KEY, v);
}

// Parses /tickets or /tickets/<id> from a HashRouter pathname.
function parseDetailId(pathname: string): string | null {
  const m = pathname.toLowerCase().match(/^\/tickets\/([^/]+)$/);
  return m ? m[1] : null;
}

export default function TicketsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth() as {
    profile: { microsoft_email?: string } | null;
    user: { email?: string } | null;
  };

  const detailId = useMemo(() => parseDetailId(location.pathname), [location.pathname]);

  // Resolve the logged-in employee for create defaults.
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const email = auth.profile?.microsoft_email || auth.user?.email || '';
    if (!email) return;
    (async () => {
      try {
        const teamId = findIdBySsoEmail(email, TEAM);
        if (!teamId) return;
        const emps = await listEmployees({ activeOnly: true });
        if (cancelled) return;
        const me = emps.find((e) => e.code === teamId);
        if (me) setCurrentEmployeeId(me.id);
      } catch {
        /* badge / defaults stay null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.profile?.microsoft_email, auth.user?.email]);

  // List state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<TicketStatus | 'all'>('open');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'board'>(loadView);
  // Pool (Abteilung) filter. 'all' = every pool, 'none' = unrouted tickets.
  const [pools, setPools] = useState<Abteilung[]>([]);
  const [poolFilter, setPoolFilter] = useState<number | 'all' | 'none'>('all');
  // Assignee filter. 'all' | 'mine' | 'unassigned' | <employeeId>.
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  // Pool × status overview matrix.
  const [counts, setCounts] = useState<CountRow[]>([]);
  // Hidden by default; only shown if the user explicitly opened it before.
  const [matrixOpen, setMatrixOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.localStorage.getItem('kitz.tickets.matrix') === 'open',
  );
  const [showCreate, setShowCreate] = useState(false);
  // Drag-to-close confirmation (board DnD). Holds the pending move until
  // the user confirms, since closing timestamps + notifies the customer.
  const [pendingClose, setPendingClose] = useState<{ ticket: Ticket; move: TicketMove } | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  // Pre-fill the create form from navigation state, e.g. when the
  // CRM CustomerDetail "Ticket erstellen" button sent us here.
  const [createInitialCustomer, setCreateInitialCustomer] = useState<
    React.ComponentProps<typeof TicketForm>['initialCustomer']
  >(undefined);

  useEffect(() => saveView(view), [view]);

  useEffect(() => {
    listAbteilungen().then(setPools).catch(() => {
      /* pool pills just stay minimal (Alle / Ohne Zuordnung) */
    });
    listEmployees({ activeOnly: true }).then(setEmployees).catch(() => {
      /* assignee dropdown just stays at Alle / Meine / Nicht zugewiesen */
    });
  }, []);

  // Per-pool counts from the currently loaded set (status-filtered in
  // list view, all statuses in board view) — before search/pool filters
  // so the pills stay stable while typing.
  const poolCounts = useMemo(() => {
    const m = new Map<number | 'none', number>();
    for (const t of tickets) {
      const key = t.poolAbteilungId ?? 'none';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [tickets]);

  // Pick up { initialCustomer } from react-router state on mount and
  // immediately open the create modal. Clear the state so a refresh
  // doesn't re-fire it.
  useEffect(() => {
    const state = location.state as { initialCustomer?: unknown } | null;
    if (state?.initialCustomer) {
      setCreateInitialCustomer(state.initialCustomer as typeof createInitialCustomer);
      setShowCreate(true);
      navigate('/tickets', { replace: true, state: null });
    }
    // Intentional: this effect should only fire once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Board view shows all statuses so it can group them into columns.
      const filters = view === 'board' || statusTab === 'all' ? {} : { status: [statusTab] };
      const data = await listTickets(filters);
      setTickets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusTab, view]);

  const loadCounts = useCallback(async () => {
    try {
      setCounts(await listTicketCounts());
    } catch {
      /* matrix just hides itself when counts can't load */
    }
  }, []);

  useEffect(() => {
    if (!detailId) {
      reload();
      loadCounts();
    }
  }, [reload, loadCounts, detailId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kitz.tickets.matrix', matrixOpen ? 'open' : 'closed');
    }
  }, [matrixOpen]);

  // Apply a board drag: optimistically patch the ticket, then persist
  // (pool via updateTicket, status via setTicketStatus). On failure,
  // resync from the server so the UI never lies about what was saved.
  const applyMove = useCallback(
    async (ticket: Ticket, move: TicketMove, note?: string) => {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id
            ? {
                ...t,
                ...(move.status ? { status: move.status } : {}),
                ...(move.pool !== undefined ? { poolAbteilungId: poolKeyToId(move.pool) } : {}),
              }
            : t,
        ),
      );
      try {
        if (move.pool !== undefined) {
          await updateTicket(
            ticket.id,
            { poolAbteilungId: poolKeyToId(move.pool) },
            { actorId: currentEmployeeId ?? undefined },
          );
        }
        if (move.status) {
          await setTicketStatus(ticket.id, move.status, {
            actorId: currentEmployeeId ?? undefined,
            closedBy: move.status === 'closed' ? currentEmployeeId ?? undefined : undefined,
            resolutionNote: note,
          });
        }
        loadCounts(); // keep the overview matrix in sync with the move
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        reload();
      }
    },
    [currentEmployeeId, reload, loadCounts],
  );

  // Closing goes through a confirm dialog; everything else applies at once.
  const handleCardMove = useCallback(
    (ticket: Ticket, move: TicketMove) => {
      if (isClosing(move)) {
        setResolutionNote('');
        setPendingClose({ ticket, move });
      } else {
        applyMove(ticket, move);
      }
    },
    [applyMove],
  );

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (poolFilter === 'none') list = list.filter((t) => t.poolAbteilungId == null);
    else if (poolFilter !== 'all') list = list.filter((t) => t.poolAbteilungId === poolFilter);
    if (assigneeFilter === 'mine') list = list.filter((t) => !!currentEmployeeId && t.assignedTo === currentEmployeeId);
    else if (assigneeFilter === 'unassigned') list = list.filter((t) => t.assignedTo == null);
    else if (assigneeFilter !== 'all') list = list.filter((t) => t.assignedTo === assigneeFilter);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(term) ||
          t.ticketNumber.toLowerCase().includes(term) ||
          (t.customerName?.toLowerCase().includes(term) ?? false),
      );
    }
    return list;
  }, [tickets, search, poolFilter, assigneeFilter, currentEmployeeId]);

  function openTicket(t: Ticket) {
    navigate(`/tickets/${t.id}`);
  }

  // Matrix drill-down: focus the list on the chosen pool (+ status).
  function handleMatrixSelect(poolId: number | 'none', status: TicketStatus | 'all') {
    setView('list');
    setStatusTab(status);
    setPoolFilter(poolId);
  }

  // Detail view (a single ticket).
  if (detailId) {
    return (
      <div className="flex-1 overflow-auto">
        <TicketDetail
          ticketId={detailId}
          currentEmployeeId={currentEmployeeId}
          onBack={() => navigate('/tickets')}
        />
      </div>
    );
  }

  // List / board view.
  return (
    <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2">
            <Wrench size={20} className="text-red-600" />
            <h1 className="font-bold text-slate-700" style={{ fontSize: 18 }}>Tickets</h1>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm font-medium"
            onClick={() => {
              setCreateInitialCustomer(undefined);
              setShowCreate(true);
            }}
          >
            <Plus size={16} />
            Neues Ticket
          </button>
        </div>

        {/* Pool × status overview matrix (collapsible landing panel) */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setMatrixOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 mb-1.5"
          >
            {matrixOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Übersicht
          </button>
          {matrixOpen && (
            <TicketMatrix counts={counts} pools={pools} onSelect={handleMatrixSelect} />
          )}
        </div>

        {/* Pool (Abteilung) filter — restores the old per-pool overview */}
        <div className="flex flex-wrap gap-1.5 mb-2" data-testid="pool-pills">
          {([{ key: 'all' as const, label: 'Alle', count: tickets.length }]
            .concat(
              pools.map((p) => ({ key: p.id as never, label: p.name, count: poolCounts.get(p.id) ?? 0 })),
            )
            .concat([{ key: 'none' as never, label: 'Ohne Zuordnung', count: poolCounts.get('none') ?? 0 }])
          ).map((pill) => {
            const isActive = poolFilter === pill.key;
            return (
              <button
                key={String(pill.key)}
                type="button"
                onClick={() => setPoolFilter(pill.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition ${
                  isActive
                    ? 'bg-red-50 border-red-200 text-red-700 font-medium'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {pill.label}
                <span className={`text-xs ${isActive ? 'text-red-500' : 'text-slate-400'}`}>{pill.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          {view === 'list' && (
            <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1">
              {STATUS_TABS.map((tab) => {
                const isActive = statusTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`px-3 py-1.5 rounded-md text-sm transition ${
                      isActive ? 'bg-white text-red-600 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-800'
                    }`}
                    onClick={() => setStatusTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="sm:w-52" data-testid="assignee-filter">
            <Select
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={[
                { value: 'all', label: 'Alle Techniker' },
                { value: 'mine', label: 'Meine Tickets' },
                { value: 'unassigned', label: 'Nicht zugewiesen' },
                ...employees.map((e) => ({ value: e.id, label: e.name })),
              ]}
              ariaLabel="Nach Zuweisung filtern"
            />
          </div>
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticket-Nr, Titel oder Kunde suchen…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1 self-start">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`px-2.5 py-1.5 rounded-md transition ${
                view === 'list' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Liste"
              aria-label="Liste anzeigen"
              data-testid="view-toggle-list"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('board')}
              className={`px-2.5 py-1.5 rounded-md transition ${
                view === 'board' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Board"
              aria-label="Board anzeigen"
              data-testid="view-toggle-board"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-red-400" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <Wrench size={32} className="mx-auto mb-2 text-slate-300" />
            <div className="text-sm text-slate-500">Keine Tickets in dieser Ansicht.</div>
          </div>
        ) : view === 'board' ? (
          <TicketBoard
            tickets={filteredTickets}
            onTicketClick={openTicket}
            onCardMove={handleCardMove}
            // Group into per-pool swimlanes only when no single pool is
            // selected; a specific pool shows as a plain board.
            swimlanes={
              poolFilter === 'all'
                ? [
                    ...pools.map((p) => ({ id: p.id as number | 'none', name: p.name })),
                    { id: 'none' as number | 'none', name: 'Ohne Zuordnung' },
                  ]
                : undefined
            }
          />
        ) : (
          <ul className="space-y-2">
            {filteredTickets.map((t) => {
              const badge = STATUS_BADGE[t.status];
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-3 hover:border-slate-300 transition cursor-pointer"
                  onClick={() => openTicket(t)}
                  data-testid="ticket-row"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-400">{t.ticketNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs border ${badge.cls}`}>{badge.label}</span>
                        <span className={`text-xs ${PRIORITY_BADGE[t.priority]}`}>
                          {t.priority === 'urgent' ? '! dringend' : t.priority === 'high' ? '! hoch' : ''}
                        </span>
                      </div>
                      <div className="font-medium text-sm text-slate-800 mt-0.5 truncate">{t.title}</div>
                      {t.customerName && (
                        <div className="text-xs text-slate-500 mt-0.5">{t.customerName}</div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setPendingClose(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-slate-800 mb-1">Ticket schließen?</h2>
            <p className="text-sm text-slate-500 mb-3">
              <span className="font-mono text-xs">{pendingClose.ticket.ticketNumber}</span> ·{' '}
              {pendingClose.ticket.title}
            </p>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Lösungsnotiz (optional)
            </label>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              placeholder="Was wurde gemacht?"
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingClose(null)}
                className="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  applyMove(pendingClose.ticket, pendingClose.move, resolutionNote.trim() || undefined);
                  setPendingClose(null);
                }}
                className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <TicketForm
          currentEmployeeId={currentEmployeeId}
          initialCustomer={createInitialCustomer}
          onClose={() => {
            setShowCreate(false);
            setCreateInitialCustomer(undefined);
          }}
          onSaved={(t) => {
            setShowCreate(false);
            setCreateInitialCustomer(undefined);
            navigate(`/tickets/${t.id}`);
          }}
        />
      )}
    </div>
  );
}
