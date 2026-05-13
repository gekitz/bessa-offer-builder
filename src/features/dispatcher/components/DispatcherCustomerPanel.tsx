// Middle column of the dispatcher view.
//
// Shows the picked customer's header (company, contact, phone, email,
// address) and inline list of their open/in-progress/waiting tickets.
// "Neues Ticket" button is wired in a follow-up PR; for now it fires a
// callback the page may handle.

import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, FileText, Loader2, Mail, MapPin, Phone, Plus, Wrench } from 'lucide-react';
import { listTickets } from '../../tickets/api/ticketApi';
import type { Ticket } from '../../tickets/types';
import type { DispatcherCustomer } from './DispatcherSearchPanel';

interface Props {
  customer: DispatcherCustomer | null;
  selectedTicketId: string | null;
  onSelectTicket: (ticket: Ticket | null) => void;
  onCreateTicket: () => void;
}

const PRIORITY_COLORS: Record<Ticket['priority'], string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<Ticket['status'], string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartet',
  closed: 'Geschlossen',
  cancelled: 'Storniert',
};

export default function DispatcherCustomerPanel({
  customer,
  selectedTicketId,
  onSelectTicket,
  onCreateTicket,
}: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer?.mesonicId) {
      setTickets([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTickets({
      mesonicCustomerId: customer.mesonicId,
      status: ['open', 'in_progress', 'waiting'],
    })
      .then((data) => {
        if (!cancelled) setTickets(data);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setTickets([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer?.mesonicId]);

  if (!customer) {
    return (
      <div className="flex flex-col h-full bg-slate-50 items-center justify-center text-slate-400 px-6 text-center">
        <Wrench size={32} className="mb-3 text-slate-300" />
        <div className="font-medium" style={{ fontSize: 13 }}>
          Kunden auswählen
        </div>
        <div className="mt-1" style={{ fontSize: 11 }}>
          Suchen Sie einen Bestandskunden links, um offene Tickets und Termine zu sehen.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0" data-testid="dispatcher-customer-header">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800 truncate" style={{ fontSize: 14 }}>
              {customer.company}
            </div>
            {customer.contactName && (
              <div className="text-slate-500 truncate" style={{ fontSize: 11 }}>
                {customer.contactName}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-slate-500" style={{ fontSize: 11 }}>
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="hover:text-red-600">
                  <Phone size={10} className="inline mr-0.5" />
                  {customer.phone}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="truncate hover:text-red-600">
                  <Mail size={10} className="inline mr-0.5" />
                  {customer.email}
                </a>
              )}
              {customer.address && (
                <span className="truncate">
                  <MapPin size={10} className="inline mr-0.5" />
                  {customer.address}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCreateTicket}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 font-medium transition-colors"
            style={{ fontSize: 12 }}
            data-testid="dispatcher-new-ticket"
          >
            <Plus size={12} />
            Neues Ticket
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2">
        <div className="text-slate-500 font-medium px-1 mb-1.5" style={{ fontSize: 11 }}>
          Offene Tickets
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 px-1 py-2" style={{ fontSize: 12 }}>
            <Loader2 size={12} className="animate-spin" /> Lade Tickets…
          </div>
        )}
        {error && (
          <div
            className="flex items-center gap-2 p-2 rounded-lg bg-red-50 text-red-600 border border-red-200"
            style={{ fontSize: 11 }}
          >
            <AlertCircle size={12} /> {error}
          </div>
        )}
        {!loading && !error && tickets.length === 0 && (
          <div className="text-slate-400 px-1 py-2 italic" style={{ fontSize: 12 }}>
            Keine offenen Tickets für diesen Kunden.
          </div>
        )}
        {tickets.length > 0 && (
          <div className="space-y-1" data-testid="dispatcher-customer-tickets">
            {tickets.map((t) => {
              const isSelected = t.id === selectedTicketId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTicket(isSelected ? null : t)}
                  className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                    isSelected ? 'bg-red-50 border border-red-200' : 'hover:bg-slate-50 border border-transparent'
                  }`}
                  data-testid="dispatcher-ticket-row"
                >
                  <div className="flex items-start gap-2">
                    <FileText size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-400 flex-shrink-0" style={{ fontSize: 10 }}>
                          {t.ticketNumber}
                        </span>
                        <span className="font-semibold text-slate-800 truncate" style={{ fontSize: 12 }}>
                          {t.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`rounded-full px-1.5 py-px font-medium ${PRIORITY_COLORS[t.priority]}`}
                          style={{ fontSize: 9 }}
                        >
                          {t.priority}
                        </span>
                        <span className="text-slate-500" style={{ fontSize: 10 }}>
                          {STATUS_LABELS[t.status]}
                        </span>
                        {t._appointmentCount != null && t._appointmentCount > 0 && (
                          <span className="text-slate-400" style={{ fontSize: 10 }}>
                            · {t._appointmentCount} Termine
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink size={10} className="text-slate-300 flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
