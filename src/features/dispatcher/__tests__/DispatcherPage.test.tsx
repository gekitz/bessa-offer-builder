// Integration tests for the dispatcher view.
//
// Covers the data flow the dispatcher uses on a live call:
//   - search input debounces and calls Mesonic
//   - picking a customer fetches that customer's open tickets
//   - "Slots finden" fans out the parallel queries and renders slot pills
//
// Booking + conflict check are covered in the next PR (PR c). The slot
// pills here are clickable but the handler is a no-op.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const searchCustomersMock = vi.fn();
const listTicketsMock = vi.fn();
const createAppointmentMock = vi.fn();
const listAppointmentsMock = vi.fn();
const listLeaveRequestsMock = vi.fn();
const listShiftsMock = vi.fn();
const listSlotKindsMock = vi.fn();
const listBankHolidaysMock = vi.fn();
const listEmployeesMock = vi.fn();

vi.mock('../../../lib/mesonicApi', () => ({
  searchCustomers: (q: string) => searchCustomersMock(q),
}));

vi.mock('../../tickets/api/ticketApi', () => ({
  listTickets: (filter: unknown) => listTicketsMock(filter),
  createAppointment: (input: unknown, assignees: unknown) =>
    createAppointmentMock(input, assignees),
}));

vi.mock('../../calendar/api/calendarApi', () => ({
  listAppointments: (r: unknown) => listAppointmentsMock(r),
  listLeaveRequests: (f: unknown) => listLeaveRequestsMock(f),
  listShifts: (f: unknown) => listShiftsMock(f),
  listSlotKinds: () => listSlotKindsMock(),
  listBankHolidays: (y: number) => listBankHolidaysMock(y),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
}));

// TicketForm pulls in its own data (abteilungen / standorte) and a
// customer picker. Stub it to a minimal harness that exposes the
// initialCustomer and an inline "Speichern" button so we can assert
// the new-ticket flow without dragging the entire form into scope.
vi.mock('../../tickets/components/TicketForm', () => ({
  default: ({
    initialCustomer,
    onSaved,
  }: {
    initialCustomer?: { company?: string | null };
    onSaved: (t: unknown) => void;
  }) => (
    <div data-testid="ticket-form-stub">
      <div data-testid="ticket-form-customer">{initialCustomer?.company ?? ''}</div>
      <button
        type="button"
        onClick={() =>
          onSaved({
            id: 't-new',
            ticketNumber: '26-9999999',
            shareCode: 'sc',
            title: 'Frisch erstellt',
            description: null,
            kind: 'reparatur',
            priority: 'normal',
            status: 'open',
            poolAbteilungId: null,
            assignedTo: null,
            mesonicCustomerId: '4711',
            customerName: 'Test Bäckerei GmbH',
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
            createdAt: '2026-05-13T09:00:00Z',
            updatedAt: '2026-05-13T09:00:00Z',
          })
        }
        data-testid="ticket-form-save"
      >
        Speichern
      </button>
    </div>
  ),
}));

import DispatcherPage from '../pages/DispatcherPage';

const EMPLOYEES = [
  {
    id: 'emp-a',
    code: 'A',
    name: 'Anna Aigner',
    standortId: 1,
    weeklyHours: 40,
    employmentType: 'fulltime',
    active: true,
    tags: ['techniker'],
  },
  {
    id: 'emp-b',
    code: 'B',
    name: 'Bert Berger',
    standortId: 1,
    weeklyHours: 40,
    employmentType: 'fulltime',
    active: true,
    tags: ['verkauf'],
  },
];

const MESONIC_RECORD = {
  Name: 'Test Bäckerei GmbH',
  Telefon: '04638 1234',
  Email: 'info@testbaeck.at',
  Kontonummer: '4711',
  Ansprechpartner: 'Frau Müller',
  Ort: 'Klagenfurt',
  Strasse: 'Hauptstr. 1',
  Postleitzahl: '9020',
};

const OPEN_TICKET = {
  id: 't-1',
  ticketNumber: '26-0000042',
  shareCode: 'abc',
  title: 'Kassa friert ein',
  description: null,
  kind: 'reparatur',
  priority: 'high',
  status: 'open',
  poolAbteilungId: null,
  assignedTo: null,
  mesonicCustomerId: '4711',
  customerName: 'Test Bäckerei GmbH',
  customerPhone: '04638 1234',
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
  createdAt: '2026-05-12T08:00:00Z',
  updatedAt: '2026-05-12T08:00:00Z',
};

beforeEach(() => {
  // Mock only `Date` so the availability engine's `new Date()` is
  // deterministic, while setTimeout (used by the debounce + RTL's
  // waitFor polling) keeps working with real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  // 2026-05-13 (Wed) 07:00 local — well before business hours so the
  // entire 08–17 window is reachable for slot bucketing.
  vi.setSystemTime(new Date(2026, 4, 13, 7, 0));

  searchCustomersMock.mockReset().mockResolvedValue({ records: [MESONIC_RECORD] });
  listTicketsMock.mockReset().mockResolvedValue([OPEN_TICKET]);
  createAppointmentMock.mockReset().mockResolvedValue({
    id: 'a-new',
    ticketId: null,
    mesonicCustomerId: '4711',
    customerName: null,
    title: 'Termin',
    description: null,
    kind: 'reparatur',
    startsAt: '2026-05-13T06:00:00Z',
    endsAt: '2026-05-13T07:00:00Z',
    allDay: false,
    location: null,
    status: 'geplant',
    standortId: null,
    notes: null,
    createdBy: null,
    createdAt: '2026-05-13T07:00:00Z',
    updatedAt: '2026-05-13T07:00:00Z',
    assignees: [],
  });
  listAppointmentsMock.mockReset().mockResolvedValue([]);
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
  listShiftsMock.mockReset().mockResolvedValue([]);
  listSlotKindsMock.mockReset().mockResolvedValue([
    { id: 1, code: 'fri_pm', label: 'Fr Nachmittag', startTime: '13:00', endTime: '18:00' },
    { id: 2, code: 'sat', label: 'Sa', startTime: '09:00', endTime: '12:00' },
    { id: 3, code: 'sun', label: 'So', startTime: '09:00', endTime: '12:00' },
    { id: 4, code: 'holiday', label: 'Feiertag', startTime: '09:00', endTime: '12:00' },
  ]);
  listBankHolidaysMock.mockReset().mockResolvedValue([]);
  listEmployeesMock.mockReset().mockResolvedValue(EMPLOYEES);
});

describe('DispatcherPage', () => {
  it('renders the empty state until a customer is picked', () => {
    render(<DispatcherPage />);
    expect(screen.getByText('Kunden auswählen')).toBeInTheDocument();
  });

  it('debounces input and calls searchCustomers with the typed query', async () => {
    render(<DispatcherPage />);

    const input = screen.getByTestId('dispatcher-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '04638' } });
    // Below debounce: no call yet.
    expect(searchCustomersMock).not.toHaveBeenCalled();

    await waitFor(() => expect(searchCustomersMock).toHaveBeenCalledWith('04638'), { timeout: 1500 });
  });

  it('fetches open tickets for the picked customer using mesonicCustomerId', async () => {
    render(<DispatcherPage />);

    const input = screen.getByTestId('dispatcher-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bäck' } });

    const card = await screen.findByTestId('dispatcher-search-result', {}, { timeout: 1500 });
    fireEvent.click(card);

    await waitFor(() => {
      expect(listTicketsMock).toHaveBeenCalledWith({
        mesonicCustomerId: '4711',
        status: ['open', 'in_progress', 'waiting'],
      });
    });
    expect(await screen.findByText('Kassa friert ein')).toBeInTheDocument();
  });

  it('clicking "Slots finden" fires the 6 parallel queries and renders slot pills grouped by employee', async () => {
    render(<DispatcherPage />);

    fireEvent.click(screen.getByTestId('dispatcher-find-slots'));

    await waitFor(() => {
      expect(listAppointmentsMock).toHaveBeenCalledTimes(1);
      expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1);
      expect(listShiftsMock).toHaveBeenCalledTimes(1);
      expect(listSlotKindsMock).toHaveBeenCalledTimes(1);
      expect(listBankHolidaysMock).toHaveBeenCalledTimes(1);
      // listEmployees fires twice: once by the panel for the name lookup,
      // once by the availability hook to filter to active employees.
      expect(listEmployeesMock).toHaveBeenCalled();
    });

    // Two employees → two grouped sections. With daysAhead=7 starting on
    // Wed 2026-05-13, the lookup spans Wed–Tue: 5 weekdays + 2 weekend
    // days. Weekends have no shifts in this fixture, so each employee
    // contributes 6 (cap) × 5 = 30 slots. Total = 60 pills.
    const groups = await screen.findAllByTestId('dispatcher-slot-employee');
    expect(groups).toHaveLength(2);
    const pills = await screen.findAllByTestId('dispatcher-slot-pill');
    expect(pills.length).toBe(60);
  });

  it('hides employees who are fully on approved leave for the lookup window', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'l-1',
        employeeId: 'emp-a',
        leaveTypeCode: 'urlaub',
        startDate: '2026-05-13',
        endDate: '2026-05-19',
        status: 'approved',
      },
    ]);
    render(<DispatcherPage />);

    fireEvent.click(screen.getByTestId('dispatcher-find-slots'));

    const groups = await screen.findAllByTestId('dispatcher-slot-employee');
    expect(groups).toHaveLength(1);
    expect(screen.getAllByText('Bert Berger').length).toBeGreaterThan(0);
    expect(screen.queryByText('Anna Aigner')).not.toBeInTheDocument();
  });

  it('selecting a different slot duration persists to localStorage', async () => {
    render(<DispatcherPage />);
    // Wait for the panel's initial listEmployees() to settle so the
    // following synchronous assertions don't race with React's commit.
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('dispatcher-duration-30'));
    expect(window.localStorage.getItem('dispatcher.slotMinutes')).toBe('30');

    fireEvent.click(screen.getByTestId('dispatcher-duration-120'));
    expect(window.localStorage.getItem('dispatcher.slotMinutes')).toBe('120');
  });

  it('clicking a slot pill opens the quick-book modal pre-filled with technician and time', async () => {
    render(<DispatcherPage />);
    fireEvent.click(screen.getByTestId('dispatcher-find-slots'));
    const pills = await screen.findAllByTestId('dispatcher-slot-pill');

    fireEvent.click(pills[0]);

    const modal = await screen.findByTestId('dispatcher-quickbook-modal');
    // The first slot belongs to emp-a → Anna Aigner. Scope to the
    // modal because the name also appears in the slot group header.
    expect(modal).toHaveTextContent('Anna Aigner');
    expect(screen.getByTestId('dispatcher-quickbook-when')).toBeInTheDocument();
  });

  it('submitting the quick-book modal calls createAppointment with the slot times and assignee', async () => {
    render(<DispatcherPage />);
    fireEvent.click(screen.getByTestId('dispatcher-find-slots'));
    const pills = await screen.findAllByTestId('dispatcher-slot-pill');
    fireEvent.click(pills[0]);
    await screen.findByTestId('dispatcher-quickbook-modal');

    fireEvent.click(screen.getByTestId('dispatcher-quickbook-submit'));

    await waitFor(() => {
      expect(createAppointmentMock).toHaveBeenCalledTimes(1);
    });
    const [, assignees] = createAppointmentMock.mock.calls[0];
    expect(assignees).toEqual([{ employeeId: 'emp-a', role: 'lead' }]);
  });

  it('refetches availability after a successful booking', async () => {
    render(<DispatcherPage />);
    fireEvent.click(screen.getByTestId('dispatcher-find-slots'));
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalledTimes(1));
    const pills = await screen.findAllByTestId('dispatcher-slot-pill');
    fireEvent.click(pills[0]);
    await screen.findByTestId('dispatcher-quickbook-modal');

    fireEvent.click(screen.getByTestId('dispatcher-quickbook-submit'));

    await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalledTimes(2));
  });

  it('filters slot search to employees matching the selected tag', async () => {
    render(<DispatcherPage />);
    // First fire the initial search so hasRun=true → tag clicks re-fire.
    fireEvent.click(screen.getByTestId('dispatcher-find-slots'));
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalledTimes(1));
    // Both employees surfaced under "Alle".
    expect((await screen.findAllByTestId('dispatcher-slot-employee')).length).toBe(2);

    fireEvent.click(await screen.findByTestId('dispatcher-tag-techniker'));

    // Hook is re-invoked with only emp-a's id.
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalledTimes(2));
    await waitFor(async () => {
      expect((await screen.findAllByTestId('dispatcher-slot-employee')).length).toBe(1);
    });
    expect(screen.queryByText('Bert Berger')).not.toBeInTheDocument();
  });

  it('+7 Tage immediately re-runs the search with an extended window', async () => {
    render(<DispatcherPage />);
    fireEvent.click(screen.getByTestId('dispatcher-find-slots'));
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByTestId('dispatcher-extend-days'));

    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalledTimes(2));
    // The second call's date range covers 14 days (vs. 7 the first time).
    const [firstCall, secondCall] = listAppointmentsMock.mock.calls;
    const firstDays = (new Date(firstCall[0].to).getTime() - new Date(firstCall[0].from).getTime()) / (24 * 3600 * 1000);
    const secondDays = (new Date(secondCall[0].to).getTime() - new Date(secondCall[0].from).getTime()) / (24 * 3600 * 1000);
    expect(secondDays).toBeGreaterThan(firstDays);
  });

  it('opens the new-ticket form prefilled with the customer when clicking Neues Ticket', async () => {
    render(<DispatcherPage />);

    // Pick a customer first.
    fireEvent.change(screen.getByTestId('dispatcher-search-input'), { target: { value: 'Bäck' } });
    const card = await screen.findByTestId('dispatcher-search-result', {}, { timeout: 1500 });
    fireEvent.click(card);
    await screen.findByText('Kassa friert ein');

    fireEvent.click(screen.getByTestId('dispatcher-new-ticket'));

    expect(await screen.findByTestId('ticket-form-stub')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-form-customer')).toHaveTextContent('Test Bäckerei GmbH');

    // Save → form closes and the new ticket becomes the selected one.
    fireEvent.click(screen.getByTestId('ticket-form-save'));
    await waitFor(() => expect(screen.queryByTestId('ticket-form-stub')).not.toBeInTheDocument());
  });
});

// QuickBookConfirm has its own focused tests for the conflict path —
// faking a slot that overlaps an appointment is easier in isolation
// than reaching through the full dispatcher flow (where findFreeSlots
// guarantees the surfaced slots can't conflict with the data they were
// computed from).
describe('QuickBookConfirm (conflict path)', () => {
  beforeEach(() => {
    createAppointmentMock.mockReset().mockResolvedValue({ id: 'ok' });
  });

  it('shows a conflict banner and disables submit when the slot overlaps an existing appointment', async () => {
    const { default: QuickBookConfirm } = await import('../components/QuickBookConfirm');
    const slot = {
      employeeId: 'emp-a',
      date: '2026-05-13',
      startsAt: new Date(2026, 4, 13, 10, 0).toISOString(),
      endsAt: new Date(2026, 4, 13, 11, 0).toISOString(),
    };
    const conflictingAppt = {
      id: 'a-x',
      ticketId: null,
      mesonicCustomerId: null,
      customerName: null,
      title: 'Bestehender Termin',
      description: null,
      kind: 'reparatur' as const,
      startsAt: new Date(2026, 4, 13, 10, 30).toISOString(),
      endsAt: new Date(2026, 4, 13, 11, 30).toISOString(),
      allDay: false,
      location: null,
      status: 'geplant' as const,
      standortId: null,
      notes: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      assignees: [{ id: 'aa', appointmentId: 'a-x', employeeId: 'emp-a', role: 'lead' as const, createdAt: '' }],
    };

    const onSaved = vi.fn();
    render(
      <QuickBookConfirm
        slot={slot}
        employeeName="Anna Aigner"
        customer={null}
        ticket={null}
        appointments={[conflictingAppt]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('dispatcher-quickbook-conflict')).toBeInTheDocument();
    const submit = screen.getByTestId('dispatcher-quickbook-submit') as HTMLButtonElement;
    expect(submit).toBeDisabled();

    // Override → submit enabled → createAppointment runs.
    fireEvent.click(screen.getByTestId('dispatcher-quickbook-override'));
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
  });
});
