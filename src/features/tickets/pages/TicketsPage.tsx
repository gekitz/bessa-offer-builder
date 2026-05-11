import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, LayoutGrid, List, Loader2, Plus, Search, Wrench } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { TEAM } from '../../offers/data/catalogs';
import { listEmployees } from '../../vacation/api/vacationApi';
import { listTickets } from '../api/ticketApi';
import TicketBoard from '../components/TicketBoard';
import TicketDetail from '../components/TicketDetail';
import TicketForm from '../components/TicketForm';
import type { Ticket, TicketStatus } from '../types';

const STATUS_TABS: Array<{ id: TicketStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: 'open', label: 'Offen' },
  { id: 'in_progress', label: 'In Arbeit' },
  { id: 'waiting', label: 'Wartend' },
  { id: 'closed', label: 'Geschlossen' },
];

const STATUS_BADGE: Record<TicketStatus, { label: string; cls: string }> = {
  open:        { label: 'Offen',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'In Arbeit',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  waiting:     { label: 'Wartend',      cls: 'bg-slate-100 text-slate-600 border-slate-200' },
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
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => saveView(view), [view]);

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

  useEffect(() => {
    if (!detailId) reload();
  }, [reload, detailId]);

  const filteredTickets = useMemo(() => {
    if (!search.trim()) return tickets;
    const term = search.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        t.ticketNumber.toLowerCase().includes(term) ||
        (t.customerName?.toLowerCase().includes(term) ?? false),
    );
  }, [tickets, search]);

  function openTicket(t: Ticket) {
    navigate(`/tickets/${t.id}`);
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
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} />
            Neues Ticket
          </button>
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
          <TicketBoard tickets={filteredTickets} onTicketClick={openTicket} />
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

      {showCreate && (
        <TicketForm
          currentEmployeeId={currentEmployeeId}
          onClose={() => setShowCreate(false)}
          onSaved={(t) => {
            setShowCreate(false);
            navigate(`/tickets/${t.id}`);
          }}
        />
      )}
    </div>
  );
}
