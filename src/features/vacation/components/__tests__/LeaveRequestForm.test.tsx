import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------
// API mocks. Each test customises the responses by reassigning
// these vars before render.
// ---------------------------------------------------------

const listLeaveTypesMock = vi.fn();
const listSubstitutesMock = vi.fn();
const loadRuleContextMock = vi.fn();
const createLeaveRequestMock = vi.fn();
const updateLeaveRequestMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveTypes: () => listLeaveTypesMock(),
  listSubstitutes: (id?: string) => listSubstitutesMock(id),
  loadRuleContext: (opts?: unknown) => loadRuleContextMock(opts),
  createLeaveRequest: (input: unknown) => createLeaveRequestMock(input),
  updateLeaveRequest: (id: string, patch: unknown) => updateLeaveRequestMock(id, patch),
}));

import LeaveRequestForm from '../LeaveRequestForm';
import type { CoverageRule, Employee, LeaveRequest, RuleContext } from '../../types';

// ---------------------------------------------------------
// Fixtures
// ---------------------------------------------------------

const stefan: Employee = {
  id: 'sbauer-id', code: 'sbauer', name: 'Stefan Bauer',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const mario: Employee = {
  id: 'mgraf-id', code: 'mgraf', name: 'Mario Graf',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const georg: Employee = {
  id: 'gkitz-id', code: 'gkitz', name: 'Georg Kitz',
  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const stefanMarioBlock: CoverageRule = {
  id: 'cr-1',
  name: 'Stefan ↔ Mario MFP Wolfsberg (hard block)',
  appliesToEmployees: [stefan.id, mario.id],
  maxConcurrentOnLeave: 1,
  kind: 'hard',
  active: true,
};

function baseRuleContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    today: '2026-05-04',
    employees: [stefan, mario, georg],
    roles: [],
    existingLeaves: [],
    coverageRules: [stefanMarioBlock],
    blackouts: [],
    ...overrides,
  };
}

const ALL_LEAVE_TYPES = [
  { id: 1, code: 'urlaub' as const, label: 'Urlaub', deductsFromBalance: true },
  { id: 2, code: 'zeitausgleich' as const, label: 'Zeitausgleich', deductsFromBalance: false },
  { id: 3, code: 'krankenstand' as const, label: 'Krankenstand', deductsFromBalance: false },
];

// ---------------------------------------------------------
// Render helper — pre-fills the date pickers so tests don't have
// to navigate the calendar. Verifies the form is hydrated before
// returning.
// ---------------------------------------------------------

interface RenderOpts {
  startDate?: string;
  endDate?: string;
  defaultEmployeeId?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

async function renderForm(opts: RenderOpts = {}) {
  const utils = render(
    <LeaveRequestForm
      employees={[stefan, mario, georg]}
      defaultEmployeeId={opts.defaultEmployeeId ?? stefan.id}
      defaultStartDate={opts.startDate}
      defaultEndDate={opts.endDate}
      onClose={opts.onClose ?? (() => {})}
      onSuccess={opts.onSuccess ?? (() => {})}
    />,
  );
  await waitFor(() => expect(loadRuleContextMock).toHaveBeenCalled());
  return utils;
}

async function pickLeaveType(label: string) {
  const u = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'Art der Abwesenheit' });
  await u.click(trigger);
  const option = await screen.findByRole('option', { name: new RegExp(label) });
  await u.click(option);
}

// ---------------------------------------------------------
// Setup
// ---------------------------------------------------------

beforeEach(() => {
  listLeaveTypesMock.mockReset().mockResolvedValue(ALL_LEAVE_TYPES);
  listSubstitutesMock.mockReset().mockResolvedValue([]);
  loadRuleContextMock.mockReset().mockResolvedValue(baseRuleContext());
  createLeaveRequestMock.mockReset().mockResolvedValue({
    id: 'lr-new',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-08-10',
    endDate: '2026-08-15',
  });
  updateLeaveRequestMock.mockReset().mockResolvedValue({
    id: 'lr-existing',
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-08-12',
    endDate: '2026-08-18',
  });
});

describe('LeaveRequestForm — validation rendering', () => {
  it('shows a leadTime violation when an Urlaub start date is too soon', async () => {
    // Today (in mocked rule context) is 2026-05-04. May 10 / May 15
    // is well under the 28-day Urlaub leadTime threshold.
    await renderForm({ startDate: '2026-05-10', endDate: '2026-05-15' });

    expect(await screen.findByText(/Antrag wird so nicht akzeptiert/)).toBeInTheDocument();
    expect(screen.getByText(/mindestens 28 Tage im Voraus/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Antrag einreichen/ })).toBeDisabled();
  });

  it('passes leadTime when Urlaub starts >= 28 days out and submit becomes enabled', async () => {
    await renderForm({ startDate: '2026-08-10', endDate: '2026-08-15' });

    expect(await screen.findByText(/Alle Regeln erfüllt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Antrag einreichen/ })).not.toBeDisabled();
  });

  it('exempts Krankenstand from the 28-day leadTime', async () => {
    await renderForm({ startDate: '2026-05-10', endDate: '2026-05-11' });
    await pickLeaveType('Krankenstand');

    expect(await screen.findByText(/Alle Regeln erfüllt/)).toBeInTheDocument();
  });

  it('blocks the request when the Stefan ↔ Mario hard rule overlaps', async () => {
    const overlap: LeaveRequest & { id: string } = {
      id: 'mario-existing',
      employeeId: mario.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-08',
      endDate: '2026-08-20',
      status: 'approved',
    };
    loadRuleContextMock.mockResolvedValue(baseRuleContext({ existingLeaves: [overlap] }));

    await renderForm({ startDate: '2026-08-10', endDate: '2026-08-15' });

    expect(await screen.findByText(/Antrag wird so nicht akzeptiert/)).toBeInTheDocument();
    expect(screen.getByText(/Stefan ↔ Mario/)).toBeInTheDocument();
    expect(screen.getByText(/Mario Graf/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Antrag einreichen/ })).toBeDisabled();
  });

  it('passes for Stefan when the only Mario leave on file is rejected', async () => {
    const rejected: LeaveRequest & { id: string } = {
      id: 'mario-rejected',
      employeeId: mario.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-08',
      endDate: '2026-08-20',
      status: 'rejected',
    };
    loadRuleContextMock.mockResolvedValue(baseRuleContext({ existingLeaves: [rejected] }));

    await renderForm({ startDate: '2026-08-10', endDate: '2026-08-15' });

    expect(await screen.findByText(/Alle Regeln erfüllt/)).toBeInTheDocument();
  });

  it('shows the dateRange UI-level violation when end < start', async () => {
    await renderForm({ startDate: '2026-08-15', endDate: '2026-08-10' });

    expect(await screen.findByText(/Enddatum darf nicht vor dem Startdatum liegen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Antrag einreichen/ })).toBeDisabled();
  });
});

describe('LeaveRequestForm — submit', () => {
  it('submits with the right payload when the form is green', async () => {
    const onSuccess = vi.fn();
    const u = userEvent.setup();
    await renderForm({
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      onSuccess,
    });

    const reasonField = screen.getByPlaceholderText(/Familienurlaub/);
    fireEvent.change(reasonField, { target: { value: 'Sommerurlaub' } });

    const submit = await screen.findByRole('button', { name: /Antrag einreichen/ });
    await waitFor(() => expect(submit).not.toBeDisabled());
    await u.click(submit);

    await waitFor(() => expect(createLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(createLeaveRequestMock).toHaveBeenCalledWith({
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      halfDayStart: false,
      halfDayEnd: false,
      reason: 'Sommerurlaub',
      substituteId: undefined,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows the submit error inline when createLeaveRequest fails', async () => {
    createLeaveRequestMock.mockRejectedValueOnce(new Error('rls denied'));
    const u = userEvent.setup();

    await renderForm({ startDate: '2026-08-10', endDate: '2026-08-15' });

    const submit = await screen.findByRole('button', { name: /Antrag einreichen/ });
    await waitFor(() => expect(submit).not.toBeDisabled());
    await u.click(submit);

    expect(await screen.findByText(/Fehler beim Speichern/)).toBeInTheDocument();
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });

  it('renders the edit-mode title and CTA when existingRequest is supplied', async () => {
    const existing: LeaveRequest & { id: string } = {
      id: 'lr-existing',
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      halfDayStart: false,
      halfDayEnd: true,
      reason: 'Sommerurlaub',
      status: 'pending',
    };
    render(
      <LeaveRequestForm
        employees={[stefan, mario, georg]}
        existingRequest={existing}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    await waitFor(() => expect(loadRuleContextMock).toHaveBeenCalled());

    expect(screen.getByText('Antrag bearbeiten')).toBeInTheDocument();
    const submit = await screen.findByRole('button', { name: /Änderungen speichern/ });
    expect(submit).toBeInTheDocument();
  });

  it('edit submit calls updateLeaveRequest with the existing id and round-trips the form values', async () => {
    const existing: LeaveRequest & { id: string } = {
      id: 'lr-existing',
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      halfDayStart: true,
      halfDayEnd: false,
      reason: 'Sommerurlaub',
      substituteId: undefined,
      status: 'pending',
    };
    const onSuccess = vi.fn();
    const u = userEvent.setup();
    render(
      <LeaveRequestForm
        employees={[stefan, mario, georg]}
        existingRequest={existing}
        onClose={() => {}}
        onSuccess={onSuccess}
      />,
    );
    await waitFor(() => expect(loadRuleContextMock).toHaveBeenCalled());

    const submit = await screen.findByRole('button', { name: /Änderungen speichern/ });
    await waitFor(() => expect(submit).not.toBeDisabled());
    await u.click(submit);

    await waitFor(() => expect(updateLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(updateLeaveRequestMock).toHaveBeenCalledWith('lr-existing', {
      employeeId: stefan.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      halfDayStart: true,
      halfDayEnd: false,
      reason: 'Sommerurlaub',
      substituteId: undefined,
    });
    // Must NOT call createLeaveRequest in edit mode.
    expect(createLeaveRequestMock).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('keeps the submit button disabled and does not call the API when violations are present', async () => {
    // Same-week dates fail leadTime — submit must stay disabled.
    await renderForm({ startDate: '2026-05-10', endDate: '2026-05-11' });

    const submit = await screen.findByRole('button', { name: /Antrag einreichen/ });
    expect(submit).toBeDisabled();
    // fireEvent bypasses the user-event disabled check; clicking a
    // disabled <button> is a no-op in the DOM, so this confirms the
    // form really is gated by the disabled prop and not just visually.
    fireEvent.click(submit);
    expect(createLeaveRequestMock).not.toHaveBeenCalled();
  });
});

describe('LeaveRequestForm — lockEmployee', () => {
  it('shows the Mitarbeiter selector by default (approver flow)', async () => {
    render(
      <LeaveRequestForm
        employees={[stefan, mario, georg]}
        defaultEmployeeId={stefan.id}
        defaultStartDate="2026-08-10"
        defaultEndDate="2026-08-15"
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    await waitFor(() => expect(loadRuleContextMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Mitarbeiter' })).toBeInTheDocument();
  });

  it('hides the Mitarbeiter selector when lockEmployee is true', async () => {
    render(
      <LeaveRequestForm
        employees={[stefan, mario, georg]}
        defaultEmployeeId={stefan.id}
        defaultStartDate="2026-08-10"
        defaultEndDate="2026-08-15"
        lockEmployee
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    await waitFor(() => expect(loadRuleContextMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Mitarbeiter' })).not.toBeInTheDocument();
  });

  it('still submits with the locked-in employeeId when locked', async () => {
    const onSuccess = vi.fn();
    render(
      <LeaveRequestForm
        employees={[stefan, mario, georg]}
        defaultEmployeeId={stefan.id}
        defaultStartDate="2026-08-10"
        defaultEndDate="2026-08-15"
        lockEmployee
        onClose={() => {}}
        onSuccess={onSuccess}
      />,
    );
    await waitFor(() => expect(loadRuleContextMock).toHaveBeenCalled());

    const submit = await screen.findByRole('button', { name: /Antrag einreichen/ });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(createLeaveRequestMock).toHaveBeenCalledTimes(1));
    expect(createLeaveRequestMock.mock.calls[0][0]).toMatchObject({ employeeId: stefan.id });
  });
});
