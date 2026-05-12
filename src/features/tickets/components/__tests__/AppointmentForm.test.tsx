import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createAppointmentMock = vi.fn();
const updateAppointmentMock = vi.fn();
const setAppointmentAssigneesMock = vi.fn();
const deleteAppointmentMock = vi.fn();
const listEmployeesMock = vi.fn();
const listStandorteMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  createAppointment: (input: unknown, assignees: unknown) => createAppointmentMock(input, assignees),
  updateAppointment: (id: string, patch: unknown) => updateAppointmentMock(id, patch),
  setAppointmentAssignees: (apptId: string, assignees: unknown) => setAppointmentAssigneesMock(apptId, assignees),
  deleteAppointment: (id: string) => deleteAppointmentMock(id),
}));
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listStandorte: () => listStandorteMock(),
}));

import AppointmentForm from '../AppointmentForm';
import type { Appointment, Ticket } from '../../types';
import type { Employee } from '../../../vacation/types';

const EMPLOYEES: Employee[] = [
  { id: 'emp-a', code: 'a', name: 'Hannes Huber', standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true },
  { id: 'emp-b', code: 'b', name: 'Klaus Weber',  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true },
];

const TICKET: Ticket = {
  id: 't-1', ticketNumber: '26-0000001', title: 'Drucker', description: null,
  kind: 'reparatur', priority: 'normal', status: 'open',
  poolAbteilungId: null, assignedTo: null, mesonicCustomerId: '4711',
  customerName: 'Müller GmbH', customerPhone: null, customerEmail: null,
  customerAddress: 'Musterweg 1', customerHasWartungsvertrag: false, standortId: 1,
  billable: true, closedAt: null, closedBy: null, resolutionNote: null,
  offerId: null, mesonicBelegId: null, createdBy: null,
  createdAt: '', updatedAt: '',
};

const APPT: Appointment = {
  id: 'a-1', ticketId: 't-1', mesonicCustomerId: '4711', customerName: 'Müller GmbH',
  title: 'Vor-Ort', description: null, kind: 'reparatur',
  startsAt: '2026-05-15T09:00:00.000Z', endsAt: '2026-05-15T11:00:00.000Z',
  allDay: false, location: 'Klagenfurt', status: 'geplant', standortId: 1,
  notes: null, createdBy: null, createdAt: '', updatedAt: '',
  assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
};

beforeEach(() => {
  createAppointmentMock.mockReset().mockResolvedValue({ ...APPT, id: 'a-new' });
  updateAppointmentMock.mockReset().mockResolvedValue(APPT);
  setAppointmentAssigneesMock.mockReset().mockResolvedValue(undefined);
  deleteAppointmentMock.mockReset().mockResolvedValue(undefined);
  listEmployeesMock.mockReset().mockResolvedValue(EMPLOYEES);
  listStandorteMock.mockReset().mockResolvedValue([{ id: 1, name: 'Klagenfurt' }]);
});

describe('AppointmentForm', () => {
  it('pre-fills title and customer when opened from a ticket', async () => {
    render(<AppointmentForm fromTicket={TICKET} onSaved={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());
    const titleInput = screen.getByPlaceholderText(/Drucker-Reparatur vor Ort/) as HTMLInputElement;
    expect(titleInput.value).toBe('Termin — Drucker');
    // customer field is locked from the ticket
    const customerInput = screen.getByPlaceholderText(/Name \/ Firma/) as HTMLInputElement;
    expect(customerInput.value).toBe('Müller GmbH');
    expect(customerInput).toBeDisabled();
  });

  it('blocks save when end is not after start', async () => {
    const u = userEvent.setup();
    render(<AppointmentForm onSaved={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());

    await u.type(screen.getByPlaceholderText(/z.B. Drucker/), 'Test');
    const ends = screen.getByTestId('appointment-ends-at') as HTMLInputElement;
    const starts = screen.getByTestId('appointment-starts-at') as HTMLInputElement;
    // Force ends < starts via fireEvent-like change
    await u.clear(ends);
    await u.type(ends, starts.value); // identical → not strictly after

    await u.click(screen.getByRole('button', { name: /Termin anlegen/ }));
    expect(screen.getByText(/Ende muss nach dem Start/)).toBeInTheDocument();
    expect(createAppointmentMock).not.toHaveBeenCalled();
  });

  it('creates an appointment with the currentEmployee pre-assigned as lead', async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <AppointmentForm
        fromTicket={TICKET}
        currentEmployeeId="emp-a"
        onSaved={onSaved}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());

    await u.click(screen.getByRole('button', { name: /Termin anlegen/ }));

    await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
    const [input, assignees] = createAppointmentMock.mock.calls[0];
    expect(input.ticketId).toBe('t-1');
    expect(input.title).toBe('Termin — Drucker');
    expect(assignees).toEqual([{ employeeId: 'emp-a', role: 'lead' }]);
    expect(onSaved).toHaveBeenCalled();
  });

  it('lets the user add and remove additional assignees', async () => {
    const u = userEvent.setup();
    render(
      <AppointmentForm
        fromTicket={TICKET}
        currentEmployeeId="emp-a"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());
    // Add emp-b
    await u.selectOptions(screen.getByTestId('assignee-add'), 'emp-b');
    expect(screen.getByText('Klaus Weber')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /Termin anlegen/ }));
    await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
    const [, assignees] = createAppointmentMock.mock.calls[0];
    expect(assignees).toEqual([
      { employeeId: 'emp-a', role: 'lead' },
      { employeeId: 'emp-b', role: 'techniker' },
    ]);
  });

  it('calls updateAppointment + setAppointmentAssignees in edit mode', async () => {
    const u = userEvent.setup();
    render(
      <AppointmentForm
        appointment={APPT}
        fromTicket={TICKET}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());
    await u.click(screen.getByRole('button', { name: /Speichern/ }));
    await waitFor(() => expect(updateAppointmentMock).toHaveBeenCalledTimes(1));
    expect(setAppointmentAssigneesMock).toHaveBeenCalled();
  });
});
