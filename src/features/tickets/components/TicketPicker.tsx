import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Search, Wrench, X } from 'lucide-react';
import { listTickets } from '../api/ticketApi';
import type { Ticket } from '../types';

interface TicketPickerProps {
  onSelect: (ticket: Ticket) => void;
  onClose: () => void;
  // When provided, the picker biases toward this customer — open tickets
  // belonging to mesonicCustomerId are listed first, even before the
  // user types anything. Search still works freely across all tickets.
  customerFilter?: { mesonicCustomerId?: string | null } | null;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const STATUS_LABEL: Record<Ticket['status'], string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  review: 'In Prüfung',
  closed: 'Geschlossen',
  cancelled: 'Abgesagt',
};

export default function TicketPicker({ onSelect, onClose, customerFilter }: TicketPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);
  const [results, setResults] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Default load: when no query, surface open tickets for the linked
  // customer (if any) or recent open tickets system-wide.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const filters = debouncedQuery
      ? { search: debouncedQuery }
      : customerFilter?.mesonicCustomerId
        ? {
            mesonicCustomerId: customerFilter.mesonicCustomerId,
            status: ['open', 'in_progress', 'waiting'] as Ticket['status'][],
          }
        : { status: ['open', 'in_progress'] as Ticket['status'][] };
    listTickets(filters)
      .then((tickets) => {
        if (!cancelled) setResults(tickets.slice(0, 50));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, customerFilter?.mesonicCustomerId]);

  const emptyMessage = useMemo(() => {
    if (debouncedQuery) return 'Keine Treffer.';
    if (customerFilter?.mesonicCustomerId) return 'Keine offenen Tickets für diesen Kunden.';
    return 'Keine offenen Tickets.';
  }, [debouncedQuery, customerFilter?.mesonicCustomerId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
      data-testid="ticket-picker-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl mt-16 w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden mx-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wrench size={14} className="text-slate-500" />
              <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>
                Ticket verknüpfen
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1.5 hover:bg-slate-100"
              aria-label="Schließen"
            >
              <X size={16} className="text-slate-500" />
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ticket-Nr, Titel oder Kunde"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 py-2">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-slate-400" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700 mb-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          {!loading && results !== null && results.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-6">{emptyMessage}</div>
          )}
          {results && results.length > 0 && (
            <ul className="space-y-1" data-testid="ticket-picker-results">
              {results.map((t) => {
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(t)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
                      data-testid={`ticket-picker-row-${t.id}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-400">{t.ticketNumber}</span>
                        <span className="text-xs rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">
                          {STATUS_LABEL[t.status]}
                        </span>
                      </div>
                      <div className="font-medium text-sm text-slate-800 mt-0.5 truncate">{t.title}</div>
                      {t.customerName && (
                        <div className="text-xs text-slate-500 truncate">{t.customerName}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
