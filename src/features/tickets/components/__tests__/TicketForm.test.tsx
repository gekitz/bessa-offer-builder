import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createTicketMock = vi.fn();
const updateTicketMock = vi.fn();
const listAbteilungenMock = vi.fn();
const listStandorteMock = vi.fn();
const listEmployeesMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  createTicket: (input: unknown) => createTicketMock(input),
  updateTicket: (id: string, patch: unknown) => updateTicketMock(id, patch),
}));

vi.mock('../../../vacation/api/vacationApi', () => ({
  listAbteilungen: () => listAbteilungenMock(),
  listStandorte: () => listStandorteMock(),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
}));

// CustomerPicker is its own modal with its own data fetching — stub it
// so we don't pull Mesonic into the form's tests.
vi.mock('../../../../components/CustomerPicker', () => ({
  default: () => null,
}));

import TicketForm from '../TicketForm';
import type { Ticket } from '../../types';

const TICKET: Ticket = {
  id: 't-1',
  ticketNumber: '26-0000001', shareCode: 'sc-test-0000001',
  title: 'Drucker druckt nicht',
  description: 'Toner-Fehler',
  kind: 'reparatur',
  priority: 'high',
  status: 'open',
  poolAbteilungId: 5,
  assignedTo: 'emp-a',
  mesonicCustomerId: '4711',
  customerName: 'Müller GmbH',
  customerPhone: '01234',
  customerEmail: 'info@m.at',
  customerAddress: 'Musterweg 1',
  customerHasWartungsvertrag: true,
  standortId: 1,
  billable: true,
  closedAt: null,
  closedBy: null,
  resolutionNote: null,
  offerId: null,
  mesonicBelegId: null,
  createdBy: null,
  createdAt: '2026-05-11T08:00:00Z',
  updatedAt: '2026-05-11T08:00:00Z',
};

beforeEach(() => {
  createTicketMock.mockReset().mockResolvedValue({ ...TICKET, id: 't-new', title: 'Neu' });
  updateTicketMock.mockReset().mockResolvedValue(TICKET);
  listAbteilungenMock.mockReset().mockResolvedValue([{ id: 5, name: 'MFP' }, { id: 2, name: 'IT' }]);
  listStandorteMock.mockReset().mockResolvedValue([{ id: 1, name: 'Klagenfurt' }]);
  listEmployeesMock.mockReset().mockResolvedValue([
    { id: 'emp-a', code: 'a', name: 'Hannes Huber', standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true },
  ]);
});

describe('TicketForm', () => {
  it('shows the "create" header when no ticket is passed', async () => {
    render(<TicketForm onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('Neues Ticket')).toBeInTheDocument();
  });

  it('disables submit while title is empty', async () => {
    render(<TicketForm onSaved={vi.fn()} onClose={vi.fn()} />);
    const submitBtn = await screen.findByRole('button', { name: /Ticket erstellen/ });
    expect(submitBtn).toBeDisabled();
  });

  it('calls createTicket with the trimmed payload', async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    render(<TicketForm onSaved={onSaved} onClose={vi.fn()} currentEmployeeId="emp-a" />);

    await waitFor(() => expect(listAbteilungenMock).toHaveBeenCalled());

    await u.type(screen.getByPlaceholderText(/Drucker druckt nicht mehr/), '  Neues Ticket  ');
    await u.click(screen.getByRole('button', { name: /Ticket erstellen/ }));

    await waitFor(() => expect(createTicketMock).toHaveBeenCalledTimes(1));
    const payload = createTicketMock.mock.calls[0][0];
    expect(payload.title).toBe('Neues Ticket');           // trimmed
    expect(payload.kind).toBe('support');                  // default
    expect(payload.priority).toBe('normal');               // default
    expect(payload.billable).toBe(true);                   // default
    expect(payload.assignedTo).toBe('emp-a');              // pre-filled from currentEmployeeId
    expect(payload.createdBy).toBe('emp-a');
    expect(onSaved).toHaveBeenCalled();
  });

  it('pre-fills the edit form from an existing ticket', async () => {
    render(<TicketForm ticket={TICKET} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/Ticket bearbeiten — 26-0000001/)).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/Drucker druckt nicht mehr/) as HTMLInputElement).value).toBe(
      'Drucker druckt nicht',
    );
    expect((screen.getByPlaceholderText(/Name \/ Firma/) as HTMLInputElement).value).toBe('Müller GmbH');
  });

  it('calls updateTicket in edit mode and forwards customer-wartungsvertrag flag', async () => {
    const u = userEvent.setup();
    render(<TicketForm ticket={TICKET} onSaved={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(listAbteilungenMock).toHaveBeenCalled());

    await u.click(screen.getByRole('button', { name: /^Speichern$/ }));

    await waitFor(() => expect(updateTicketMock).toHaveBeenCalledTimes(1));
    const [id, patch] = updateTicketMock.mock.calls[0];
    expect(id).toBe('t-1');
    expect(patch.customerHasWartungsvertrag).toBe(true);
  });
});
