// Pure drag-and-drop resolution for the ticket board. Keeps the "what
// changed" logic out of the DnD wiring so it stays unit-testable.

import type { Ticket, TicketStatus } from '../types';

// Where a card was dropped: always a status column, and — in swimlane
// mode — the pool of that lane ('none' = the Ohne-Zuordnung lane).
// pool is undefined in the flat board (a single pool is already
// selected, so a drop never changes it).
export interface DropTarget {
  status: TicketStatus;
  pool?: number | 'none';
}

// The subset of fields a drop actually changes. Empty → no-op.
export interface TicketMove {
  status?: TicketStatus;
  pool?: number | 'none';
}

// Compare a dropped ticket against its target; return only what changed,
// or null when the drop lands where the ticket already is.
export function resolveDrop(ticket: Ticket, target: DropTarget): TicketMove | null {
  const move: TicketMove = {};
  if (target.status !== ticket.status) move.status = target.status;
  const currentPool = ticket.poolAbteilungId ?? 'none';
  if (target.pool !== undefined && target.pool !== currentPool) move.pool = target.pool;
  if (move.status === undefined && move.pool === undefined) return null;
  return move;
}

// A move that closes the ticket needs the confirm-on-close flow, since
// closing timestamps the ticket and notifies the customer.
export function isClosing(move: TicketMove): boolean {
  return move.status === 'closed';
}

// Normalise a pool key ('none' → null) for the updateTicket payload.
export function poolKeyToId(pool: number | 'none'): number | null {
  return pool === 'none' ? null : pool;
}
