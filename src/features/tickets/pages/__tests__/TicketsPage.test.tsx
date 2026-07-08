import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const listTicketsMock = vi.fn();
const listEmployeesMock = vi.fn();
const listAbteilungenMock = vi.fn();
const listStandorteMock = vi.fn();
const createTicketMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  listTickets: (filters: unknown) => listTicketsMock(filters),
  createTicket: (input: unknown) => createTicketMock(input),
}));
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listAbteilungen: () => listAbteilungenMock(),
  listStandorte: () => listStandorteMock(),
}));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ profile: null, user: null }),
}));
vi.mock('../../../../components/CustomerPicker', () => ({ default: () => null }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import TicketsPage from '../TicketsPage';
import type { Ticket } from '../../types';

function makeTicket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: '26-0000001', shareCode: 'sc-test-0000001',
    title: 'Drucker druckt nicht',
    description: null,
    kind: 'reparatur',
    priority: 'normal',
    status: 'open',
    poolAbteilungId: null,
    assignedTo: null,
    mesonicCustomerId: null,
    customerName: 'Müller GmbH',
    customerPhone: null,
    customerEmail: null,
    customerAddress: null,
    customerHasWartungsvertrag: false,
    standortId: null,
    billable: true,
    closedAt: null,
    closedBy: null,
    resolutionNote: null,
    offerId: null,
    mesonicBelegId: null,
    createdBy: null,
    createdAt: '2026-05-11T08:00:00Z',
    updatedAt: '2026-05-11T08:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  navigateMock.mockReset();
  listTicketsMock.mockReset().mockResolvedValue([
    makeTicket({ id: 't-1', ticketNumber: '26-0000001', shareCode: 'sc-test-0000001', title: 'Drucker' }),
    makeTicket({ id: 't-2', ticketNumber: '26-0000002', shareCode: 'sc-test-0000002', title: 'Server-Update', status: 'in_progress' }),
  ]);
  listEmployeesMock.mockReset().mockResolvedValue([]);
  listAbteilungenMock.mockReset().mockResolvedValue([]);
  listStandorteMock.mockReset().mockResolvedValue([]);
  createTicketMock.mockReset().mockResolvedValue(makeTicket({ id: 't-new', ticketNumber: '26-0000003' }));
});

function renderAt(initialPath = '/tickets') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TicketsPage />
    </MemoryRouter>,
  );
}

describe('TicketsPage', () => {
  it('renders tickets returned by listTickets', async () => {
    renderAt();
    expect(await screen.findByText('Drucker')).toBeInTheDocument();
    // Status tab defaults to "Offen" → filter status=['open']
    const filterUsed = listTicketsMock.mock.calls[0][0];
    expect(filterUsed.status).toEqual(['open']);
  });

  it('filters by the freetext search field', async () => {
    const u = userEvent.setup();
    renderAt();
    await screen.findByText('Drucker');
    // Make sure the in_progress ticket is rendered too (status=open + ticket statuses come from server mock)
    expect(screen.queryAllByTestId('ticket-row')).toHaveLength(2);

    await u.type(screen.getByPlaceholderText(/Ticket-Nr, Titel oder Kunde/), 'Server');
    await waitFor(() => expect(screen.queryAllByTestId('ticket-row')).toHaveLength(1));
    expect(screen.getByText('Server-Update')).toBeInTheDocument();
  });

  it('switches to board view and shows columns', async () => {
    const u = userEvent.setup();
    renderAt();
    await screen.findByText('Drucker');
    await u.click(screen.getByTestId('view-toggle-board'));
    await waitFor(() => expect(screen.getByTestId('ticket-board')).toBeInTheDocument());
    expect(screen.getByTestId('board-column-open')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-in_progress')).toBeInTheDocument();
  });

  it('persists view preference to localStorage', async () => {
    const u = userEvent.setup();
    renderAt();
    await screen.findByText('Drucker');
    await u.click(screen.getByTestId('view-toggle-board'));
    expect(window.localStorage.getItem('kitz.tickets.view')).toBe('board');
  });

  it('navigates to /tickets/<id> when a row is clicked', async () => {
    const u = userEvent.setup();
    renderAt();
    await screen.findByText('Drucker');
    await u.click(screen.getAllByTestId('ticket-row')[0]);
    expect(navigateMock).toHaveBeenCalledWith('/tickets/t-1');
  });

  it('pre-fills the form when navigated with state.initialCustomer (CRM → Ticket flow)', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/tickets',
            state: {
              initialCustomer: {
                company: 'Müller GmbH',
                name: 'Hans Müller',
                email: 'h@m.at',
                phone: '01234',
                address: 'Musterweg 1, 9020 Klagenfurt',
                mesonicId: '4711',
              },
            },
          },
        ]}
      >
        <TicketsPage />
      </MemoryRouter>,
    );
    // TicketForm modal opens automatically; the customer name field is
    // pre-filled with the company from CRM.
    await screen.findByText('Neues Ticket', { selector: 'h2' });
    expect((screen.getByPlaceholderText(/Name \/ Firma/) as HTMLInputElement).value)
      .toBe('Müller GmbH');
  });

  it('filters tickets by the pool pill', async () => {
    const u = userEvent.setup();
    listAbteilungenMock.mockResolvedValue([
      { id: 2, name: 'IT' },
      { id: 1, name: 'Kassen' },
    ]);
    listTicketsMock.mockResolvedValue([
      makeTicket({ id: 't-1', ticketNumber: '26-0000001', shareCode: 's1', title: 'Drucker', poolAbteilungId: 2 }),
      makeTicket({ id: 't-2', ticketNumber: '26-0000002', shareCode: 's2', title: 'Kassa-Ticket', poolAbteilungId: 1 }),
    ]);
    renderAt();
    await screen.findByText('Drucker');
    expect(screen.queryAllByTestId('ticket-row')).toHaveLength(2);

    // Pool pills render with counts; picking IT narrows the list.
    await u.click(screen.getByRole('button', { name: /IT/ }));
    await waitFor(() => expect(screen.queryAllByTestId('ticket-row')).toHaveLength(1));
    expect(screen.getByText('Drucker')).toBeInTheDocument();
    expect(screen.queryByText('Kassa-Ticket')).not.toBeInTheDocument();
  });

  it('groups the board into per-pool swimlanes', async () => {
    const u = userEvent.setup();
    listAbteilungenMock.mockResolvedValue([
      { id: 2, name: 'IT' },
      { id: 1, name: 'Kassen' },
    ]);
    listTicketsMock.mockResolvedValue([
      makeTicket({ id: 't-1', ticketNumber: '26-0000001', shareCode: 's1', title: 'Drucker', poolAbteilungId: 2 }),
      makeTicket({ id: 't-2', ticketNumber: '26-0000002', shareCode: 's2', title: 'Kassa-Ticket', poolAbteilungId: 1 }),
    ]);
    renderAt();
    await screen.findByText('Drucker');
    await u.click(screen.getByTestId('view-toggle-board'));
    await waitFor(() => expect(screen.getByTestId('ticket-board')).toBeInTheDocument());
    // One lane per non-empty pool; the empty 'Ohne Zuordnung' lane is omitted.
    expect(screen.getByTestId('board-lane-2')).toBeInTheDocument();
    expect(screen.getByTestId('board-lane-1')).toBeInTheDocument();
    expect(screen.queryByTestId('board-lane-none')).not.toBeInTheDocument();
  });

  it('navigates to /tickets/<id> after creating a ticket', async () => {
    const u = userEvent.setup();
    renderAt();
    await screen.findByText('Drucker');
    await u.click(screen.getByRole('button', { name: /Neues Ticket/ }));
    await screen.findByText('Neues Ticket', { selector: 'h2' });
    await u.type(screen.getByPlaceholderText(/Drucker druckt nicht mehr/), 'Brandneu');
    await u.click(screen.getByRole('button', { name: /Ticket erstellen/ }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/tickets/t-new'));
  });
});
