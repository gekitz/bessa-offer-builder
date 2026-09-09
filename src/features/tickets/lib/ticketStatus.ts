import type { TicketStatus } from '../types';

// Deutsche Labels + Badge-Farben für den Ticket-Status. Bislang mehrfach in
// einzelnen Komponenten dupliziert (TicketDetail, TicketMatrix …) — hier als
// gemeinsame Quelle für neue Verwendungen (z. B. das CRM-Ticket-Panel).
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  review: 'In Prüfung',
  closed: 'Geschlossen',
  cancelled: 'Abgesagt',
};

export const TICKET_STATUS_BADGE: Record<TicketStatus, string> = {
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  waiting: 'bg-slate-100 text-slate-600',
  review: 'bg-violet-50 text-violet-700',
  closed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
};

// Terminale (nicht mehr offene) Status.
export const CLOSED_TICKET_STATES: TicketStatus[] = ['closed', 'cancelled'];

export function isClosedStatus(status: TicketStatus): boolean {
  return CLOSED_TICKET_STATES.includes(status);
}
