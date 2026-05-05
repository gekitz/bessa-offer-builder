import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

const listLeaveBalancesMock = vi.fn();
const listLeaveRequestsMock = vi.fn();
const listLeaveTypesMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveBalances: (id: string, year: number) => listLeaveBalancesMock(id, year),
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
  listLeaveTypes: () => listLeaveTypesMock(),
}));

import BalancePanel from '../BalancePanel';
import type { LeaveBalance, LeaveType } from '../../api/vacationApi';
import type { LeaveRequest } from '../../types';

const ALL_TYPES: LeaveType[] = [
  { id: 1, code: 'urlaub',        label: 'Urlaub',        deductsFromBalance: true },
  { id: 2, code: 'zeitausgleich', label: 'Zeitausgleich', deductsFromBalance: false },
  { id: 3, code: 'krankenstand',  label: 'Krankenstand',  deductsFromBalance: false },
  { id: 4, code: 'schule',        label: 'Schule',        deductsFromBalance: false },
  { id: 5, code: 'pflege',        label: 'Pflegeurlaub',  deductsFromBalance: false },
  { id: 6, code: 'schulung',      label: 'Schulung',      deductsFromBalance: false },
  { id: 7, code: 'sonderurlaub',  label: 'Sonderurlaub',  deductsFromBalance: false },
];

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
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
  listLeaveTypesMock.mockReset().mockResolvedValue(ALL_TYPES);
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
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/von 25 Tagen Urlaub verbleibend/)).toBeInTheDocument();
    // Hero number = 25 (remaining), and Anspruch column also 25.
    expect(screen.getAllByText('25').length).toBeGreaterThanOrEqual(2);
  });

  it('subtracts approved past Urlaub leaves from remaining', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ entitled: 25 })]);
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-04-13', endDate: '2026-04-17', status: 'approved' }),
    ]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/von 25 Tagen Urlaub verbleibend/)).toBeInTheDocument();
    // The Urlaub row in the table shows Genommen=5, Rest=20.
    const urlaubRow = screen.getByTestId('balance-type-urlaub');
    expect(within(urlaubRow).getByText('20')).toBeInTheDocument();
    expect(within(urlaubRow).getAllByText('5').length).toBeGreaterThan(0);
  });

  it('renders a row for every leave type, with non-deductible totals as "–"', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance()]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    await screen.findByText(/von 25 Tagen Urlaub verbleibend/);
    for (const t of ALL_TYPES) {
      expect(screen.getByTestId(`balance-type-${t.code}`)).toBeInTheDocument();
    }
    // Non-deductible types show "–" in Anspruch + Rest columns.
    const krank = screen.getByTestId('balance-type-krankenstand');
    expect(within(krank).getAllByText('–').length).toBe(2);
  });

  it('shows Krankenstand days in the Genommen column for a sick leave', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance()]);
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-04-13', endDate: '2026-04-15', leaveTypeCode: 'krankenstand', status: 'approved' }),
    ]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    await screen.findByText(/von 25 Tagen Urlaub verbleibend/);
    const krank = screen.getByTestId('balance-type-krankenstand');
    // Mon-Wed Apr 13-15 = 3 working days, all in the past → Genommen = 3.
    expect(within(krank).getByText('3')).toBeInTheDocument();
    // Urlaub Rest column should still show 25 (sick leave doesn't deduct).
    const urlaubRow = screen.getByTestId('balance-type-urlaub');
    expect(within(urlaubRow).getAllByText('25').length).toBeGreaterThanOrEqual(2);
  });

  it('counts pending leaves as Geplant, not Genommen', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance()]);
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-08-10', endDate: '2026-08-14', status: 'pending' }),
    ]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/von 25 Tagen Urlaub verbleibend/)).toBeInTheDocument();
    // Urlaub row: Anspruch=25, Genommen=0, Geplant=5, Rest=20.
    const urlaub = screen.getByTestId('balance-type-urlaub');
    const cells = within(urlaub).getAllByText(/^\d+$/);
    expect(cells.map((c) => c.textContent)).toEqual(['25', '0', '5', '20']);
  });

  it('shows the empty-state message when no Urlaub balance row exists', async () => {
    listLeaveBalancesMock.mockResolvedValue([]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/Kein Urlaubsanspruch hinterlegt/)).toBeInTheDocument();
    // The per-type table still renders (so sick leave count is still
    // visible even without an Urlaub balance row).
    expect(screen.getByTestId('balance-type-table')).toBeInTheDocument();
  });

  it('renders the API error inline when the balance fetch rejects', async () => {
    listLeaveBalancesMock.mockRejectedValue(new Error('rls denied'));
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/rls denied/)).toBeInTheDocument();
  });

  it('includes carried_over in the entitlement total shown next to remaining', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ entitled: 25, carriedOver: 3 })]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    expect(await screen.findByText(/von 28 Tagen Urlaub verbleibend/)).toBeInTheDocument();
    // Hero = 28 (remaining); Urlaub Anspruch column = 28 (entitled + carriedOver).
    expect(screen.getAllByText('28').length).toBeGreaterThanOrEqual(2);
  });

  it('formats half-day balances with a German decimal separator', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ entitled: 25 })]);
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-08-10', endDate: '2026-08-14', halfDayStart: true, status: 'pending' }),
    ]);
    render(<BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />);

    // 25 - 4.5 = 20.5 → "20,5" (German decimal). Hero + Rest column
    // both render this; either is fine for the formatting check.
    expect(await screen.findAllByText('20,5')).not.toHaveLength(0);
  });

  it('queries for the requested year', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance({ year: 2025 })]);
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
    const { rerender } = render(
      <BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" reloadKey={0} />,
    );
    await waitFor(() => expect(listLeaveBalancesMock).toHaveBeenCalledTimes(1));

    rerender(
      <BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" reloadKey={1} />,
    );
    await waitFor(() => expect(listLeaveBalancesMock).toHaveBeenCalledTimes(2));
  });

  it('refetches when employeeId changes (approver picking another employee)', async () => {
    listLeaveBalancesMock.mockResolvedValue([balance()]);
    const { rerender } = render(
      <BalancePanel employeeId="emp-1" year={2026} today="2026-05-04" />,
    );
    await waitFor(() => expect(listLeaveBalancesMock).toHaveBeenCalledTimes(1));

    rerender(<BalancePanel employeeId="emp-2" year={2026} today="2026-05-04" />);
    await waitFor(() => expect(listLeaveBalancesMock).toHaveBeenCalledTimes(2));
    expect(listLeaveBalancesMock.mock.calls.at(-1)).toEqual(['emp-2', 2026]);
  });
});
