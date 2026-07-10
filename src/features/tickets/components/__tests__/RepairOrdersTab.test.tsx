import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listRepairOrdersMock = vi.fn();
const listAppointmentsForTicketMock = vi.fn();
const createRepairOrderMock = vi.fn();
const getRepairOrderMock = vi.fn();
const listServiceRatesMock = vi.fn();
const listTravelZonesMock = vi.fn();
const listEmployeesMock = vi.fn();
const addEntryMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  listRepairOrders: (ticketId: string) => listRepairOrdersMock(ticketId),
  listAppointmentsForTicket: (ticketId: string) => listAppointmentsForTicketMock(ticketId),
  createRepairOrder: (input: unknown) => createRepairOrderMock(input),
  getRepairOrder: (id: string) => getRepairOrderMock(id),
  listServiceRates: () => listServiceRatesMock(),
  listTravelZones: () => listTravelZonesMock(),
  addEntry: (roId: string, input: unknown) => addEntryMock(roId, input),
  // Detail uses these but they shouldn't be hit in the list-mode tests below.
  updateRepairOrder: vi.fn(),
  addMaterial: vi.fn(),
  removeMaterial: vi.fn(),
  addRepairOrderAdjustment: vi.fn(),
  removeRepairOrderAdjustment: vi.fn(),
  signRepairOrder: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
}));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ isAdmin: false }),
}));

import RepairOrdersTab from '../RepairOrdersTab';
import type { RepairOrder, Ticket } from '../../types';

const ticket: Ticket = {
  id: 't-1', ticketNumber: '26-0000001', shareCode: 'sc-test-0000001', title: 'T', description: null,
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
  listAppointmentsForTicketMock.mockReset().mockResolvedValue([]);
  createRepairOrderMock.mockReset().mockResolvedValue({ ...ro1, id: 'ro-new', seqNumber: 2 });
  getRepairOrderMock.mockReset().mockResolvedValue({ repairOrder: { ...ro1, id: 'ro-new', seqNumber: 2 }, entries: [], materials: [], adjustments: [] });
  listServiceRatesMock.mockReset().mockResolvedValue([]);
  listTravelZonesMock.mockReset().mockResolvedValue([]);
  listEmployeesMock.mockReset().mockResolvedValue([]);
  addEntryMock.mockReset().mockResolvedValue({ id: 'e-1' });
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

  it('shows a "Schein erstellen" CTA for appointments without a rep-order', async () => {
    listAppointmentsForTicketMock.mockResolvedValueOnce([
      {
        id: 'a-1', ticketId: 't-1', mesonicCustomerId: null, customerName: 'Müller',
        title: 'Vor-Ort', description: null, kind: 'reparatur',
        startsAt: '2026-05-15T09:00:00.000Z', endsAt: '2026-05-15T11:00:00.000Z',
        allDay: false, location: null, status: 'geplant', standortId: null,
        notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [
          { id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '', _employeeName: 'Hannes' },
          { id: 'aa-2', appointmentId: 'a-1', employeeId: 'emp-b', role: 'techniker', createdAt: '', _employeeName: 'Klaus' },
        ],
      },
    ]);
    render(<RepairOrdersTab ticket={ticket} />);
    await screen.findByTestId('appointments-awaiting-ro');
    expect(screen.getByText(/Hannes, Klaus/)).toBeInTheDocument();
    expect(screen.getByTestId('create-ro-from-a-1')).toBeInTheDocument();
  });

  it('seeds one zero-minute entry per assignee when creating from an appointment', async () => {
    listAppointmentsForTicketMock.mockResolvedValueOnce([
      {
        id: 'a-1', ticketId: 't-1', mesonicCustomerId: null, customerName: 'Müller',
        title: 'Vor-Ort', description: 'Drucker geprüft', kind: 'reparatur',
        startsAt: '2026-05-15T09:00:00.000Z', endsAt: '2026-05-15T11:00:00.000Z',
        allDay: false, location: null, status: 'geplant', standortId: null,
        notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [
          { id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' },
          { id: 'aa-2', appointmentId: 'a-1', employeeId: 'emp-b', role: 'techniker', createdAt: '' },
        ],
      },
    ]);
    const u = userEvent.setup();
    render(<RepairOrdersTab ticket={ticket} currentEmployeeId="emp-a" />);
    await screen.findByTestId('appointments-awaiting-ro');

    await u.click(screen.getByTestId('create-ro-from-a-1'));

    await waitFor(() => expect(createRepairOrderMock).toHaveBeenCalled());
    const input = createRepairOrderMock.mock.calls[0][0];
    expect(input.appointmentId).toBe('a-1');
    expect(input.performedAt).toBe('2026-05-15');
    expect(input.workDescription).toBe('Drucker geprüft');

    await waitFor(() => expect(addEntryMock).toHaveBeenCalledTimes(2));
    expect(addEntryMock.mock.calls[0][1].employeeId).toBe('emp-a');
    expect(addEntryMock.mock.calls[1][1].employeeId).toBe('emp-b');
    expect(addEntryMock.mock.calls[0][1].workMinutes).toBe(0);
  });
});
