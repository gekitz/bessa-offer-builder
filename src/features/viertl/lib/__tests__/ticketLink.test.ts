import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Ticket } from '../../../tickets/types';

const getTicket = vi.fn<(id: string) => Promise<Ticket | null>>();
vi.mock('../../../tickets/api/ticketApi', () => ({
  getTicket: (...args: unknown[]) => getTicket(...(args as [string])),
}));

import { getTicketSummary, toTicketSummary } from '../ticketLink';

const TICKET = {
  id: 't1',
  ticketNumber: '26-0000042',
  title: 'Drucker druckt nicht',
  status: 'open',
  createdAt: '2026-09-28T08:00:00Z',
  closedAt: null,
} as unknown as Ticket;

beforeEach(() => {
  getTicket.mockReset();
});

describe('toTicketSummary', () => {
  it('picks the display fields off a full ticket', () => {
    expect(toTicketSummary(TICKET)).toEqual({
      id: 't1',
      ticketNumber: '26-0000042',
      title: 'Drucker druckt nicht',
      status: 'open',
      createdAt: '2026-09-28T08:00:00Z',
      closedAt: null,
    });
  });
});

describe('getTicketSummary', () => {
  it('returns a summary when the ticket exists', async () => {
    getTicket.mockResolvedValue(TICKET);
    const s = await getTicketSummary('t1');
    expect(getTicket).toHaveBeenCalledWith('t1');
    expect(s).toMatchObject({ id: 't1', ticketNumber: '26-0000042', status: 'open' });
  });

  it('returns null when the ticket is gone', async () => {
    getTicket.mockResolvedValue(null);
    expect(await getTicketSummary('missing')).toBeNull();
  });

  it('swallows errors and returns null (link must never crash the panel)', async () => {
    getTicket.mockRejectedValue(new Error('network'));
    expect(await getTicketSummary('t1')).toBeNull();
  });
});
