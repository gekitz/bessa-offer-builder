import { describe, it, expect } from 'vitest';
import type { Ticket, TicketStatus } from '../../types';
import { splitCustomerTickets } from '../customerTickets';

// Minimaler Ticket-Stub — nur die Felder, die splitCustomerTickets liest.
function t(id: string, status: TicketStatus, dates: Partial<Pick<Ticket, 'closedAt' | 'updatedAt' | 'createdAt'>> = {}): Ticket {
  return {
    id,
    status,
    closedAt: dates.closedAt ?? null,
    updatedAt: dates.updatedAt ?? '2026-01-01T00:00:00Z',
    createdAt: dates.createdAt ?? '2026-01-01T00:00:00Z',
  } as Ticket;
}

describe('splitCustomerTickets', () => {
  it('treats open/in_progress/waiting/review as open, closed/cancelled as terminal', () => {
    const tickets = [
      t('a', 'open'), t('b', 'in_progress'), t('c', 'waiting'), t('d', 'review'),
      t('e', 'closed'), t('f', 'cancelled'),
    ];
    const { open, recentClosed } = splitCustomerTickets(tickets);
    expect(open.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(recentClosed.map((x) => x.id).sort()).toEqual(['e', 'f']);
  });

  it('keeps open tickets in their original order', () => {
    const tickets = [t('b', 'in_progress'), t('a', 'open'), t('c', 'review')];
    expect(splitCustomerTickets(tickets).open.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts closed tickets by close date descending and caps at the requested count', () => {
    const tickets = [
      t('old', 'closed', { closedAt: '2026-01-10T00:00:00Z' }),
      t('new', 'closed', { closedAt: '2026-03-01T00:00:00Z' }),
      t('mid', 'closed', { closedAt: '2026-02-01T00:00:00Z' }),
      t('older', 'closed', { closedAt: '2025-12-01T00:00:00Z' }),
    ];
    const { recentClosed } = splitCustomerTickets(tickets, 3);
    expect(recentClosed.map((x) => x.id)).toEqual(['new', 'mid', 'old']);
  });

  it('falls back to updatedAt/createdAt when a terminal ticket has no closedAt (e.g. cancelled)', () => {
    const tickets = [
      t('cancelled-recent', 'cancelled', { closedAt: null, updatedAt: '2026-05-01T00:00:00Z' }),
      t('closed-older', 'closed', { closedAt: '2026-04-01T00:00:00Z' }),
    ];
    expect(splitCustomerTickets(tickets, 3).recentClosed.map((x) => x.id))
      .toEqual(['cancelled-recent', 'closed-older']);
  });

  it('returns empty groups for no tickets', () => {
    expect(splitCustomerTickets([])).toEqual({ open: [], recentClosed: [] });
  });
});
