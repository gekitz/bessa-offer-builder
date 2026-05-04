import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

const listLeaveBalancesMock = vi.fn();
const listLeaveRequestsMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveBalances: (id: string, year: number) => listLeaveBalancesMock(id, year),
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
}));

import BalancePanel from '../BalancePanel';
import type { LeaveBalance } from '../../api/vacationApi';
import type { LeaveRequest } from '../../types';

function balance(overrides: Partial<LeaveBalance> = {}): LeaveBalance {
  return {
    id: 'lb-1',
    employeeId: 'emp-1',
    year: 2026,
    leaveTypeCode: 'urlaub',
    entitled: 25,
    carriedOver: 0,
    used: 0,
    planned: 0,
    ...overrides,
  };
}

function leave(overrides: Partial<LeaveRequest> & Pick<LeaveRequest, 'startDate' | 'endDate'>): LeaveRequest {
  return {
    employeeId: 'emp-1',
    leaveTypeCode: 'urlaub',
    status: 'approved',
    ...overrides,
  };
}

beforeEach(() => {
  listLeaveBalancesMock.mockReset();
  listLeaveRequestsMock.mockReset();
});

describe('BalancePanel', () => {
  it('shows the loading state initially', () => {
    listLeaveBalancesMock.mockImplementation(() => new Promise(() => {}));
    listLeaveRequestsMock.mockImplementation(() => new Promise(() => {}));
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);
    expect(screen.getByText(/Wird berechnet/)).toBeInTheDocument();
  });

  it('renders 25 days remaining for an employee with no leaves', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance()]);
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/von 25 Tagen verbleibend/)).toBeInTheDocument();
    // The Anspruch stat shows 25 too — both 25s should be present.
    expect(screen.getAllByText('25').length).toBeGreaterThanOrEqual(2);
  });

  it('subtracts approved past leaves from remaining', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ entitled: 25 })]);
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-04-13', endDate: '2026-04-17', status: 'approved' }),
    ]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    // 25 - 5 = 20 (verbleibend)
    expect(await screen.findByText(/von 25 Tagen verbleibend/)).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    // Genommen stat = 5
    const genommen = screen.getByText('Genommen').parentElement!;
    expect(within(genommen).getByText('5')).toBeInTheDocument();
  });

  it('counts pending leaves as Geplant, not Genommen', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance()]);
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-08-10', endDate: '2026-08-14', status: 'pending' }),
    ]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/von 25 Tagen verbleibend/)).toBeInTheDocument();
    // The label "Geplant" sits above its value
    const planned = screen.getByText('Geplant').parentElement!;
    expect(within(planned).getByText('5')).toBeInTheDocument();
    // And Genommen should be 0 since the leave is pending, not approved-past.
    const genommen = screen.getByText('Genommen').parentElement!;
    expect(within(genommen).getByText('0')).toBeInTheDocument();
  });

  it('shows the empty-state message when no balance row exists', async () => {
    listLeaveBalancesMock.mockResolvedValue([]);
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/Kein Urlaubsanspruch hinterlegt/)).toBeInTheDocument();
  });

  it('renders the API error inline when the balance fetch rejects', async () => {
    listLeaveBalancesMock.mockRejectedValue(new Error('rls denied'));
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/rls denied/)).toBeInTheDocument();
  });

  it('includes carried_over in the entitlement total shown next to remaining', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ entitled: 25, carriedOver: 3 })]);
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/von 28 Tagen verbleibend/)).toBeInTheDocument();
    // Hero = 28 (remaining). Übertrag stat = 3.
    expect(screen.getAllByText('28').length).toBeGreaterThan(0);
    const uebertrag = screen.getByText('Übertrag').parentElement!;
    expect(within(uebertrag).getByText('3')).toBeInTheDocument();
  });

  it('formats half-day balances with a German decimal separator', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ entitled: 25 })]);
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-08-10', endDate: '2026-08-14', halfDayStart: true, status: 'pending' }),
    ]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    // 25 - 4.5 = 20.5 → "20,5"
    expect(await screen.findByText('20,5')).toBeInTheDocument();
  });

  it('queries for the requested year', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ year: 2025 })]);
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<BalancePanel employeeId="emp-1" year={2025} today="2025-12-31" />);

    await waitFor(() => expect(listLeaveBalancesMock).toHaveBeenCalled());
    expect(listLeaveBalancesMock).toHaveBeenCalledWith('emp-1', 2025);
    expect(listLeaveRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'emp-1',
      rangeStart: '2025-01-01',
      rangeEnd: '2025-12-31',
    }));
    expect(screen.getByText(/Urlaubsstand 2025/)).toBeInTheDocument();
  });

  it('refetches when reloadKey bumps', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance()]);
    listLeaveRequestsMock.mockResolvedValue([]);
    const { rerender } = render(
      <BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" reloadKey={0} />,
    );
    await waitFor(() => expect(listLeaveBalancesMock).toHaveBeenCalledTimes(1));

    rerender(
      <BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" reloadKey={1} />,
    );
    await waitFor(() => expect(listLeaveBalancesMock).toHaveBeenCalledTimes(2));
  });
});
