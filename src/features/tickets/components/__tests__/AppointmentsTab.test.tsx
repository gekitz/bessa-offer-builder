import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listAppointmentsForTicketMock = vi.fn();
const createAppointmentMock = vi.fn();
const updateAppointmentMock = vi.fn();
const setAppointmentAssigneesMock = vi.fn();
const deleteAppointmentMock = vi.fn();
const listEmployeesMock = vi.fn();
const listStandorteMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  listAppointmentsForTicket: (ticketId: string) => listAppointmentsForTicketMock(ticketId),
  createAppointment: (input: unknown, assignees: unknown) => createAppointmentMock(input, assignees),
  updateAppointment: (id: string, patch: unknown) => updateAppointmentMock(id, patch),
  setAppointmentAssignees: (apptId: string, assignees: unknown) => setAppointmentAssigneesMock(apptId, assignees),
  deleteAppointment: (id: string) => deleteAppointmentMock(id),
}));
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listStandorte: () => listStandorteMock(),
}));

import AppointmentsTab from '../AppointmentsTab';
import type { Appointment, Ticket } from '../../types';

const TICKET: Ticket = {
  id: 't-1', ticketNumber: '26-0000001', shareCode: 'sc-test-0000001', title: 'Drucker', description: null,
  kind: 'reparatur', priority: 'normal', status: 'open',
  poolAbteilungId: null, assignedTo: null, mesonicCustomerId: null,
  customerName: 'Müller', customerPhone: null, customerEmail: null,
  customerAddress: null, customerHasWartungsvertrag: false, standortId: null,
  billable: true, closedAt: null, closedBy: null, resolutionNote: null,
  offerId: null, mesonicBelegId: null, createdBy: null,
  createdAt: '', updatedAt: '',
};

const APPT: Appointment = {
  id: 'a-1', ticketId: 't-1', mesonicCustomerId: null, customerName: 'Müller',
  title: 'Vor-Ort-Reparatur', description: null, kind: 'reparatur',
  startsAt: '2026-05-15T09:00:00.000Z', endsAt: '2026-05-15T11:00:00.000Z',
  allDay: false, location: 'Klagenfurt', status: 'geplant', standortId: null,
  notes: null, createdBy: null, createdAt: '', updatedAt: '',
  assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '', _employeeName: 'Hannes' }],
};

beforeEach(() => {
  listAppointmentsForTicketMock.mockReset().mockResolvedValue([]);
  createAppointmentMock.mockReset().mockResolvedValue({ ...APPT, id: 'a-new' });
  listEmployeesMock.mockReset().mockResolvedValue([]);
  listStandorteMock.mockReset().mockResolvedValue([]);
});

describe('AppointmentsTab', () => {
  it('shows an empty state with the new-Termin CTA when no appointments exist', async () => {
    render(<AppointmentsTab ticket={TICKET} />);
    await screen.findByText(/Noch keine Termine/);
    expect(screen.getByRole('button', { name: /Neuer Termin/ })).toBeInTheDocument();
  });

  it('lists existing appointments with date and assignees', async () => {
    listAppointmentsForTicketMock.mockResolvedValueOnce([APPT]);
    render(<AppointmentsTab ticket={TICKET} />);
    await screen.findByText('Vor-Ort-Reparatur');
    expect(screen.getAllByTestId('appointment-card')).toHaveLength(1);
    expect(screen.getByText(/Hannes/)).toBeInTheDocument();
  });

  it('opens AppointmentForm in create mode from "Neuer Termin"', async () => {
    const u = userEvent.setup();
    render(<AppointmentsTab ticket={TICKET} />);
    await screen.findByText(/Noch keine Termine/);
    await u.click(screen.getByRole('button', { name: /Neuer Termin/ }));
    await screen.findByText('Neuer Termin', { selector: 'h2' });
  });

  it('opens AppointmentForm in edit mode when a card is clicked', async () => {
    listAppointmentsForTicketMock.mockResolvedValueOnce([APPT]);
    const u = userEvent.setup();
    render(<AppointmentsTab ticket={TICKET} />);
    await screen.findByText('Vor-Ort-Reparatur');
    await u.click(screen.getByTestId('appointment-card'));
    await screen.findByText('Termin bearbeiten');
  });
});
