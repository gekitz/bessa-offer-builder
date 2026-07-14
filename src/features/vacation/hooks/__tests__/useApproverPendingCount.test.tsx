import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const listEmployeesMock = vi.fn();
const listLeaveRequestsMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
}));

type AuthShape = { profile: { microsoft_email?: string } | null; user: { email?: string } | null };
const useAuthMock = vi.fn<() => AuthShape>(() => ({ profile: null, user: null }));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => useAuthMock(),
}));

import { useApproverPendingCount } from '../useApproverPendingCount';
import type { Employee } from '../../types';

const georg: Employee = {
  id: 'gkitz-id', code: 'gkitz', name: 'Georg Kitz', email: 'g.kitz@kitz.co.at',
  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const helmut: Employee = {
  id: 'hbauer-id', code: 'hbauer', name: 'Helmut Bauer', email: 'h.bauer@kitz.co.at',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

function HookHarness({ onCount }: { onCount: (n: number) => void }) {
  const count = useApproverPendingCount();
  onCount(count);
  return null;
}

beforeEach(() => {
  listEmployeesMock.mockReset().mockResolvedValue([georg, helmut]);
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
  useAuthMock.mockReturnValue({ profile: null, user: null });
});

describe('useApproverPendingCount', () => {
  it('returns 0 when there is no SSO email', async () => {
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[seen.length - 1]).toBe(0);
    expect(listEmployeesMock).not.toHaveBeenCalled();
  });

  it('returns 0 for a non-approver SSO user', async () => {
    // Helmut Bauer (hbauer): bh@kitz.co.at, not an approver.
    useAuthMock.mockReturnValue({ profile: { microsoft_email: 'bh@kitz.co.at' }, user: null });
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());
    expect(seen[seen.length - 1]).toBe(0);
    expect(listLeaveRequestsMock).not.toHaveBeenCalled();
  });

  it('returns the pending count for an approver SSO user', async () => {
    useAuthMock.mockReturnValue({ profile: { microsoft_email: 'kg@kitz.co.at' }, user: null });
    listLeaveRequestsMock.mockResolvedValue([
      { id: 'lr1', employeeId: 'h', leaveTypeCode: 'urlaub', startDate: '2026-08-10', endDate: '2026-08-14', status: 'pending' },
      { id: 'lr2', employeeId: 'h', leaveTypeCode: 'urlaub', startDate: '2026-09-10', endDate: '2026-09-14', status: 'pending' },
      { id: 'lr3', employeeId: 'h', leaveTypeCode: 'urlaub', startDate: '2026-10-10', endDate: '2026-10-14', status: 'pending' },
    ]);
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    await waitFor(() => expect(seen[seen.length - 1]).toBe(3));
    expect(listLeaveRequestsMock).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('returns 0 when the API call fails', async () => {
    useAuthMock.mockReturnValue({ profile: { microsoft_email: 'kg@kitz.co.at' }, user: null });
    listEmployeesMock.mockRejectedValue(new Error('rls'));
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());
    // Hook stays at the initial 0 — failure swallows.
    expect(seen[seen.length - 1]).toBe(0);
  });

  it('returns 0 when SSO matches no employee', async () => {
    useAuthMock.mockReturnValue({ profile: { microsoft_email: 'unknown@kitz.co.at' }, user: null });
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    // Employees are loaded first, then matched — no match means no request query.
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());
    expect(seen[seen.length - 1]).toBe(0);
    expect(listLeaveRequestsMock).not.toHaveBeenCalled();
  });
});
