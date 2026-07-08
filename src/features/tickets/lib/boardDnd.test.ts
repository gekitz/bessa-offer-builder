import { describe, expect, it } from 'vitest';
import { isClosing, poolKeyToId, resolveDrop } from './boardDnd';
import type { Ticket } from '../types';

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1', ticketNumber: '26-0000001', shareCode: 's1',
    title: 'x', description: null, kind: 'support', priority: 'normal',
    status: 'open', poolAbteilungId: 2, assignedTo: null,
    mesonicCustomerId: null, customerName: null, customerPhone: null,
    customerEmail: null, customerAddress: null, customerHasWartungsvertrag: false,
    standortId: null, billable: true, closedAt: null, closedBy: null,
    resolutionNote: null, offerId: null, mesonicBelegId: null, createdBy: null,
    createdAt: '2026-07-08T00:00:00Z', updatedAt: '2026-07-08T00:00:00Z',
    ...over,
  };
}

describe('resolveDrop', () => {
  it('returns null when dropped where it already is', () => {
    expect(resolveDrop(ticket({ status: 'open', poolAbteilungId: 2 }), { status: 'open', pool: 2 })).toBeNull();
  });

  it('detects a status change', () => {
    expect(resolveDrop(ticket({ status: 'open' }), { status: 'in_progress', pool: 2 })).toEqual({
      status: 'in_progress',
    });
  });

  it('detects a pool change (reroute across swimlanes)', () => {
    expect(resolveDrop(ticket({ status: 'open', poolAbteilungId: 2 }), { status: 'open', pool: 1 })).toEqual({
      pool: 1,
    });
  });

  it('detects both status and pool changing at once', () => {
    expect(resolveDrop(ticket({ status: 'open', poolAbteilungId: 2 }), { status: 'waiting', pool: 1 })).toEqual({
      status: 'waiting',
      pool: 1,
    });
  });

  it('treats an unassigned pool as "none"', () => {
    expect(resolveDrop(ticket({ poolAbteilungId: null }), { status: 'open', pool: 'none' })).toBeNull();
    expect(resolveDrop(ticket({ poolAbteilungId: null }), { status: 'open', pool: 2 })).toEqual({ pool: 2 });
  });

  it('ignores pool when the target has none (flat board)', () => {
    expect(resolveDrop(ticket({ status: 'open', poolAbteilungId: 2 }), { status: 'closed' })).toEqual({
      status: 'closed',
    });
  });
});

describe('isClosing', () => {
  it('is true only when the move sets status closed', () => {
    expect(isClosing({ status: 'closed' })).toBe(true);
    expect(isClosing({ status: 'in_progress' })).toBe(false);
    expect(isClosing({ pool: 1 })).toBe(false);
  });
});

describe('poolKeyToId', () => {
  it('maps none → null and passes numbers through', () => {
    expect(poolKeyToId('none')).toBeNull();
    expect(poolKeyToId(3)).toBe(3);
  });
});
