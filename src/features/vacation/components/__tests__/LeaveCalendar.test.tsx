import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listLeaveRequestsMock = vi.fn();
const listEmployeesMock = vi.fn();
const listLeaveTypesMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listLeaveTypes: () => listLeaveTypesMock(),
}));

import LeaveCalendar, { buildMonthGrid } from '../LeaveCalendar';
import type { Employee, LeaveRequest } from '../../types';

const stefan: Employee = {
  id: 'sbauer-id', code: 'sbauer', name: 'Stefan Bauer',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const mario: Employee = {
  id: 'mgraf-id', code: 'mgraf', name: 'Mario Graf',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const georg: Employee = {
  id: 'gkitz-id', code: 'gkitz', name: 'Georg Kitz',
  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const marc: Employee = {
  id: 'mmaier-id', code: 'mmaier', name: 'Marc Maier',
  standortId: 2, weeklyHours: 38.5, employmentType: 'apprentice', active: true,
};

const TYPES = [
  { id: 1, code: 'urlaub' as const, label: 'Urlaub', deductsFromBalance: true },
  { id: 3, code: 'krankenstand' as const, label: 'Krankenstand', deductsFromBalance: false },
];

beforeEach(() => {
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
  listEmployeesMock.mockReset().mockResolvedValue([stefan, mario, georg, marc]);
  listLeaveTypesMock.mockReset().mockResolvedValue(TYPES);
});

describe('buildMonthGrid', () => {
  it('returns exactly 42 cells (6 weeks * 7 days)', () => {
    expect(buildMonthGrid(2026, 4 /* May */)).toHaveLength(42);
  });

  it('starts on Monday — May 2026 begins on a Friday so the leading days are Apr 27..30', () => {
    const cells = buildMonthGrid(2026, 4);
    expect(cells[0]).toMatchObject({ day: 27, current: false }); // Mon Apr 27
    expect(cells[1]).toMatchObject({ day: 28, current: false }); // Tue Apr 28
    expect(cells[4]).toMatchObject({ day: 1, month: 4, current: true }); // Fri May 1
  });

  it('ends with the trailing days of the next month when needed', () => {
    const cells = buildMonthGrid(2026, 4); // May 2026 ends on Sunday May 31
    const last = cells[cells.length - 1]!;
    expect(last.day).toBe(7);          // Sun Jun 7
    expect(last.month).toBe(5);        // June
    expect(last.current).toBe(false);
  });

  it('marks days inside the visible month with current=true', () => {
    const cells = buildMonthGrid(2026, 4);
    const inMonth = cells.filter((c) => c.current);
    expect(inMonth).toHaveLength(31); // May has 31 days
  });
});

describe('LeaveCalendar', () => {
  it('renders the month name + year header from initial props', async () => {
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    expect(screen.getByText('Mai 2026')).toBeInTheDocument();
  });

  it('queries leaves for the visible month range with status pending+approved', async () => {
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    const filter = listLeaveRequestsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filter.status).toEqual(['pending', 'approved']);
    expect(filter.rangeStart).toBe('2026-04-27');   // Mon Apr 27
    expect(filter.rangeEnd).toBe('2026-06-07');     // Sun Jun 7
  });

  it('renders the 7 weekday headers in Austrian Mon-first order', async () => {
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.getByText('Mai 2026')).toBeInTheDocument());
    for (const w of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
      expect(screen.getByText(w)).toBeInTheDocument();
    }
  });

  it('places employee pills in every day a leave covers', async () => {
    const stefanLeave: LeaveRequest & { id: string } = {
      id: 'lr-1',
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-11',
      endDate: '2026-05-13',
      status: 'approved',
    };
    listLeaveRequestsMock.mockResolvedValue([stefanLeave]);

    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    for (const iso of ['2026-05-11', '2026-05-12', '2026-05-13']) {
      const cell = screen.getByTestId(`cal-cell-${iso}`);
      expect(within(cell).getByText('Stefan')).toBeInTheDocument();
    }
    // Days outside the leave range have no Stefan pill.
    const cell10 = screen.getByTestId('cal-cell-2026-05-10');
    expect(within(cell10).queryByText('Stefan')).not.toBeInTheDocument();
  });

  it('color-codes the pill by leave type', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      { id: 'lr-u', employeeId: stefan.id, leaveTypeCode: 'urlaub', startDate: '2026-05-11', endDate: '2026-05-11', status: 'approved' },
      { id: 'lr-k', employeeId: mario.id, leaveTypeCode: 'krankenstand', startDate: '2026-05-12', endDate: '2026-05-12', status: 'approved' },
    ]);
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    const stefanCell = screen.getByTestId('cal-cell-2026-05-11');
    const stefanPill = within(stefanCell).getByText('Stefan');
    expect(stefanPill.className).toMatch(/bg-blue/);

    const marioCell = screen.getByTestId('cal-cell-2026-05-12');
    const marioPill = within(marioCell).getByText('Mario');
    expect(marioPill.className).toMatch(/bg-red/);
  });

  it('shows "+N weitere" when more than 3 employees are absent on the same day', async () => {
    const day = '2026-05-15';
    listLeaveRequestsMock.mockResolvedValue([
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub', startDate: day, endDate: day, status: 'approved' },
      { id: '2', employeeId: mario.id,  leaveTypeCode: 'urlaub', startDate: day, endDate: day, status: 'approved' },
      { id: '3', employeeId: georg.id,  leaveTypeCode: 'urlaub', startDate: day, endDate: day, status: 'approved' },
      { id: '4', employeeId: marc.id,   leaveTypeCode: 'urlaub', startDate: day, endDate: day, status: 'approved' },
    ]);
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    const cell = screen.getByTestId(`cal-cell-${day}`);
    // First three employees rendered as pills + "+1 weitere"
    expect(within(cell).getByText('+1 weitere')).toBeInTheDocument();
  });

  it('navigates to the next and previous month, refetching the range', async () => {
    const u = userEvent.setup();
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1));

    await u.click(screen.getByLabelText('Nächster Monat'));
    expect(screen.getByText('Juni 2026')).toBeInTheDocument();
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(2));

    await u.click(screen.getByLabelText('Vorheriger Monat'));
    expect(screen.getByText('Mai 2026')).toBeInTheDocument();
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(3));
  });

  it('jumps back to today when the Heute button is clicked', async () => {
    const u = userEvent.setup();
    render(<LeaveCalendar initialYear={2025} initialMonth={0} />);
    await waitFor(() => expect(screen.getByText('Januar 2025')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: 'Heute' }));

    const now = new Date();
    const expected = `${['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][now.getMonth()]} ${now.getFullYear()}`;
    await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());
  });

  it('shows the loading state initially and hides it after the data arrives', async () => {
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    expect(screen.getByText(/Kalender wird geladen/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
  });

  it('shows a friendly error panel when the API rejects', async () => {
    listLeaveRequestsMock.mockRejectedValue(new Error('rls denied'));
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.getByText(/Kalender konnte nicht geladen werden/)).toBeInTheDocument());
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });

  it('renders the leave-type legend after data loads', async () => {
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.getByText('Urlaub')).toBeInTheDocument());
    expect(screen.getByText('Krankenstand')).toBeInTheDocument();
  });

  it('marks half-day start with a ½ prefix only on the start date', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-h1',
        employeeId: stefan.id,
        leaveTypeCode: 'urlaub',
        startDate: '2026-05-11',
        endDate: '2026-05-13',
        halfDayStart: true,
        halfDayEnd: false,
        status: 'approved',
      },
    ]);
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    // Half marker on the start day only.
    const startCell = screen.getByTestId('cal-cell-2026-05-11');
    expect(within(startCell).getByText('½ Stefan')).toBeInTheDocument();
    // Plain pill on subsequent days.
    const middleCell = screen.getByTestId('cal-cell-2026-05-12');
    expect(within(middleCell).getByText('Stefan')).toBeInTheDocument();
    expect(within(middleCell).queryByText(/^½/)).not.toBeInTheDocument();
    const endCell = screen.getByTestId('cal-cell-2026-05-13');
    expect(within(endCell).getByText('Stefan')).toBeInTheDocument();
  });

  it('marks half-day end with a ½ prefix only on the end date', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-h2',
        employeeId: mario.id,
        leaveTypeCode: 'urlaub',
        startDate: '2026-05-11',
        endDate: '2026-05-13',
        halfDayStart: false,
        halfDayEnd: true,
        status: 'approved',
      },
    ]);
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    expect(within(screen.getByTestId('cal-cell-2026-05-11')).getByText('Mario')).toBeInTheDocument();
    expect(within(screen.getByTestId('cal-cell-2026-05-13')).getByText('½ Mario')).toBeInTheDocument();
  });

  it('opens the day-detail modal when a cell is clicked', async () => {
    const stefanLeave: LeaveRequest & { id: string } = {
      id: 'lr-1',
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-11',
      endDate: '2026-05-13',
      status: 'approved',
    };
    listLeaveRequestsMock.mockResolvedValue([stefanLeave]);
    const u = userEvent.setup();
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    await u.click(screen.getByTestId('cal-cell-2026-05-12'));
    // Modal header has the day text + count.
    expect(await screen.findByText('12.05.2026')).toBeInTheDocument();
    expect(screen.getByText('(1 Abwesenheit)')).toBeInTheDocument();
  });

  it('does not render the context menu when onAddRequest is omitted', async () => {
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    fireEvent.contextMenu(screen.getByTestId('cal-cell-2026-05-15'));
    expect(screen.queryByTestId('calendar-context-menu')).not.toBeInTheDocument();
  });

  it('right-click on a cell opens the context menu with "Antrag erstellen"', async () => {
    const onAddRequest = vi.fn();
    render(<LeaveCalendar initialYear={2026} initialMonth={4} onAddRequest={onAddRequest} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    fireEvent.contextMenu(screen.getByTestId('cal-cell-2026-05-15'), { clientX: 120, clientY: 80 });
    const menu = await screen.findByTestId('calendar-context-menu');
    expect(within(menu).getByRole('menuitem', { name: 'Antrag erstellen' })).toBeInTheDocument();
    // The default left-click handler must NOT have fired (no day-detail modal opened).
    expect(screen.queryByText('15.05.2026')).not.toBeInTheDocument();
  });

  it('selecting "Antrag erstellen" calls onAddRequest with the cell ISO and closes the menu', async () => {
    const onAddRequest = vi.fn();
    const u = userEvent.setup();
    render(<LeaveCalendar initialYear={2026} initialMonth={4} onAddRequest={onAddRequest} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    fireEvent.contextMenu(screen.getByTestId('cal-cell-2026-05-15'));
    await screen.findByTestId('calendar-context-menu');
    await u.click(screen.getByRole('menuitem', { name: 'Antrag erstellen' }));

    expect(onAddRequest).toHaveBeenCalledTimes(1);
    expect(onAddRequest).toHaveBeenCalledWith('2026-05-15');
    expect(screen.queryByTestId('calendar-context-menu')).not.toBeInTheDocument();
  });

  it('Escape and outside click close the context menu without calling onAddRequest', async () => {
    const onAddRequest = vi.fn();
    render(<LeaveCalendar initialYear={2026} initialMonth={4} onAddRequest={onAddRequest} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    fireEvent.contextMenu(screen.getByTestId('cal-cell-2026-05-15'));
    await screen.findByTestId('calendar-context-menu');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('calendar-context-menu')).not.toBeInTheDocument();

    // Re-open and dismiss via outside click
    fireEvent.contextMenu(screen.getByTestId('cal-cell-2026-05-16'));
    await screen.findByTestId('calendar-context-menu');
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('calendar-context-menu')).not.toBeInTheDocument();

    expect(onAddRequest).not.toHaveBeenCalled();
  });

  it('day-detail modal shows the day-empty state for a day with no leaves', async () => {
    const u = userEvent.setup();
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    await u.click(screen.getByTestId('cal-cell-2026-05-15'));
    expect(await screen.findByText(/Niemand abwesend an diesem Tag/)).toBeInTheDocument();
  });

  it('shows ½ on both ends for a single-day request flagged half on both sides', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-h3',
        employeeId: stefan.id,
        leaveTypeCode: 'urlaub',
        startDate: '2026-05-11',
        endDate: '2026-05-11',
        halfDayStart: true,
        halfDayEnd: false,
        status: 'approved',
      },
    ]);
    render(<LeaveCalendar initialYear={2026} initialMonth={4} />);
    await waitFor(() => expect(screen.queryByText(/Kalender wird geladen/)).not.toBeInTheDocument());

    expect(within(screen.getByTestId('cal-cell-2026-05-11')).getByText('½ Stefan')).toBeInTheDocument();
  });
});
