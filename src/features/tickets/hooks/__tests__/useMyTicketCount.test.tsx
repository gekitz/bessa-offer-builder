import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const listEmployeesMock = vi.fn();
const listTicketsMock = vi.fn();

vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
}));
vi.mock('../../api/ticketApi', () => ({
  listTickets: (filters?: unknown) => listTicketsMock(filters),
}));

type AuthShape = { profile: { microsoft_email?: string } | null; user: { email?: string } | null };
const useAuthMock = vi.fn<() => AuthShape>(() => ({ profile: null, user: null }));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => useAuthMock(),
}));

import { useMyTicketCount } from '../useMyTicketCount';

function HookHarness({ onCount }: { onCount: (n: number) => void }) {
  const count = useMyTicketCount();
  onCount(count);
  return null;
}

const georg = {
  id: 'gkitz-id', code: 'gkitz', name: 'Georg Kitz',
  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime' as const, active: true,
};

beforeEach(() => {
  listEmployeesMock.mockReset().mockResolvedValue([georg]);
  listTicketsMock.mockReset().mockResolvedValue([]);
  useAuthMock.mockReturnValue({ profile: null, user: null });
});

describe('useMyTicketCount', () => {
  it('returns 0 when there is no SSO email', async () => {
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[seen.length - 1]).toBe(0);
    expect(listTicketsMock).not.toHaveBeenCalled();
  });

  it('returns 0 when the SSO email does not match any TEAM entry', async () => {
    useAuthMock.mockReturnValue({ profile: { microsoft_email: 'unknown@kitz.co.at' }, user: null });
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(listEmployeesMock).not.toHaveBeenCalled());
    expect(seen[seen.length - 1]).toBe(0);
  });

  it('returns the number of open/in_progress tickets assigned to the SSO-matched employee', async () => {
    useAuthMock.mockReturnValue({ profile: { microsoft_email: 'kg@kitz.co.at' }, user: null });
    listTicketsMock.mockResolvedValue([{}, {}, {}]);
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(seen[seen.length - 1]).toBe(3));
    expect(listTicketsMock).toHaveBeenCalledWith({
      status: ['open', 'in_progress'],
      assignedTo: 'gkitz-id',
    });
  });

  it('swallows API errors and stays at 0', async () => {
    useAuthMock.mockReturnValue({ profile: { microsoft_email: 'kg@kitz.co.at' }, user: null });
    listEmployeesMock.mockRejectedValue(new Error('boom'));
    const seen: number[] = [];
    render(<HookHarness onCount={(n) => seen.push(n)} />);
    await waitFor(() => expect(listEmployeesMock).toHaveBeenCalled());
    expect(seen[seen.length - 1]).toBe(0);
  });
});
