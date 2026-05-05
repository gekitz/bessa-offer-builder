import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listLeaveRequestsMock = vi.fn();
const listEmployeesMock = vi.fn();
const listLeaveTypesMock = vi.fn();
const decideLeaveRequestMock = vi.fn();
const cancelLeaveRequestMock = vi.fn();
const listLeaveBalancesMock = vi.fn();
const getLeaveAttachmentSignedUrlMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
  listEmployees: (opts?: unknown) => listEmployeesMock(opts),
  listLeaveTypes: () => listLeaveTypesMock(),
  decideLeaveRequest: (...args: unknown[]) => decideLeaveRequestMock(...args),
  cancelLeaveRequest: (...args: unknown[]) => cancelLeaveRequestMock(...args),
  listLeaveBalances: (id: string, year: number) => listLeaveBalancesMock(id, year),
  getLeaveAttachmentSignedUrl: (path: string) => getLeaveAttachmentSignedUrlMock(path),
}));

const buildICalendarMock = vi.fn<(opts: unknown) => string>(() => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR');
vi.mock('../../lib/ical', () => ({
  buildICalendar: (opts: unknown) => buildICalendarMock(opts),
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
  listLeaveBalancesMock.mockReset().mockResolvedValue([]);
  getLeaveAttachmentSignedUrlMock.mockReset().mockResolvedValue('https://signed/example');
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

  it('appends "(½ Anfang)" / "(½ Ende)" markers to the date range when half-day flags are set', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-half-start',
        employeeId: stefan.id,
        leaveTypeCode: 'urlaub',
        startDate: '2026-08-10',
        endDate: '2026-08-15',
        halfDayStart: true,
        halfDayEnd: false,
        status: 'approved',
      },
      {
        id: 'lr-half-end',
        employeeId: mario.id,
        leaveTypeCode: 'urlaub',
        startDate: '2026-08-10',
        endDate: '2026-08-15',
        halfDayStart: false,
        halfDayEnd: true,
        status: 'approved',
      },
      {
        id: 'lr-half-both',
        employeeId: 'gkitz-id',
        leaveTypeCode: 'urlaub',
        startDate: '2026-08-10',
        endDate: '2026-08-15',
        halfDayStart: true,
        halfDayEnd: true,
        status: 'approved',
      },
    ]);
    listEmployeesMock.mockResolvedValue([
      stefan,
      mario,
      { id: 'gkitz-id', code: 'gkitz', name: 'Georg Kitz', standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime' as const, active: true },
    ]);
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    // Each marker case appears as its own row.
    expect(screen.getByText(/15\.08\.2026 \(½ Anfang\)$/)).toBeInTheDocument();
    expect(screen.getByText(/15\.08\.2026 \(½ Ende\)$/)).toBeInTheDocument();
    expect(screen.getByText(/15\.08\.2026 \(½ Anfang, ½ Ende\)$/)).toBeInTheDocument();
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

describe('LeaveRequestsList — iCal export button', () => {
  // jsdom doesn't ship URL.createObjectURL / URL.revokeObjectURL
  // natively, so we install no-op stubs once per test and leave them
  // in place — the delayed setTimeout that revokes the blob URL
  // can fire after afterEach if we restore originals.
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  it('renders an Export button in the header', async () => {
    render(<LeaveRequestsList />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(screen.getByLabelText('Als iCal exportieren')).toBeInTheDocument();
  });

  it('disables the Export button when there are no rows to export', async () => {
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Keine Anträge.')).toBeInTheDocument());
    expect(screen.getByLabelText('Als iCal exportieren')).toBeDisabled();
  });

  it('clicking Export creates a blob and triggers a download anchor', async () => {
    const u = userEvent.setup();
    let capturedBlob: Blob | null = null;
    const createSpy = vi.fn((b: Blob) => {
      capturedBlob = b;
      return 'blob:mock-url';
    });
    URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;

    // Spy on the anchor's click() so we can assert the download was triggered
    // without the test actually navigating.
    const anchorClicks: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createSpyEl = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = () => { anchorClicks.push(anchor); };
      }
      return el;
    });

    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByLabelText('Als iCal exportieren'));

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.type).toBe('text/calendar;charset=utf-8');
    expect(capturedBlob!.size).toBeGreaterThan(0);

    expect(anchorClicks).toHaveLength(1);
    expect(anchorClicks[0]!.download).toBe('kitz-urlaub.ics');
    expect(anchorClicks[0]!.href).toContain('blob:mock-url');

    createSpyEl.mockRestore();
  });

  it('exports only the visible requests (respects status tab filter)', async () => {
    buildICalendarMock.mockClear();
    const u = userEvent.setup();
    listLeaveRequestsMock.mockResolvedValue([
      { id: 'pend',     employeeId: stefan.id, leaveTypeCode: 'urlaub',       startDate: '2026-08-10', endDate: '2026-08-15', status: 'pending' },
      { id: 'approved', employeeId: mario.id,  leaveTypeCode: 'krankenstand', startDate: '2026-05-04', endDate: '2026-05-04', status: 'approved' },
    ]);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
      if (tag === 'a') (el as HTMLAnchorElement).click = () => {};
      return el;
    });

    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    // Default tab "Offen" — only the pending request is visible.
    await u.click(screen.getByLabelText('Als iCal exportieren'));

    expect(buildICalendarMock).toHaveBeenCalledTimes(1);
    const opts = buildICalendarMock.mock.calls[0]?.[0] as { leaves: Array<{ id: string }> };
    expect(opts.leaves.map((l) => l.id)).toEqual(['pend']);

    // Switch to Genehmigt — only Mario's record visible.
    buildICalendarMock.mockClear();
    await u.click(screen.getByRole('button', { name: /^Genehmigt / }));
    await u.click(screen.getByLabelText('Als iCal exportieren'));
    const opts2 = buildICalendarMock.mock.calls[0]?.[0] as { leaves: Array<{ id: string }> };
    expect(opts2.leaves.map((l) => l.id)).toEqual(['approved']);
  });
});

describe('LeaveRequestsList — status tabs', () => {
  it('hides the tab row by default', async () => {
    render(<LeaveRequestsList />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    for (const label of ['Alle', 'Offen', 'Genehmigt', 'Abgelehnt', 'Storniert']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('renders all five tabs when showStatusTabs is on', async () => {
    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    // Tab labels include the count, e.g. "Offen (1)" — match by prefix.
    for (const label of ['Alle', 'Offen', 'Genehmigt', 'Abgelehnt', 'Storniert']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label} `) })).toBeInTheDocument();
    }
  });

  it('fetches the unfiltered set so counts are accurate (status=undefined)', async () => {
    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith({
      status: undefined,
      employeeId: undefined,
    });
    // Default tab "Offen" highlights with red.
    expect(screen.getByRole('button', { name: /^Offen/ }).className).toMatch(/bg-red-600/);
  });

  it('shows accurate per-status counts on each tab label', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub', startDate: '2026-08-10', endDate: '2026-08-15', status: 'pending' },
      { id: '2', employeeId: mario.id,  leaveTypeCode: 'urlaub', startDate: '2026-08-10', endDate: '2026-08-15', status: 'pending' },
      { id: '3', employeeId: stefan.id, leaveTypeCode: 'urlaub', startDate: '2026-09-01', endDate: '2026-09-05', status: 'approved' },
      { id: '4', employeeId: mario.id,  leaveTypeCode: 'urlaub', startDate: '2026-09-01', endDate: '2026-09-05', status: 'rejected' },
      { id: '5', employeeId: stefan.id, leaveTypeCode: 'urlaub', startDate: '2026-10-01', endDate: '2026-10-05', status: 'cancelled' },
    ]);
    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Alle/ })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Alle (5)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offen (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Genehmigt (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abgelehnt (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Storniert (1)' })).toBeInTheDocument();
  });

  it('filters client-side when a tab is selected, no extra API calls', async () => {
    const u = userEvent.setup();
    listLeaveRequestsMock.mockResolvedValue([
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub', startDate: '2026-08-10', endDate: '2026-08-15', status: 'pending' },
      { id: '2', employeeId: mario.id,  leaveTypeCode: 'urlaub', startDate: '2026-09-01', endDate: '2026-09-05', status: 'approved' },
    ]);
    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Stefan Bauer')).toBeInTheDocument();
    expect(screen.queryByText('Mario Graf')).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /Genehmigt/ }));
    // No refetch — purely a client-side filter switch.
    expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Stefan Bauer')).not.toBeInTheDocument();
    expect(screen.getByText('Mario Graf')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /^Alle/ }));
    expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Stefan Bauer')).toBeInTheDocument();
    expect(screen.getByText('Mario Graf')).toBeInTheDocument();
  });

  it('header count reflects the scope total, not the filtered visible count', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub',       startDate: '2026-08-10', endDate: '2026-08-15', status: 'rejected' },
      { id: '2', employeeId: stefan.id, leaveTypeCode: 'krankenstand', startDate: '2026-09-01', endDate: '2026-09-02', status: 'approved' },
    ]);
    render(<LeaveRequestsList showStatusTabs />);
    // Default tab is "Offen" -> visible rows = 0, but header should
    // still report 2 (the unfiltered scope total) so it matches the
    // "Alle (2)" pill instead of contradicting it.
    await waitFor(() => expect(screen.getByText('Anträge (2)')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Alle (2)' })).toBeInTheDocument();
    expect(screen.getByText('Keine Anträge.')).toBeInTheDocument();
  });

  it('filters visible rows + tab counts when an Art is selected', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub',       startDate: '2026-08-10', endDate: '2026-08-15', status: 'pending' },
      { id: '2', employeeId: mario.id,  leaveTypeCode: 'krankenstand', startDate: '2026-05-04', endDate: '2026-05-04', status: 'approved' },
      { id: '3', employeeId: stefan.id, leaveTypeCode: 'krankenstand', startDate: '2026-09-01', endDate: '2026-09-02', status: 'rejected' },
    ]);
    const u = userEvent.setup();
    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    // Default: "Alle Arten" — Alle (3), Offen (1), Genehmigt (1), Abgelehnt (1)
    expect(screen.getByRole('button', { name: 'Alle (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offen (1)' })).toBeInTheDocument();

    // Filter to Krankenstand
    await u.click(screen.getByRole('button', { name: 'Art filtern' }));
    await u.click(await screen.findByRole('option', { name: 'Krankenstand' }));

    // Counts now reflect only the Krankenstand subset (2 of the 3)
    expect(screen.getByRole('button', { name: 'Alle (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offen (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Genehmigt (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abgelehnt (1)' })).toBeInTheDocument();

    // Default tab is Offen — but no pending Krankenstand exists, so empty.
    expect(screen.getByText('Keine Anträge.')).toBeInTheDocument();

    // Switch to Genehmigt to see Mario's Krankenstand
    await u.click(screen.getByRole('button', { name: /^Genehmigt / }));
    expect(screen.getByText('Mario Graf')).toBeInTheDocument();
    expect(screen.queryByText('Stefan Bauer')).not.toBeInTheDocument();
  });

  it('hides the type filter when leaveTypes haven\'t loaded yet', async () => {
    listLeaveTypesMock.mockResolvedValue([]);
    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Art filtern' })).not.toBeInTheDocument();
  });

  it('renders the empty state below the toggle + tab rows (DOM order)', async () => {
    listLeaveRequestsMock.mockResolvedValue([]);
    render(<LeaveRequestsList showStatusTabs myEmployeeId="e-1" emptyLabel="Keine Anträge." />);
    await waitFor(() => expect(screen.getByText('Keine Anträge.')).toBeInTheDocument());

    const filterRow = screen.getByRole('button', { name: 'Mitarbeiter filtern' });
    const offenTab = screen.getByRole('button', { name: /^Offen / });
    const empty = screen.getByText('Keine Anträge.');

    // Bit 4 of compareDocumentPosition = "the other node follows".
    // Filter row and tabs must come before the empty state.
    expect(filterRow.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(offenTab.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the empty-label when the selected tab has no rows', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub', startDate: '2026-08-10', endDate: '2026-08-15', status: 'pending' },
    ]);
    const u = userEvent.setup();
    render(<LeaveRequestsList showStatusTabs />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Storniert/ }));
    expect(screen.getByText('Keine Anträge.')).toBeInTheDocument();
  });

  it('overrides the statusFilter prop when tabs are enabled (fetches the unfiltered set)', async () => {
    // Even though the parent passes statusFilter='approved', tabs
    // are the source of truth — the API gets `status: undefined`.
    render(<LeaveRequestsList showStatusTabs statusFilter="approved" />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith({
      status: undefined,
      employeeId: undefined,
    });
  });
});

describe('LeaveRequestsList — Mitarbeiter filter', () => {
  it('hides the Mitarbeiter dropdown when myEmployeeId is not provided', async () => {
    render(<LeaveRequestsList />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Mitarbeiter filtern' })).not.toBeInTheDocument();
  });

  it('renders the Mitarbeiter dropdown when myEmployeeId is provided', async () => {
    render(<LeaveRequestsList myEmployeeId="e-1" />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Mitarbeiter filtern' })).toBeInTheDocument();
  });

  it('defaults to "Alle Mitarbeiter" — no employee filter on the API call', async () => {
    render(<LeaveRequestsList myEmployeeId="e-1" />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: undefined }),
    );
    expect(screen.getByRole('button', { name: 'Mitarbeiter filtern' }).textContent).toContain('Alle Mitarbeiter');
  });

  it('respects defaultMyOnly=true and seeds the API with the employee id', async () => {
    render(<LeaveRequestsList myEmployeeId="e-1" defaultMyOnly />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e-1' }),
    );
    expect(screen.getByRole('button', { name: 'Mitarbeiter filtern' }).textContent).toContain('Nur meine');
  });

  it('refetches with the employee id when switched to "Nur meine" via the dropdown', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList myEmployeeId="e-1" />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1));

    await u.click(screen.getByRole('button', { name: 'Mitarbeiter filtern' }));
    await u.click(await screen.findByRole('option', { name: 'Nur meine' }));
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(2));
    expect(listLeaveRequestsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ employeeId: 'e-1' }),
    );

    await u.click(screen.getByRole('button', { name: 'Mitarbeiter filtern' }));
    await u.click(await screen.findByRole('option', { name: 'Alle Mitarbeiter' }));
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(3));
    expect(listLeaveRequestsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ employeeId: undefined }),
    );
  });

  it('combines tabs + toggle: tabs override status, toggle controls employeeId', async () => {
    render(<LeaveRequestsList showStatusTabs myEmployeeId="e-1" defaultMyOnly />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith({
      status: undefined,
      employeeId: 'e-1',
    });
  });

  it('explicit employeeId prop wins over the toggle', async () => {
    render(<LeaveRequestsList myEmployeeId="e-1" defaultMyOnly employeeId="other" />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());
    expect(listLeaveRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'other' }),
    );
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

  it('opens the DecisionDialog when Genehmigen is clicked', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));
    expect(await screen.findByText('Antrag genehmigen')).toBeInTheDocument();
    // Dialog summary mentions employee + type + date range.
    expect(screen.getByText(/Stefan Bauer · Urlaub · 10\.08\.2026.*15\.08\.2026/)).toBeInTheDocument();
    // The API has not been called yet — the dialog gates it.
    expect(decideLeaveRequestMock).not.toHaveBeenCalled();
  });

  it('confirming the dialog calls the API with the typed note and refetches', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(listLeaveRequestsMock).toHaveBeenCalledTimes(1);

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));
    await screen.findByText('Antrag genehmigen');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'OK, Vertretung Mario' } });
    // The dialog button is "Genehmigen" — there are two on screen
    // (the row trigger + the dialog confirm). The dialog one is
    // inside the modal, scoped to the role.
    const confirmButtons = screen.getAllByRole('button', { name: 'Genehmigen' });
    await u.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(decideLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(decideLeaveRequestMock).toHaveBeenCalledWith('lr-1', 'approved', null, 'OK, Vertretung Mario');
    // listLeaveRequests is called: 1× on mount, 1× by DecisionDialog
    // for the year context, 1× refetch after success = 3 total.
    const refetchCalls = listLeaveRequestsMock.mock.calls.filter(
      (c) => !(c[0] as Record<string, unknown>)?.rangeStart,
    );
    expect(refetchCalls.length).toBeGreaterThanOrEqual(2);
    // Dialog dismissed after success.
    expect(screen.queryByText('Antrag genehmigen')).not.toBeInTheDocument();
  });

  it('confirming with no note sends undefined for decision_note', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Ablehnen/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Ablehnen' });
    await u.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(decideLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(decideLeaveRequestMock).toHaveBeenCalledWith('lr-1', 'rejected', null, undefined);
  });

  it('passes decidedBy to decideLeaveRequest when the prop is set', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide decidedBy="gkitz-id" />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Genehmigen' });
    await u.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(decideLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(decideLeaveRequestMock).toHaveBeenCalledWith('lr-1', 'approved', 'gkitz-id', undefined);
  });

  it('Abbrechen on the dialog closes it without calling the API', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));
    await screen.findByText('Antrag genehmigen');
    await u.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.queryByText('Antrag genehmigen')).not.toBeInTheDocument();
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
    expect(cancelLeaveRequestMock).toHaveBeenCalledWith('lr-1', { actorId: null });
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalledTimes(2));
  });

  it('shows the API error inline in the dialog when decideLeaveRequest rejects', async () => {
    decideLeaveRequestMock.mockRejectedValueOnce(new Error('rls denied'));
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: /Genehmigen/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Genehmigen' });
    await u.click(confirmButtons[confirmButtons.length - 1]!);

    expect(await screen.findByText(/Fehler beim Speichern/)).toBeInTheDocument();
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
    // Dialog stays open so the user can retry or cancel.
    expect(screen.getByText('Antrag genehmigen')).toBeInTheDocument();
  });

  it('does not render the Bearbeiten button when onEdit is omitted', async () => {
    render(<LeaveRequestsList actionable />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('renders Bearbeiten only on pending rows when onEdit is provided', async () => {
    const onEdit = vi.fn();
    render(<LeaveRequestsList actionable onEdit={onEdit} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    // Stefan is pending -> button rendered. Mario is approved ->
    // button not rendered. So exactly one Bearbeiten button.
    const buttons = screen.getAllByRole('button', { name: 'Bearbeiten' });
    expect(buttons).toHaveLength(1);
  });

  it('clicking Bearbeiten invokes the onEdit callback with the full request', async () => {
    const onEdit = vi.fn();
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable onEdit={onEdit} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({
      id: 'lr-1',
      employeeId: stefan.id,
      status: 'pending',
    }));
  });

  it('renders the decisionNote on a decided row', async () => {
    listLeaveRequestsMock.mockResolvedValue([
      {
        id: 'lr-decided',
        employeeId: stefan.id,
        leaveTypeCode: 'urlaub',
        startDate: '2026-08-10',
        endDate: '2026-08-15',
        status: 'rejected',
        decisionNote: 'Konflikt mit MFP-Lehrling',
        decidedAt: '2026-05-04T10:00:00Z',
      },
    ]);
    render(<LeaveRequestsList actionable />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.getByText(/Entscheidung:/)).toBeInTheDocument();
    expect(screen.getByText(/Konflikt mit MFP-Lehrling/)).toBeInTheDocument();
  });
});

describe('LeaveRequestsList — hideOthersDecidedRequests', () => {
  // Build a varied set: own pending, own rejected (with note), peer
  // pending, peer approved, peer rejected (with note), peer cancelled.
  // The viewer is "stefan" (myEmployeeId).
  const ownPending: LeaveRequest & { id: string } = {
    id: 'lr-own-pending', employeeId: stefan.id, leaveTypeCode: 'urlaub',
    startDate: '2026-08-10', endDate: '2026-08-15', status: 'pending',
  };
  const ownRejected: LeaveRequest & { id: string } = {
    id: 'lr-own-rejected', employeeId: stefan.id, leaveTypeCode: 'urlaub',
    startDate: '2026-09-10', endDate: '2026-09-15', status: 'rejected',
    decisionNote: 'Mein eigener Antrag wurde abgelehnt',
  };
  const peerPending: LeaveRequest & { id: string } = {
    id: 'lr-peer-pending', employeeId: mario.id, leaveTypeCode: 'urlaub',
    startDate: '2026-08-20', endDate: '2026-08-25', status: 'pending',
  };
  const peerApproved: LeaveRequest & { id: string } = {
    id: 'lr-peer-approved', employeeId: mario.id, leaveTypeCode: 'urlaub',
    startDate: '2026-09-20', endDate: '2026-09-25', status: 'approved',
  };
  const peerRejected: LeaveRequest & { id: string } = {
    id: 'lr-peer-rejected', employeeId: mario.id, leaveTypeCode: 'urlaub',
    startDate: '2026-10-10', endDate: '2026-10-15', status: 'rejected',
    decisionNote: 'PRIVATE: Mario wurde abgelehnt',
  };
  const peerCancelled: LeaveRequest & { id: string } = {
    id: 'lr-peer-cancelled', employeeId: mario.id, leaveTypeCode: 'urlaub',
    startDate: '2026-11-10', endDate: '2026-11-15', status: 'cancelled',
  };

  beforeEach(() => {
    listLeaveRequestsMock.mockResolvedValue([
      ownPending, ownRejected, peerPending, peerApproved, peerRejected, peerCancelled,
    ]);
  });

  it('hides peers\' rejected and cancelled rows when the prop is on', async () => {
    render(<LeaveRequestsList showStatusTabs myEmployeeId={stefan.id} hideOthersDecidedRequests />);
    await waitFor(() => expect(screen.getAllByText('Stefan Bauer').length).toBeGreaterThan(0));

    // Peer pending + approved still visible
    expect(screen.getAllByText('Mario Graf').length).toBeGreaterThan(0);
    // The peer-rejected note must NOT leak.
    expect(screen.queryByText(/PRIVATE: Mario/)).not.toBeInTheDocument();
  });

  it('still shows the viewer\'s own rejected/cancelled rows', async () => {
    render(<LeaveRequestsList showStatusTabs myEmployeeId={stefan.id} hideOthersDecidedRequests />);
    await waitFor(() => expect(screen.getAllByText('Stefan Bauer').length).toBeGreaterThan(0));

    // Switch to "Abgelehnt" tab.
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /Abgelehnt/ }));
    expect(screen.getByText(/Mein eigener Antrag wurde abgelehnt/)).toBeInTheDocument();
  });

  it('tab counts reflect the scoped (post-hide) set', async () => {
    render(<LeaveRequestsList showStatusTabs myEmployeeId={stefan.id} hideOthersDecidedRequests />);
    await waitFor(() => expect(screen.getAllByText('Stefan Bauer').length).toBeGreaterThan(0));

    // 6 rows fetched, but peer rejected + cancelled hidden →
    // Alle = 4, Offen = 2, Genehmigt = 1, Abgelehnt = 1, Storniert = 0.
    expect(screen.getByRole('button', { name: /Alle \(4\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Offen \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Genehmigt \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abgelehnt \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Storniert \(0\)/ })).toBeInTheDocument();
  });

  it('approver mode (prop off) sees everything including peers\' decision notes', async () => {
    render(<LeaveRequestsList showStatusTabs myEmployeeId={stefan.id} canDecide />);
    await waitFor(() => expect(screen.getAllByText('Stefan Bauer').length).toBeGreaterThan(0));
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /Abgelehnt \(2\)/ }));
    expect(screen.getByText(/PRIVATE: Mario/)).toBeInTheDocument();
  });

  it('does not show edit or cancel controls for peer rows to non-approvers', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownPending, peerPending]);
    const onEdit = vi.fn();

    render(
      <LeaveRequestsList
        actionable
        showStatusTabs
        myEmployeeId={stefan.id}
        defaultMyOnly={false}
        onEdit={onEdit}
      />,
    );
    await waitFor(() => expect(screen.getByText('Mario Graf')).toBeInTheDocument());

    const ownRow = screen.getByText('Stefan Bauer').closest('li') as HTMLElement;
    const peerRow = screen.getByText('Mario Graf').closest('li') as HTMLElement;

    expect(within(ownRow).getByText('Bearbeiten')).toBeInTheDocument();
    expect(within(ownRow).getByText('Stornieren')).toBeInTheDocument();
    expect(within(peerRow).queryByText('Bearbeiten')).not.toBeInTheDocument();
    expect(within(peerRow).queryByText('Stornieren')).not.toBeInTheDocument();
  });
});

describe('LeaveRequestsList — past-leave cancel gating', () => {
  // The component reads "today" from new Date() at render. Pin the
  // system clock so assertions are deterministic. shouldAdvanceTime
  // keeps setTimeout-based promise waits (waitFor) working.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-05T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ownPastApproved: LeaveRequest & { id: string } = {
    id: 'lr-own-past',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-04-13',
    endDate: '2026-04-17',
    status: 'approved',
  };
  const ownFutureApproved: LeaveRequest & { id: string } = {
    id: 'lr-own-future',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-08-10',
    endDate: '2026-08-15',
    status: 'approved',
  };
  const ownOngoingApproved: LeaveRequest & { id: string } = {
    id: 'lr-own-ongoing',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-05-04',
    endDate: '2026-05-07',
    status: 'approved',
  };
  const ownPastPending: LeaveRequest & { id: string } = {
    id: 'lr-own-past-pending',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-04-13',
    endDate: '2026-04-17',
    status: 'pending',
  };

  it('hides Stornieren on a fully-past approved leave for the requester', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownPastApproved]);
    render(<LeaveRequestsList actionable myEmployeeId={stefan.id} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Stornieren/ })).not.toBeInTheDocument();
  });

  it('keeps Stornieren on a future approved leave', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownFutureApproved]);
    render(<LeaveRequestsList actionable myEmployeeId={stefan.id} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Stornieren/ })).toBeInTheDocument();
  });

  it('keeps Stornieren on an in-progress leave (endDate >= today)', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownOngoingApproved]);
    render(<LeaveRequestsList actionable myEmployeeId={stefan.id} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Stornieren/ })).toBeInTheDocument();
  });

  it('keeps Stornieren on a fully-past pending leave (status guards apply only to approved)', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownPastPending]);
    render(<LeaveRequestsList actionable myEmployeeId={stefan.id} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Stornieren/ })).toBeInTheDocument();
  });

  it('approvers can still cancel a fully-past approved leave (HR override)', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownPastApproved]);
    render(<LeaveRequestsList actionable canDecide />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Stornieren/ })).toBeInTheDocument();
  });
});

describe('LeaveRequestsList — Krankmeldung link', () => {
  const krankWithAttachment: LeaveRequest & { id: string } = {
    id: 'lr-krank',
    employeeId: stefan.id,
    leaveTypeCode: 'krankenstand',
    startDate: '2026-04-13',
    endDate: '2026-04-15',
    status: 'approved',
    attachmentPath: 'lr-krank/123-krankmeldung.pdf',
  };

  const krankWithoutAttachment: LeaveRequest & { id: string } = {
    id: 'lr-krank-2',
    employeeId: mario.id,
    leaveTypeCode: 'krankenstand',
    startDate: '2026-04-20',
    endDate: '2026-04-21',
    status: 'approved',
  };

  it('renders the "Krankmeldung öffnen" button when attachmentPath is set', async () => {
    listLeaveRequestsMock.mockResolvedValue([krankWithAttachment, krankWithoutAttachment]);
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    expect(screen.getByTestId('attachment-link-lr-krank')).toBeInTheDocument();
    expect(screen.queryByTestId('attachment-link-lr-krank-2')).not.toBeInTheDocument();
  });

  it('clicking the link opens a signed URL in a new tab', async () => {
    listLeaveRequestsMock.mockResolvedValue([krankWithAttachment]);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const u = userEvent.setup();
    render(<LeaveRequestsList />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByTestId('attachment-link-lr-krank'));

    await waitFor(() => expect(getLeaveAttachmentSignedUrlMock).toHaveBeenCalledWith('lr-krank/123-krankmeldung.pdf'));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://signed/example', '_blank', 'noopener,noreferrer'));
    openSpy.mockRestore();
  });

  it('shows an inline error when the signed-url request fails', async () => {
    listLeaveRequestsMock.mockResolvedValue([krankWithAttachment]);
    getLeaveAttachmentSignedUrlMock.mockRejectedValue(new Error('expired'));
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByTestId('attachment-link-lr-krank'));
    expect(await screen.findByText(/expired/)).toBeInTheDocument();
  });
});

describe('LeaveRequestsList — per-employee filter for approvers', () => {
  it('does not include per-employee options for non-approvers', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList showStatusTabs myEmployeeId={stefan.id} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    await u.click(screen.getByRole('button', { name: 'Mitarbeiter filtern' }));

    expect(screen.getByRole('option', { name: /Alle Mitarbeiter/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Nur meine/ })).toBeInTheDocument();
    // Stefan is in the team but should NOT show as a filter option.
    expect(screen.queryByRole('option', { name: /Stefan Bauer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Mario Graf/ })).not.toBeInTheDocument();
  });

  it('approvers see every active employee as a filter option', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList showStatusTabs canDecide myEmployeeId={stefan.id} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    await u.click(screen.getByRole('button', { name: 'Mitarbeiter filtern' }));

    expect(screen.getByRole('option', { name: /Stefan Bauer/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Mario Graf/ })).toBeInTheDocument();
  });

  it('selecting a specific employee filters the API call to that id', async () => {
    const u = userEvent.setup();
    render(<LeaveRequestsList canDecide myEmployeeId={stefan.id} />);
    await waitFor(() => expect(listLeaveRequestsMock).toHaveBeenCalled());

    await u.click(screen.getByRole('button', { name: 'Mitarbeiter filtern' }));
    await u.click(screen.getByRole('option', { name: /Mario Graf/ }));

    await waitFor(() => {
      const last = listLeaveRequestsMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(last.employeeId).toBe(mario.id);
    });
  });
});

describe('LeaveRequestsList — approver retroactive edit', () => {
  const ownApprovedPast: LeaveRequest & { id: string } = {
    id: 'lr-past', employeeId: stefan.id, leaveTypeCode: 'urlaub',
    startDate: '2026-04-13', endDate: '2026-04-17', status: 'approved',
  };

  it('non-approvers cannot edit an approved leave (existing behaviour)', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownApprovedPast]);
    render(<LeaveRequestsList actionable myEmployeeId={stefan.id} onEdit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('approvers see Bearbeiten on an approved (or past) leave', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownApprovedPast]);
    render(<LeaveRequestsList actionable canDecide onEdit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
  });

  it('clicking Bearbeiten on an approved leave still calls onEdit with the row', async () => {
    listLeaveRequestsMock.mockResolvedValue([ownApprovedPast]);
    const onEdit = vi.fn();
    const u = userEvent.setup();
    render(<LeaveRequestsList actionable canDecide onEdit={onEdit} />);
    await waitFor(() => expect(screen.getByText('Stefan Bauer')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'lr-past', status: 'approved' }));
  });
});
