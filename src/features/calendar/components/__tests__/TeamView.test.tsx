import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stub the entire calendarApi facade so TeamView's six parallel
// fetches don't try to hit Supabase.
const listAppointmentsMock = vi.fn();
const listLeaveRequestsMock = vi.fn();
const listShiftsMock = vi.fn();
const listSlotKindsMock = vi.fn();
const listBankHolidaysMock = vi.fn();
const listEmployeesMock = vi.fn();
const listLeaveTypesMock = vi.fn();

vi.mock('../../api/calendarApi', () => ({
  listAppointments: (range: unknown) => listAppointmentsMock(range),
  listLeaveRequests: (filter: unknown) => listLeaveRequestsMock(filter),
  listShifts: (filter: unknown) => listShiftsMock(filter),
  listSlotKinds: () => listSlotKindsMock(),
  listBankHolidays: (year: number) => listBankHolidaysMock(year),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listLeaveTypes: () => listLeaveTypesMock(),
}));

import TeamView from '../TeamView';
import { DEFAULT_LAYER_VISIBILITY } from '../../types';
import type { Employee } from '../../../vacation/types';

const ALICE: Employee = {
  id: 'emp-a', code: 'alice', name: 'Alice',
  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const BOB: Employee = {
  id: 'emp-b', code: 'bob', name: 'Bob',
  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

// Pick a Wednesday so the ISO week is fully contained in a single
// month — that keeps the cell-IDs predictable across the run.
const FIXED_TODAY = new Date('2026-05-13T10:00:00Z'); // Wed

beforeEach(() => {
  // shouldAdvanceTime keeps setTimeout-based polling (findBy*) live
  // while we still control "today" via setSystemTime.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);

  listAppointmentsMock.mockReset().mockResolvedValue([]);
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
  listShiftsMock.mockReset().mockResolvedValue([]);
  listSlotKindsMock.mockReset().mockResolvedValue([]);
  listBankHolidaysMock.mockReset().mockResolvedValue([]);
  listEmployeesMock.mockReset().mockResolvedValue([ALICE, BOB]);
  listLeaveTypesMock.mockReset().mockResolvedValue([
    { id: 1, code: 'urlaub', label: 'Urlaub', deductsFromBalance: true },
  ]);
});

describe('TeamView', () => {
  it('renders one row per active employee + 7 day columns', async () => {
    render(<TeamView visibility={DEFAULT_LAYER_VISIBILITY} />);
    await screen.findByText('Alice');
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Header row: Mo Di Mi Do Fr Sa So
    for (const dow of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
      expect(screen.getByText(dow)).toBeInTheDocument();
    }
    // 14 cells (2 employees × 7 days)
    const cells = screen.getAllByTestId(/team-cell-/);
    expect(cells.length).toBe(14);
  });

  it('paints a violet dot on the cell for the appointment day + assignee', async () => {
    listAppointmentsMock.mockResolvedValue([
      {
        id: 'a-1', ticketId: 't-1', mesonicCustomerId: null, customerName: null,
        title: 'Vor-Ort', description: null, kind: 'reparatur',
        // Wednesday 2026-05-13 09:00 local
        startsAt: '2026-05-13T09:00:00',
        endsAt: '2026-05-13T11:00:00',
        allDay: false, location: null, status: 'geplant',
        standortId: null, notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
      },
    ]);
    render(<TeamView visibility={DEFAULT_LAYER_VISIBILITY} />);
    await screen.findByText('Alice');

    const aliceWedCell = await screen.findByTestId('team-cell-emp-a-2026-05-13');
    const dots = aliceWedCell.querySelectorAll('[data-testid="dot-appointment"]');
    expect(dots.length).toBe(1);

    // Bob's Wed cell has no appointment.
    const bobWedCell = screen.getByTestId('team-cell-emp-b-2026-05-13');
    expect(bobWedCell.querySelectorAll('[data-testid="dot-appointment"]').length).toBe(0);
  });

  it('paints the leave dot across every day in the leave window', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-1', employeeId: 'emp-b', leaveTypeCode: 'urlaub',
        startDate: '2026-05-12', endDate: '2026-05-14', status: 'approved',
      },
    ]);
    render(<TeamView visibility={DEFAULT_LAYER_VISIBILITY} />);
    await screen.findByText('Bob');

    for (const day of ['2026-05-12', '2026-05-13', '2026-05-14']) {
      const cell = await screen.findByTestId(`team-cell-emp-b-${day}`);
      expect(cell.querySelectorAll('[data-testid="dot-leave"]').length).toBe(1);
    }
    // 2026-05-15 is outside the leave window
    const dayAfter = screen.getByTestId('team-cell-emp-b-2026-05-15');
    expect(dayAfter.querySelectorAll('[data-testid="dot-leave"]').length).toBe(0);
  });

  it('omits dots for layers that are hidden via visibility', async () => {
    listAppointmentsMock.mockResolvedValue([
      {
        id: 'a-1', ticketId: 't-1', mesonicCustomerId: null, customerName: null,
        title: 'X', description: null, kind: 'reparatur',
        startsAt: '2026-05-13T09:00:00', endsAt: '2026-05-13T11:00:00',
        allDay: false, location: null, status: 'geplant',
        standortId: null, notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
      },
    ]);
    render(<TeamView visibility={{ ...DEFAULT_LAYER_VISIBILITY, appointment: false }} />);
    await screen.findByText('Alice');
    const aliceWedCell = await screen.findByTestId('team-cell-emp-a-2026-05-13');
    expect(aliceWedCell.querySelectorAll('[data-testid="dot-appointment"]').length).toBe(0);
  });

  it('opens DayDetailModal scoped to the clicked (employee, day)', async () => {
    const u = userEvent.setup();
    listLeaveRequestsMock.mockResolvedValue([
      { id: 'lr-a', employeeId: 'emp-a', leaveTypeCode: 'urlaub',
        startDate: '2026-05-13', endDate: '2026-05-13', status: 'approved' },
      { id: 'lr-b', employeeId: 'emp-b', leaveTypeCode: 'urlaub',
        startDate: '2026-05-13', endDate: '2026-05-13', status: 'approved' },
    ]);
    render(<TeamView visibility={DEFAULT_LAYER_VISIBILITY} />);
    await screen.findByText('Alice');

    await u.click(screen.getByTestId('team-cell-emp-a-2026-05-13'));

    // DayDetailModal should show Alice's entry only — Bob's leave on
    // the same day must not appear.
    const modal = await screen.findByTestId('day-detail-backdrop');
    expect(within(modal).getByText('Alice')).toBeInTheDocument();
    expect(within(modal).queryByText('Bob')).not.toBeInTheDocument();
    // Header still says "1 Abwesenheit"
    expect(within(modal).getByText(/1 Abwesenheit/)).toBeInTheDocument();
  });
});
