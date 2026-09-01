import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DashboardData } from '../../api/dashboardApi';

const loadMock = vi.fn<() => Promise<DashboardData>>();
vi.mock('../../api/dashboardApi', () => ({ loadReviewDashboard: () => loadMock() }));

import DashboardPage from '../DashboardPage';

const DATA: DashboardData = {
  reviewTickets: [{ id: 't1', ticketNumber: '26-0000001', title: 'Drucker kaputt', customerName: 'Müller GmbH', updatedAt: '2026-09-01T10:00:00Z' }],
  pendingLeaves: [{ id: 'l1', employeeName: 'Heri Scheiber', leaveTypeCode: 'urlaub', startDate: '2026-09-10', endDate: '2026-09-12' }],
  openRequests: [{ id: 'r1', productName: 'Sunmi V2', qty: 3, requesterName: 'Georg', customerName: null }],
};

beforeEach(() => {
  loadMock.mockReset().mockResolvedValue(DATA);
});

describe('DashboardPage', () => {
  it('shows the three attention queues with their items + total', async () => {
    render(<DashboardPage />);
    expect(await screen.findByText('Drucker kaputt')).toBeInTheDocument();
    expect(screen.getByText('Heri Scheiber')).toBeInTheDocument();
    expect(screen.getByText(/Sunmi V2/)).toBeInTheDocument();
    expect(screen.getByText(/3 Punkte brauchen/)).toBeInTheDocument();
  });

  it('clicking a review ticket calls onOpenTicket', async () => {
    const onOpenTicket = vi.fn();
    const u = userEvent.setup();
    render(<DashboardPage onOpenTicket={onOpenTicket} />);
    await u.click(await screen.findByText('Drucker kaputt'));
    expect(onOpenTicket).toHaveBeenCalledWith('t1');
  });

  it('clicking a leave navigates to the calendar', async () => {
    const onNavigate = vi.fn();
    const u = userEvent.setup();
    render(<DashboardPage onNavigate={onNavigate} />);
    await u.click(await screen.findByText('Heri Scheiber'));
    expect(onNavigate).toHaveBeenCalledWith('kalender');
  });

  it('renders a friendly empty state when nothing is pending', async () => {
    loadMock.mockResolvedValue({ reviewTickets: [], pendingLeaves: [], openRequests: [] });
    render(<DashboardPage />);
    expect(await screen.findByText(/Nichts zu prüfen/)).toBeInTheDocument();
  });
});
