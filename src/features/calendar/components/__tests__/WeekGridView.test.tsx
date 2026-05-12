import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listAppointmentsMock = vi.fn();
const listLeaveRequestsMock = vi.fn();
const listEmployeesMock = vi.fn();
const getAppointmentMock = vi.fn();

vi.mock('../../api/calendarApi', () => ({
  listAppointments: (range: unknown) => listAppointmentsMock(range),
  listLeaveRequests: (filter: unknown) => listLeaveRequestsMock(filter),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
}));
// Stub the standalone-appointment getter used when clicking a block to
// edit. We don't actually render the form here.
vi.mock('../../../tickets/api/ticketApi', () => ({
  getAppointment: (id: string) => getAppointmentMock(id),
}));
// Stub AppointmentForm so click-block doesn't bring in a real modal.
vi.mock('../../../tickets/components/AppointmentForm', () => ({
  default: ({ appointment }: { appointment?: { id: string } }) =>
    appointment ? <div data-testid="appointment-form-stub">edit {appointment.id}</div> : null,
}));

import WeekGridView from '../WeekGridView';
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

// Pick a Wednesday inside the visible Mo–Fr range.
const FIXED_TODAY = new Date('2026-05-13T10:00:00Z');
// 2026-05-11 is the Monday of that week.
const WEEK_MON = '2026-05-11';
const WEEK_WED = '2026-05-13';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);
  listAppointmentsMock.mockReset().mockResolvedValue([]);
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
  listEmployeesMock.mockReset().mockResolvedValue([ALICE, BOB]);
  getAppointmentMock.mockReset();
});

describe('WeekGridView', () => {
  it('renders Mo–Fr columns + hour gutter', async () => {
    render(<WeekGridView visibility={DEFAULT_LAYER_VISIBILITY} />);
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalled());
    for (const dow of ['Mo', 'Di', 'Mi', 'Do', 'Fr']) {
      expect(screen.getByText(dow)).toBeInTheDocument();
    }
    // Hour gutter: 07:00 through 18:00 (12 rows)
    expect(screen.getByText('07:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    // No Sa/So
    expect(screen.queryByText('Sa')).not.toBeInTheDocument();
  });

  it('renders an appointment block at the right slot for the right day', async () => {
    listAppointmentsMock.mockResolvedValue([
      {
        id: 'a-1', ticketId: 't-1', mesonicCustomerId: null, customerName: 'Müller GmbH',
        title: 'Vor-Ort-Reparatur', description: null, kind: 'reparatur',
        startsAt: '2026-05-13T09:00:00', endsAt: '2026-05-13T11:00:00',
        allDay: false, location: null, status: 'geplant', standortId: null,
        notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
      },
    ]);
    render(<WeekGridView visibility={DEFAULT_LAYER_VISIBILITY} />);
    const block = await screen.findByTestId('week-block-a-1');
    expect(block.textContent).toContain('Vor-Ort-Reparatur');
    expect(block.textContent).toContain('Müller GmbH');
    expect(block.textContent).toContain('Alice');
    // Position: 9:00 - 7:00 = 2h * 56px = 112px from top, height = 2h = 112px
    expect(block.style.top).toBe('112px');
    expect(block.style.height).toBe('112px');
  });

  it('hides appointment blocks when the appointment layer is off', async () => {
    listAppointmentsMock.mockResolvedValue([
      {
        id: 'a-1', ticketId: null, mesonicCustomerId: null, customerName: null,
        title: 'X', description: null, kind: 'reparatur',
        startsAt: '2026-05-13T09:00:00', endsAt: '2026-05-13T11:00:00',
        allDay: false, location: null, status: 'geplant', standortId: null,
        notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
      },
    ]);
    render(<WeekGridView visibility={{ ...DEFAULT_LAYER_VISIBILITY, appointment: false }} />);
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalled());
    expect(screen.queryByTestId('week-block-a-1')).not.toBeInTheDocument();
  });

  it('lays out overlapping appointments side-by-side', async () => {
    listAppointmentsMock.mockResolvedValue([
      {
        id: 'a-1', ticketId: null, mesonicCustomerId: null, customerName: null,
        title: 'A', description: null, kind: 'reparatur',
        startsAt: '2026-05-13T09:00:00', endsAt: '2026-05-13T11:00:00',
        allDay: false, location: null, status: 'geplant', standortId: null,
        notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
      },
      {
        id: 'a-2', ticketId: null, mesonicCustomerId: null, customerName: null,
        title: 'B', description: null, kind: 'reparatur',
        startsAt: '2026-05-13T10:00:00', endsAt: '2026-05-13T12:00:00',
        allDay: false, location: null, status: 'geplant', standortId: null,
        notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [{ id: 'aa-2', appointmentId: 'a-2', employeeId: 'emp-b', role: 'lead', createdAt: '' }],
      },
    ]);
    render(<WeekGridView visibility={DEFAULT_LAYER_VISIBILITY} />);
    const a = await screen.findByTestId('week-block-a-1');
    const b = await screen.findByTestId('week-block-a-2');
    // Two-lane group: each block has width calc(50% - 4px); one starts
    // at left: calc(0% + 2px), the other at calc(50% + 2px).
    expect(a.style.width).toBe('calc(50% - 4px)');
    expect(b.style.width).toBe('calc(50% - 4px)');
    expect(a.style.left).toBe('calc(0% + 2px)');
    expect(b.style.left).toBe('calc(50% + 2px)');
  });

  it('calls onCreateAt with the clicked-day hour bounds when an empty slot is clicked', async () => {
    const u = userEvent.setup();
    const onCreateAt = vi.fn();
    render(<WeekGridView visibility={DEFAULT_LAYER_VISIBILITY} onCreateAt={onCreateAt} />);
    await waitFor(() => expect(listAppointmentsMock).toHaveBeenCalled());

    await u.click(screen.getByTestId(`week-empty-${WEEK_WED}-10`));

    expect(onCreateAt).toHaveBeenCalledTimes(1);
    const [start, end] = onCreateAt.mock.calls[0];
    // Wednesday 10:00 local — matches the day + hour parts of the ISO.
    expect(start).toMatch(/2026-05-13T0[89]:00:00/); // depends on TZ offset
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(60 * 60 * 1000);
  });

  it('opens the appointment-edit modal when a block is clicked', async () => {
    listAppointmentsMock.mockResolvedValue([
      {
        id: 'a-1', ticketId: null, mesonicCustomerId: null, customerName: null,
        title: 'X', description: null, kind: 'reparatur',
        startsAt: '2026-05-13T09:00:00', endsAt: '2026-05-13T11:00:00',
        allDay: false, location: null, status: 'geplant', standortId: null,
        notes: null, createdBy: null, createdAt: '', updatedAt: '',
        assignees: [{ id: 'aa-1', appointmentId: 'a-1', employeeId: 'emp-a', role: 'lead', createdAt: '' }],
      },
    ]);
    getAppointmentMock.mockResolvedValue({ id: 'a-1', title: 'X' });
    const u = userEvent.setup();
    render(<WeekGridView visibility={DEFAULT_LAYER_VISIBILITY} />);
    await u.click(await screen.findByTestId('week-block-a-1'));
    await screen.findByTestId('appointment-form-stub');
    expect(getAppointmentMock).toHaveBeenCalledWith('a-1');
  });

  it('renders an all-day Urlaub bar for the days a leave covers', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-1', employeeId: 'emp-a', leaveTypeCode: 'urlaub',
        startDate: WEEK_MON, endDate: WEEK_WED, status: 'approved',
      },
    ]);
    render(<WeekGridView visibility={DEFAULT_LAYER_VISIBILITY} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(screen.getByText('ganztägig')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(3); // Mo, Di, Mi
  });
});
