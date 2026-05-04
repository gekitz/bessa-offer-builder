import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listLeaveRequestsMock = vi.fn();
const listEmployeesMock = vi.fn();
const listLeaveTypesMock = vi.fn();
const decideLeaveRequestMock = vi.fn();
const cancelLeaveRequestMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listLeaveTypes: () => listLeaveTypesMock(),
  decideLeaveRequest: (...args: unknown[]) => decideLeaveRequestMock(...args),
  cancelLeaveRequest: (...args: unknown[]) => cancelLeaveRequestMock(...args),
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
  decideLeaveRequestMock.mockReset().mockResolvedValue({ id: 'lr-1', status: 'approved' });
  cancelLeaveRequestMock.mockReset().mockResolvedValue(undefined);
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

describe('LeaveRequestsList — actionable mode', () => {
  // window.confirm is opened before every API call. Default-allow it
  // so happy-path tests aren't littered with confirm mocks. Tests
  // that explicitly cancel set their own value.
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows no action buttons when actionable is false (default)', async () => {
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Genehmigen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ablehnen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stornieren/ })).not.toBeInTheDocument();
  });

  it('hides Genehmigen + Ablehnen when actionable=true but canDecide=false (non-approver)', async () => {
    render(<LeaveRequestsList actionable />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    // Stornieren is still allowed (cancellation is self-service).
    expect(screen.getAllByRole('button', { name: /Stornieren/ }).length).toBeGreaterThan(0);
    // But the approver-only buttons must not render.
    expect(screen.queryByRole('button', { name: /Genehmigen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ablehnen/ })).not.toBeInTheDocument();
  });

  it('renders Genehmigen + Ablehnen + Stornieren when actionable + canDecide', async () => {
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    // Stefan's request is pending -> all three actions
    expect(screen.getByRole('button', { name: /Genehmigen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ablehnen/ })).toBeInTheDocument();

    // Mario's request is approved -> only Stornieren, no decide buttons
    const decideButtons = screen.getAllByRole('button', { name: /Genehmigen/ });
    const cancelButtons = screen.getAllByRole('button', { name: /Stornieren/ });
    expect(decideButtons).toHaveLength(1); // only Stefan's pending row
    expect(cancelButtons).toHaveLength(2); // Stefan (pending) + Mario (approved)
  });

  it('approves a request and refetches the list', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1);

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/genehmigen/i));
    await waitFor(() => expect(decideLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(decideLeaveRequestMock).toHaveBeenCalledWith('lr-1', 'approved', null);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(2));
  });

  it('rejects a request', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Ablehnen/ }));

    await waitFor(() => expect(decideLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(decideLeaveRequestMock).toHaveBeenCalledWith('lr-1', 'rejected', null);
  });

  it('passes decidedBy to decideLeaveRequest when the prop is set', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide decidedBy="gkitz-id" />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));

    await waitFor(() => expect(decideLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(decideLeaveRequestMock).toHaveBeenCalledWith('lr-1', 'approved', 'gkitz-id');
  });

  it('skips the API call when the user dismisses the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));

    expect(decideLeaveRequestMock).not.toHaveBeenCalled();
  });

  it('cancels a leave', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    const cancelButtons = screen.getAllByRole('button', { name: /Stornieren/ });
    await u.click(cancelButtons[0]!);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/stornieren/i));
    await waitFor(() => expect(cancelLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(cancelLeaveRequestMock).toHaveBeenCalledWith('lr-1');
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(2));
  });

  it('shows an inline error banner when an action fails', async () => {
    decideLeaveRequestMock.mockRejectedValueOnce(new Error('rls denied'));
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));

    expect(await screen.findByText(/Aktion fehlgeschlagen/)).toBeInTheDocument();
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });
});
