// Brücke zwischen Viertl-Installationen und dem Ticket-System. Ein aus
// der Viertl-Liste angelegtes Support-/Reparatur-Ticket wird auf der
// Lizenz gespeichert (linked_ticket_id) und hier nur zusammengefasst,
// um Status/Nummer in der Viertl-Detailansicht zu spiegeln — analog zu
// lib/offerLink.ts.

import { getTicket } from '../../tickets/api/ticketApi';
import type { Ticket } from '../../tickets/types';

export interface TicketSummary {
  id: string;
  ticketNumber: string;
  title: string;
  status: Ticket['status'];
  createdAt: string;
  closedAt: string | null;
}

export function toTicketSummary(t: Ticket): TicketSummary {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    status: t.status,
    createdAt: t.createdAt,
    closedAt: t.closedAt ?? null,
  };
}

export async function getTicketSummary(ticketId: string): Promise<TicketSummary | null> {
  try {
    const t = await getTicket(ticketId);
    return t ? toTicketSummary(t) : null;
  } catch {
    return null;
  }
}
