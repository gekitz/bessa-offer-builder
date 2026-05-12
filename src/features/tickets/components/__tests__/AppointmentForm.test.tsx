import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createAppointmentMock = vi.fn();
const updateAppointmentMock = vi.fn();
const setAppointmentAssigneesMock = vi.fn();
const deleteAppointmentMock = vi.fn();
const listEmployeesMock = vi.fn();
const listStandorteMock = vi.fn();

const getTicketMock = vi.fn();
vi.mock('../../api/ticketApi', () => ({
  createAppointment: (input: unknown, assignees: unknown) => createAppointmentMock(input, assignees),
  updateAppointment: (id: string, patch: unknown) => updateAppointmentMock(id, patch),
  setAppointmentAssignees: (apptId: string, assignees: unknown) => setAppointmentAssigneesMock(apptId, assignees),
  deleteAppointment: (id: string) => deleteAppointmentMock(id),
  getTicket: (id: string) => getTicketMock(id),
}));

// Stub TicketPicker as a "pick this ticket" button so tests don't need
// the full searchable modal wiring.
vi.mock('../TicketPicker', () => ({
  default: ({ onSelect }: { onSelect: (t: Record<string, unknown>) => void }) => (
    <div data-testid="ticket-picker-stub">
      <button
        type="button"
        data-testid="ticket-picker-pick"
        onClick={() =>
          onSelect({
            id: 't-pick',
            ticketNumber: '26-0000099',
            title: 'Drucker tot',
            customerName: 'Müller GmbH',
            status: 'open',
          })
        }
      >
        pick ticket
      </button>
    </div>
  ),
}));
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listStandorte: () => listStandorteMock(),
}));

// CustomerPicker is mocked as a button-trigger so we can verify the
// onSelect → form-state wiring without dragging Mesonic in.
let pickerOnSelect: ((c: Record<string, string>) => void) | null = null;
vi.mock('../../../../components/CustomerPicker', () => ({
  default: ({ onSelect }: { onSelect: (c: Record<string, string>) => void }) => {
    pickerOnSelect = onSelect;
    return (
      <div data-testid="customer-picker-stub">
        <button
          type="button"
          data-testid="customer-picker-pick"
          onClick={() =>
            onSelect({
              company: 'Acme GmbH',
              name: 'Anna Acme',
              email: 'a@acme.at',
              phone: '01234',
              address: 'Hauptplatz 1',
              mesonicId: '9911',
            })
          }
        >
          pick
        </button>
      </div>
    );
  },
}));

import AppointmentForm from '../AppointmentForm';
import type { Appointment, Ticket } from '../../types';
import type { Employee } from '../../../vacation/types';

const EMPLOYEES: Employee[] = [
  { id: 'emp-a', code: 'a', name: 'Hannes Huber', standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true },
  { id: 'emp-b', code: 'b', name: 'Klaus Weber',  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true },
];

const TICKET: Ticket = {
  id: 't-1', ticketNumber: '26-0000001', shareCode: 'sc-test-0000001', title: 'Drucker', description: null,
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
  getTicketMock.mockReset().mockResolvedValue(null);
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
    // Add emp-b via the custom Select (button trigger + portaled listbox).
    await u.click(screen.getByRole('button', { name: 'Techniker hinzufügen' }));
    await u.click(screen.getByRole('option', { name: 'Klaus Weber' }));
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

describe('AppointmentForm — standalone (no ticket)', () => {
  it('shows the "Bestandskunde" button only when no ticket is bound', async () => {
    const { rerender } = render(
      <AppointmentForm onSaved={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('appointment-customer-picker-open')).toBeInTheDocument();

    rerender(
      <AppointmentForm fromTicket={TICKET} onSaved={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('appointment-customer-picker-open')).not.toBeInTheDocument();
  });

  it('opens CustomerPicker and pre-fills the customer fields on pick', async () => {
    const u = userEvent.setup();
    render(<AppointmentForm onSaved={vi.fn()} onClose={vi.fn()} />);
    await u.click(screen.getByTestId('appointment-customer-picker-open'));
    await screen.findByTestId('customer-picker-stub');

    await u.click(screen.getByTestId('customer-picker-pick'));
    // Customer name input (Name / Firma) now carries the picked company.
    expect((screen.getByPlaceholderText(/Name \/ Firma/) as HTMLInputElement).value)
      .toBe('Acme GmbH');
    expect(screen.getByText(/Mesonic-Nr: 9911/)).toBeInTheDocument();
  });

  it('saves a standalone appointment with ticketId=null', async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    render(<AppointmentForm currentEmployeeId="emp-a" onSaved={onSaved} onClose={vi.fn()} />);
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());

    await u.type(screen.getByPlaceholderText(/z.B. Drucker/), 'Standalone-Termin');
    await u.click(screen.getByRole('button', { name: /Termin anlegen/ }));

    await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
    const [input] = createAppointmentMock.mock.calls[0];
    expect(input.ticketId).toBeNull();
    expect(input.title).toBe('Standalone-Termin');
  });
});

describe('AppointmentForm — ticket linkage (retroactive attach)', () => {
  it('shows "Mit Ticket verknüpfen" in standalone mode', () => {
    render(<AppointmentForm onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('appointment-link-ticket-open')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-ticket-link')).not.toBeInTheDocument();
  });

  it('pins the link (no unlink button) when opened with fromTicket', () => {
    render(<AppointmentForm fromTicket={TICKET} onSaved={vi.fn()} onClose={vi.fn()} />);
    // The pinned link row is shown but no "+ verknüpfen" or "unlink".
    expect(screen.getByTestId('appointment-ticket-link')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-link-ticket-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('appointment-unlink-ticket')).not.toBeInTheDocument();
  });

  it('links a ticket via the picker and sends ticketId in the create payload', async () => {
    const u = userEvent.setup();
    render(<AppointmentForm onSaved={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());

    await u.click(screen.getByTestId('appointment-link-ticket-open'));
    await u.click(screen.getByTestId('ticket-picker-pick'));

    // Link row now visible with the picked ticket's data.
    expect(screen.getByText('26-0000099')).toBeInTheDocument();
    expect(screen.getByText('Drucker tot')).toBeInTheDocument();

    await u.type(screen.getByPlaceholderText(/z.B. Drucker/), 'Vor-Ort');
    await u.click(screen.getByRole('button', { name: /Termin anlegen/ }));

    await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
    const [input] = createAppointmentMock.mock.calls[0];
    expect(input.ticketId).toBe('t-pick');
  });

  it('unlink resets ticketId to null on save', async () => {
    const u = userEvent.setup();
    // Open an edit form on an appointment that already has a ticket linked.
    getTicketMock.mockResolvedValue({
      id: APPT.ticketId,
      ticketNumber: '26-0000001',
      title: 'Drucker',
      customerName: 'Müller GmbH',
    });
    render(
      <AppointmentForm appointment={APPT} onSaved={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => expect(getTicketMock).toHaveBeenCalledWith(APPT.ticketId));

    // The link row is shown and an unlink affordance is present (no
    // fromTicket → editable linkage).
    expect(screen.getByTestId('appointment-ticket-link')).toBeInTheDocument();
    await u.click(screen.getByTestId('appointment-unlink-ticket'));

    expect(screen.queryByTestId('appointment-ticket-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('appointment-link-ticket-open')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /Speichern/ }));
    await waitFor(() => expect(updateAppointmentMock).toHaveBeenCalled());
    const [, patch] = updateAppointmentMock.mock.calls[0];
    expect(patch.ticketId).toBeNull();
  });
});
