import type { Ticket } from '../types';
import { isClosedStatus } from './ticketStatus';

export interface CustomerTicketGroups {
  open: Ticket[];
  recentClosed: Ticket[];
}

// Sortierschlüssel für "zuletzt geschlossen": bevorzugt das Abschlussdatum,
// fällt auf updatedAt/createdAt zurück (cancelled hat evtl. kein closedAt).
function closeKey(t: Ticket): string {
  return t.closedAt ?? t.updatedAt ?? t.createdAt ?? '';
}

// Teilt die Tickets eines Kunden in "offen" (nicht-terminale Status, in
// gegebener Reihenfolge) und die N zuletzt geschlossenen (closed/cancelled,
// absteigend nach Abschlussdatum). Pure → unit-testbar.
export function splitCustomerTickets(tickets: Ticket[], recentClosedCount = 3): CustomerTicketGroups {
  const open = tickets.filter((t) => !isClosedStatus(t.status));
  const recentClosed = tickets
    .filter((t) => isClosedStatus(t.status))
    .slice()
    .sort((a, b) => closeKey(b).localeCompare(closeKey(a)))
    .slice(0, recentClosedCount);
  return { open, recentClosed };
}
