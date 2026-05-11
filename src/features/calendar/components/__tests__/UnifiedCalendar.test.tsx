import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stub LeaveCalendar — it owns its own data fetching and modals,
// which we don't care about for the UnifiedCalendar contract.
vi.mock('../../../vacation/components/LeaveCalendar', () => ({
  default: () => <div data-testid="leave-calendar-stub" />,
}));

// Stub the unified-data hook so we can control the appointment stream.
const useCalendarEventsMock = vi.fn();
vi.mock('../../hooks/useCalendarEvents', () => ({
  useCalendarEvents: (year: number, month: number) => useCalendarEventsMock(year, month),
}));

import UnifiedCalendar from '../UnifiedCalendar';

beforeEach(() => {
  useCalendarEventsMock.mockReset();
  window.localStorage.clear();
});

function setEvents(events: unknown[] = []) {
  useCalendarEventsMock.mockReturnValue({ events, loading: false, error: null, refetch: vi.fn() });
}

describe('UnifiedCalendar', () => {
  it('renders LeaveCalendar plus the four layer toggles', () => {
    setEvents();
    render(<UnifiedCalendar />);
    expect(screen.getByTestId('leave-calendar-stub')).toBeInTheDocument();
    for (const id of ['appointment', 'leave', 'shift', 'holiday']) {
      expect(screen.getByTestId(`layer-toggle-${id}`)).toBeInTheDocument();
    }
  });

  it('shows the appointment summary panel by default with zero count', () => {
    setEvents();
    render(<UnifiedCalendar />);
    expect(screen.getByText(/Termine —/)).toBeInTheDocument();
    expect(screen.getByText(/0 Termine/)).toBeInTheDocument();
  });

  it('lists appointments returned by useCalendarEvents', () => {
    setEvents([
      {
        id: 'appointment:a-1',
        type: 'appointment',
        title: 'Vor-Ort-Reparatur — Müller GmbH',
        startsAt: '2026-05-12T09:00:00Z',
        endsAt: '2026-05-12T11:00:00Z',
        allDay: false,
        color: 'lila',
        employeeIds: ['emp-a'],
        metadata: { location: 'Klagenfurt' },
      },
    ]);
    render(<UnifiedCalendar />);
    expect(screen.getByText('Vor-Ort-Reparatur — Müller GmbH')).toBeInTheDocument();
    expect(screen.getByText(/1 Termin/)).toBeInTheDocument();
  });

  it('toggling the appointments layer hides the summary panel and persists to localStorage', async () => {
    const u = userEvent.setup();
    setEvents();
    render(<UnifiedCalendar />);
    expect(screen.getByText(/Termine —/)).toBeInTheDocument();

    await u.click(screen.getByTestId('layer-toggle-appointment'));
    await waitFor(() => expect(screen.queryByText(/Termine —/)).not.toBeInTheDocument());

    const stored = JSON.parse(window.localStorage.getItem('kitz.calendar.layerVisibility.v1') ?? '{}');
    expect(stored.appointment).toBe(false);
  });

  it('reads persisted toggle state from localStorage on mount', () => {
    window.localStorage.setItem(
      'kitz.calendar.layerVisibility.v1',
      JSON.stringify({ appointment: false }),
    );
    setEvents();
    render(<UnifiedCalendar />);
    expect(screen.queryByText(/Termine —/)).not.toBeInTheDocument();
  });

  it('ignores other layer toggles for now but still persists them', async () => {
    const u = userEvent.setup();
    setEvents();
    render(<UnifiedCalendar />);
    await u.click(screen.getByTestId('layer-toggle-leave'));
    const stored = JSON.parse(window.localStorage.getItem('kitz.calendar.layerVisibility.v1') ?? '{}');
    expect(stored.leave).toBe(false);
    // The leave toggle does not (yet) hide LeaveCalendar — Sprint 5.
    expect(screen.getByTestId('leave-calendar-stub')).toBeInTheDocument();
  });
});
