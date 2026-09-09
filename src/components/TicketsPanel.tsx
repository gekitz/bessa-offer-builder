import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Ticket as TicketIcon } from 'lucide-react';
import { listTickets } from '../features/tickets/api/ticketApi';
import type { Ticket } from '../features/tickets/types';
import { TICKET_STATUS_LABEL, TICKET_STATUS_BADGE, isClosedStatus } from '../features/tickets/lib/ticketStatus';
import { splitCustomerTickets } from '../features/tickets/lib/customerTickets';

const RECENT_CLOSED = 3;

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Tickets eines Kunden im CRM: alle offenen + die zuletzt geschlossenen. Lädt
// automatisch (eine indizierte Supabase-Abfrage über mesonic_customer_id) und
// verlinkt jede Zeile in die Ticket-Detailansicht. Keyed by Kd.-Nr.
export default function TicketsPanel({ kdnr }: { kdnr: string }) {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kdnr) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTickets({ mesonicCustomerId: kdnr })
      .then((rows) => { if (!cancelled) setTickets(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kdnr]);

  const all = tickets ?? [];
  const { open, recentClosed: closed } = splitCustomerTickets(all, RECENT_CLOSED);

  function Row({ t }: { t: Ticket }) {
    return (
      <button
        onClick={() => navigate(`/tickets/${t.id}`, { state: { from: 'crm' } })}
        className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-red-300 hover:bg-red-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{t.ticketNumber}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TICKET_STATUS_BADGE[t.status]}`}>
            {TICKET_STATUS_LABEL[t.status]}
          </span>
          <span className="ml-auto text-[11px] text-slate-400">
            {fmtDate(isClosedStatus(t.status) ? (t.closedAt ?? t.createdAt) : t.createdAt)}
          </span>
        </div>
        <div className="mt-0.5 text-sm font-medium text-slate-800 truncate">{t.title}</div>
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide inline-flex items-center gap-1.5">
          <TicketIcon className="w-3.5 h-3.5" /> Tickets
        </span>
        {tickets !== null && !loading && (
          <span className="text-xs text-slate-400">{open.length} offen</span>
        )}
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : tickets === null ? null : all.length === 0 ? (
        <p className="text-xs text-slate-400">Keine Tickets für diesen Kunden.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-1">Offen ({open.length})</div>
            {open.length === 0 ? (
              <p className="text-xs text-slate-400">Keine offenen Tickets.</p>
            ) : (
              <div className="space-y-2">{open.map((t) => <Row key={t.id} t={t} />)}</div>
            )}
          </div>
          {closed.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1">Zuletzt geschlossen</div>
              <div className="space-y-2">{closed.map((t) => <Row key={t.id} t={t} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
