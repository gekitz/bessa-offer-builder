import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listRepairOrdersMock = vi.fn();
const createRepairOrderMock = vi.fn();
const getRepairOrderMock = vi.fn();
const listServiceRatesMock = vi.fn();
const listTravelZonesMock = vi.fn();
const listEmployeesMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  listRepairOrders: (ticketId: string) => listRepairOrdersMock(ticketId),
  createRepairOrder: (input: unknown) => createRepairOrderMock(input),
  getRepairOrder: (id: string) => getRepairOrderMock(id),
  listServiceRates: () => listServiceRatesMock(),
  listTravelZones: () => listTravelZonesMock(),
  // Detail uses these but they shouldn't be hit in the list-mode tests below.
  updateRepairOrder: vi.fn(),
  addMaterial: vi.fn(),
  removeMaterial: vi.fn(),
  signRepairOrder: vi.fn(),
  addEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
}));

import RepairOrdersTab from '../RepairOrdersTab';
import type { RepairOrder, Ticket } from '../../types';

const ticket: Ticket = {
  id: 't-1', ticketNumber: '26-0000001', title: 'T', description: null,
  kind: 'reparatur', priority: 'normal', status: 'open',
  poolAbteilungId: null, assignedTo: null, mesonicCustomerId: null,
  customerName: 'Müller', customerPhone: null, customerEmail: null,
  customerAddress: null, customerHasWartungsvertrag: false, standortId: null,
  billable: true, closedAt: null, closedBy: null, resolutionNote: null,
  offerId: null, mesonicBelegId: null, createdBy: null,
  createdAt: '2026-05-11T08:00:00Z', updatedAt: '2026-05-11T08:00:00Z',
};

const ro1: RepairOrder = {
  id: 'ro-1', ticketId: 't-1', appointmentId: null, seqNumber: 1,
  status: 'completed', workDescription: 'Drucker geprüft', gpsTravelNote: null,
  signatureData: null, signedAt: null, signedByName: null,
  performedAt: '2026-05-12', billable: true, createdBy: null,
  createdAt: '', updatedAt: '',
};

beforeEach(() => {
  listRepairOrdersMock.mockReset().mockResolvedValue([]);
  createRepairOrderMock.mockReset().mockResolvedValue({ ...ro1, id: 'ro-new', seqNumber: 2 });
  getRepairOrderMock.mockReset().mockResolvedValue({ repairOrder: { ...ro1, id: 'ro-new', seqNumber: 2 }, entries: [], materials: [] });
  listServiceRatesMock.mockReset().mockResolvedValue([]);
  listTravelZonesMock.mockReset().mockResolvedValue([]);
  listEmployeesMock.mockReset().mockResolvedValue([]);
});

describe('RepairOrdersTab', () => {
  it('shows an empty state when there are no repair orders', async () => {
    render(<RepairOrdersTab ticket={ticket} />);
    await screen.findByText(/Noch keine Reparaturscheine/);
    expect(screen.getByRole('button', { name: /Neuer Reparaturschein/ })).toBeInTheDocument();
  });

  it('lists existing repair orders', async () => {
    listRepairOrdersMock.mockResolvedValueOnce([ro1]);
    render(<RepairOrdersTab ticket={ticket} />);
    await screen.findByText(/Rep.schein #1/);
    expect(screen.getAllByTestId('repair-order-card')).toHaveLength(1);
  });

  it('creates a new repair order and opens its detail view', async () => {
    const u = userEvent.setup();
    render(<RepairOrdersTab ticket={ticket} currentEmployeeId="emp-a" />);
    await screen.findByText(/Noch keine Reparaturscheine/);

    await u.click(screen.getByRole('button', { name: /Neuer Reparaturschein/ }));

    await waitFor(() => expect(createRepairOrderMock).toHaveBeenCalled());
    const input = createRepairOrderMock.mock.calls[0][0];
    expect(input.ticketId).toBe('t-1');
    expect(input.createdBy).toBe('emp-a');

    // Detail view loads; back button shows "Zurück zur Liste"
    await screen.findByText(/Zurück zur Liste/);
    expect(getRepairOrderMock).toHaveBeenCalledWith('ro-new');
  });
});
