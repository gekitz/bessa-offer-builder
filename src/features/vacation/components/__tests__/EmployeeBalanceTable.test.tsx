import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

const getUrlaubBalanceMock = vi.fn();
const listLeaveRequestsMock = vi.fn();
const listLeaveTypesMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  getUrlaubBalance: (id: string) => getUrlaubBalanceMock(id),
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
  listLeaveTypes: () => listLeaveTypesMock(),
}));

import EmployeeBalanceTable from '../EmployeeBalanceTable';
import type { LeaveBalance, LeaveType } from '../../api/vacationApi';
import type { LeaveRequest } from '../../types';

const ALL_TYPES: LeaveType[] = [
  { id: 1, code: 'urlaub',        label: 'Urlaub',        deductsFromBalance: true },
  { id: 2, code: 'zeitausgleich', label: 'Zeitausgleich', deductsFromBalance: false },
  { id: 3, code: 'krankenstand',  label: 'Krankenstand',  deductsFromBalance: false },
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
    periodStart: null,
    periodEnd: null,
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
  getUrlaubBalanceMock.mockReset().mockResolvedValue(balance());
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
  listLeaveTypesMock.mockReset().mockResolvedValue(ALL_TYPES);
});

describe('EmployeeBalanceTable', () => {
  it('shows the loading state initially', () => {
    getUrlaubBalanceMock.mockImplementation(() => new Promise(() => {}));
    listLeaveRequestsMock.mockImplementation(() => new Promise(() => {}));
    listLeaveTypesMock.mockImplementation(() => new Promise(() => {}));
    render(<EmployeeBalanceTable employeeId="emp-1" year={2026} today="2026-05-04" />);
    expect(screen.getByText(/Stand wird geladen/)).toBeInTheDocument();
  });

  it('renders one row per leave_type', async () => {
    getUrlaubBalanceMock.mockResolvedValue(balance());
    render(<EmployeeBalanceTable employeeId="emp-1" year={2026} today="2026-05-04" />);
    await screen.findByTestId('employee-balance-table');
    for (const t of ALL_TYPES) {
      expect(screen.getByTestId(`employee-balance-row-${t.code}`)).toBeInTheDocument();
    }
  });

  it('renders Anspruch + Rest as numbers for Urlaub, "–" for non-deductible types', async () => {
    getUrlaubBalanceMock.mockResolvedValue(balance({ entitled: 25, carriedOver: 3 }));
    render(<EmployeeBalanceTable employeeId="emp-1" year={2026} today="2026-05-04" />);
    await screen.findByTestId('employee-balance-table');

    // Urlaub row: Anspruch (entitled+carriedOver) and Rest (no leaves)
    // both render 28 — that's two cells.
    const urlaub = screen.getByTestId('employee-balance-row-urlaub');
    expect(within(urlaub).getAllByText('28')).toHaveLength(2);

    const krank = screen.getByTestId('employee-balance-row-krankenstand');
    expect(within(krank).getAllByText('–').length).toBe(2);
  });

  it('shows Krankenstand days in the Genommen column', async () => {
    getUrlaubBalanceMock.mockResolvedValue(balance());
    listLeaveRequestsMock.mockResolvedValue([
      leave({ startDate: '2026-04-13', endDate: '2026-04-15', leaveTypeCode: 'krankenstand', status: 'approved' }),
    ]);
    render(<EmployeeBalanceTable employeeId="emp-1" year={2026} today="2026-05-04" />);
    await screen.findByTestId('employee-balance-table');

    const krank = screen.getByTestId('employee-balance-row-krankenstand');
    expect(within(krank).getByText('3')).toBeInTheDocument();
  });

  it('counts urlaub only within the Arbeitsjahr window, others over the calendar year', async () => {
    // Period Oct 2025 → Oct 2026. Grant 25.
    getUrlaubBalanceMock.mockResolvedValue(balance({
      entitled: 25,
      periodStart: '2025-10-02',
      periodEnd: '2026-10-01',
    }));
    listLeaveRequestsMock.mockResolvedValue([
      // Inside the Arbeitsjahr → counts against urlaub (5 days).
      leave({ startDate: '2025-11-10', endDate: '2025-11-14', status: 'approved' }),
      // After the period end → must NOT count against this urlaub balance.
      leave({ startDate: '2026-10-20', endDate: '2026-10-24', status: 'approved' }),
    ]);
    render(<EmployeeBalanceTable employeeId="emp-1" year={2026} today="2026-09-17" />);
    await screen.findByTestId('employee-balance-table');

    // Fetch window spans both the period and the calendar year.
    expect(listLeaveRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      rangeStart: '2025-10-02',
      rangeEnd: '2026-12-31',
    }));
    // Rest = 25 − 5 = 20 (only the in-period leave counts).
    const urlaub = screen.getByTestId('employee-balance-row-urlaub');
    expect(within(urlaub).getByText('20')).toBeInTheDocument();
  });

  it('renders the API error inline when the fetch rejects', async () => {
    getUrlaubBalanceMock.mockRejectedValue(new Error('rls denied'));
    render(<EmployeeBalanceTable employeeId="emp-1" year={2026} today="2026-05-04" />);
    expect(await screen.findByText(/rls denied/)).toBeInTheDocument();
  });

  it('refetches when employeeId changes', async () => {
    getUrlaubBalanceMock.mockResolvedValue(balance());
    const { rerender } = render(<EmployeeBalanceTable employeeId="emp-1" year={2026} today="2026-05-04" />);
    await waitFor(() => expect(getUrlaubBalanceMock).toHaveBeenCalledTimes(1));

    rerender(<EmployeeBalanceTable employeeId="emp-2" year={2026} today="2026-05-04" />);
    await waitFor(() => expect(getUrlaubBalanceMock).toHaveBeenCalledTimes(2));
    expect(getUrlaubBalanceMock.mock.calls.at(-1)).toEqual(['emp-2']);
  });
});
