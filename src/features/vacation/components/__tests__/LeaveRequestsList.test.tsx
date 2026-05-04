import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listLeaveRequestsMock = vi.fn();
const listEmployeesMock = vi.fn();
const listLeaveTypesMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listLeaveTypes: () => listLeaveTypesMock(),
}));

import LeaveRequestsList from '../LeaveRequestsList';
import type { Employee, LeaveRequest } from '../../types';

const stefan: Employee = {
  id: 'sbauer-id', code: 'sbauer', name: 'Stefan Bauer',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const mario: Employee = {
  id: 'mgraf-id', code: 'mgraf', name: 'Mario Graf',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const TYPES = [
  { id: 1, code: 'urlaub' as const, label: 'Urlaub', deductsFromBalance: true },
  { id: 3, code: 'krankenstand' as const, label: 'Krankenstand', deductsFromBalance: false },
];

const stefanUrlaub: LeaveRequest & { id: string } = {
  id: 'lr-1',
  employeeId: stefan.id,
  leaveTypeCode: 'urlaub',
  startDate: '2026-08-10',
  endDate: '2026-08-15',
  status: 'pending',
  reason: 'Sommerurlaub',
  substituteId: mario.id,
};

const marioKrank: LeaveRequest & { id: string } = {
  id: 'lr-2',
  employeeId: mario.id,
  leaveTypeCode: 'krankenstand',
  startDate: '2026-05-04',
  endDate: '2026-05-04',
  status: 'approved',
};

beforeEach(() => {
  listLeaveRequestsMock.mockReset().mockResolvedValue([stefanUrlaub, marioKrank]);
  listEmployeesMock.mockReset().mockResolvedValue([stefan, mario]);
  listLeaveTypesMock.mockReset().mockResolvedValue(TYPES);
});

describe('LeaveRequestsList', () => {
  it('shows the loading spinner initially, then the requests', async () => {
    render(<LeaveRequestsList />);
    expect(screen.getByText(/Anträge werden geladen/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Anträge werden geladen/)).not.toBeInTheDocument();
    });
    // One <li> per request, two requests in the fixture.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Stefan Bauer')).toBeInTheDocument();
    // Mario appears twice (his own request + as Stefan's substitute), so just assert presence.
    expect(screen.getAllByText('Mario Graf').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the employee name, leave type label, formatted date range, status', async () => {
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    expect(screen.getByText('Urlaub')).toBeInTheDocument();
    // Multi-day range gets the "DD.MM.YYYY – DD.MM.YYYY" form.
    expect(screen.getByText(/10\.08\.2026.*15\.08\.2026/)).toBeInTheDocument();
    expect(screen.getByText('Offen')).toBeInTheDocument();

    // Single-day request collapses to just one date.
    expect(screen.getByText('Krankenstand')).toBeInTheDocument();
    expect(screen.getByText('04.05.2026')).toBeInTheDocument();
    expect(screen.getByText('Genehmigt')).toBeInTheDocument();
  });

  it('renders the optional reason and substitute when present', async () => {
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    expect(screen.getByText(/Sommerurlaub/)).toBeInTheDocument();
    expect(screen.getByText(/Vertretung:/)).toBeInTheDocument();
    // Mario appears once as a request author and once as substitute — the
    // `Vertretung:` line itself is what we're asserting on.
  });

  it('shows the empty state when no requests come back', async () => {
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<LeaveRequestsList emptyLabel="Noch keine Anträge eingereicht." />);
    await waitFor(() => {
      expect(screen.getByText('Noch keine Anträge eingereicht.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Stefan Bauer')).not.toBeInTheDocument();
  });

  it('shows the error panel when the API throws', async () => {
    listLeaveRequestsMock.mockRejectedValue(new Error('rls denied'));
    render(<LeaveRequestsList />);
    await waitFor(() => {
      expect(screen.getByText(/Anträge konnten nicht geladen werden/)).toBeInTheDocument();
    });
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });

  it('passes the statusFilter prop straight through to listLeaveRequests', async () => {
    render(<LeaveRequestsList statusFilter="pending" />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith({
      status: 'pending',
      employeeId: undefined,
    });
  });

  it('passes employeeId through when scoping to a single person', async () => {
    render(<LeaveRequestsList employeeId={stefan.id} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: stefan.id }),
    );
  });

  it('refetches when the user clicks the refresh button', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1);

    await u.click(screen.getByLabelText('Aktualisieren'));
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(2));
  });

  it('refetches when the parent bumps reloadKey', async () => {
    const { rerender } = render(<LeaveRequestsList reloadKey={0} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1));

    rerender(<LeaveRequestsList reloadKey={1} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(2));
  });

  it('falls back to the raw id and code when employee or leave type is unknown', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-orphan',
        employeeId: 'unknown-emp',
        leaveTypeCode: 'urlaub',
        startDate: '2026-08-10',
        endDate: '2026-08-12',
        status: 'pending',
      },
    ]);
    listEmployeesMock.mockResolvedValue([]);
    listLeaveTypesMock.mockResolvedValue([]);
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('unknown-emp')).toBeInTheDocument());
    expect(screen.getByText('urlaub')).toBeInTheDocument();
  });

  it('hides the header when showHeader=false', async () => {
    render(<LeaveRequestsList showHeader={false} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(screen.queryByLabelText('Aktualisieren')).not.toBeInTheDocument();
  });
});
