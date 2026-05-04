import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listLeaveBalancesMock = vi.fn();
const listLeaveRequestsMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  listLeaveBalances: (id: string, year: number) => listLeaveBalancesMock(id, year),
  listLeaveRequests: (filter?: unknown) => listLeaveRequestsMock(filter),
}));

import DecisionDialog from '../DecisionDialog';

const baseSummary = 'Stefan Bauer · Urlaub · 10.08.2026 – 15.08.2026';

beforeEach(() => {
  listLeaveBalancesMock.mockReset().mockResolvedValue([]);
  listLeaveRequestsMock.mockReset().mockResolvedValue([]);
});

describe('DecisionDialog', () => {
  it('renders the approve title and CTA', () => {
    render(
      <DecisionDialog decision="approved" summary={baseSummary} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Antrag genehmigen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Genehmigen' })).toBeInTheDocument();
    expect(screen.getByText(baseSummary)).toBeInTheDocument();
  });

  it('renders the reject title and CTA', () => {
    render(
      <DecisionDialog decision="rejected" summary={baseSummary} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Antrag ablehnen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ablehnen' })).toBeInTheDocument();
  });

  it('forwards the typed note to onConfirm (trimmed)', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const u = userEvent.setup();
    render(
      <DecisionDialog decision="rejected" summary={baseSummary} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '  Konflikt mit Kollegen.  ' } });
    await u.click(screen.getByRole('button', { name: 'Ablehnen' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith('Konflikt mit Kollegen.');
  });

  it('passes undefined when the note is empty', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const u = userEvent.setup();
    render(
      <DecisionDialog decision="approved" summary={baseSummary} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    await u.click(screen.getByRole('button', { name: 'Genehmigen' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('Abbrechen closes the dialog without calling onConfirm', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(
      <DecisionDialog decision="approved" summary={baseSummary} onConfirm={onConfirm} onClose={onClose} />,
    );

    await u.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('clicking the backdrop closes the dialog', async () => {
    const onClose = vi.fn();
    render(
      <DecisionDialog decision="rejected" summary={baseSummary} onConfirm={vi.fn()} onClose={onClose} />,
    );
    // The backdrop is the outermost div with the click handler.
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the API error inline when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('rls denied'));
    const u = userEvent.setup();
    render(
      <DecisionDialog decision="rejected" summary={baseSummary} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    await u.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(await screen.findByText(/Fehler beim Speichern/)).toBeInTheDocument();
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });
});

describe('DecisionDialog — approver context', () => {
  it('does not render the context panel when no context props are provided', () => {
    render(
      <DecisionDialog decision="approved" summary={baseSummary} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('approver-context')).not.toBeInTheDocument();
    expect(listLeaveBalancesMock).not.toHaveBeenCalled();
  });

  it('renders the requester balance summary when Urlaub context is provided', async () => {
    listLeaveBalancesMock.mockResolvedValue([
      {
        id: 'lb-1',
        employeeId: 'sbauer-id',
        year: 2026,
        leaveTypeCode: 'urlaub',
        entitled: 25,
        carriedOver: 0,
        used: 0,
        planned: 0,
      },
    ]);
    listLeaveRequestsMock.mockResolvedValue([
      // 5 working days, pending — counted as planned.
      {
        id: 'lr-1',
        employeeId: 'sbauer-id',
        leaveTypeCode: 'urlaub',
        startDate: '2026-08-10',
        endDate: '2026-08-14',
        status: 'pending',
      },
    ]);

    render(
      <DecisionDialog
        decision="approved"
        summary={baseSummary}
        contextEmployeeId="sbauer-id"
        contextYear={2026}
        contextLeaveTypeCode="urlaub"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText(/von 25 Tagen verbleibend/)).toBeInTheDocument();
    // 25 - 5 planned = 20 remaining.
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(listLeaveBalancesMock).toHaveBeenCalledWith('sbauer-id', 2026);
    expect(listLeaveRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'sbauer-id',
      rangeStart: '2026-01-01',
      rangeEnd: '2026-12-31',
    }));
  });

  it('shows the empty-state when the employee has no balance row', async () => {
    listLeaveBalancesMock.mockResolvedValue([]);
    render(
      <DecisionDialog
        decision="approved"
        summary={baseSummary}
        contextEmployeeId="sbauer-id"
        contextYear={2026}
        contextLeaveTypeCode="urlaub"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Kein Urlaubsanspruch hinterlegt/)).toBeInTheDocument();
  });

  it('does not load balance data for non-Urlaub leave types', () => {
    render(
      <DecisionDialog
        decision="approved"
        summary={baseSummary}
        contextEmployeeId="sbauer-id"
        contextYear={2026}
        contextLeaveTypeCode="krankenstand"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(listLeaveBalancesMock).not.toHaveBeenCalled();
    expect(listLeaveRequestsMock).not.toHaveBeenCalled();
  });

  it('renders the substitute name when supplied', () => {
    render(
      <DecisionDialog
        decision="approved"
        summary={baseSummary}
        contextSubstituteName="Mario Graf"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('approver-context')).toBeInTheDocument();
    expect(screen.getByText('Mario Graf')).toBeInTheDocument();
    expect(screen.getByText(/Vertretung/)).toBeInTheDocument();
  });

  it('omits the substitute row when no substitute is supplied', async () => {
    listLeaveBalancesMock.mockResolvedValue([
      {
        id: 'lb-1',
        employeeId: 'sbauer-id',
        year: 2026,
        leaveTypeCode: 'urlaub',
        entitled: 25,
        carriedOver: 0,
        used: 0,
        planned: 0,
      },
    ]);
    render(
      <DecisionDialog
        decision="approved"
        summary={baseSummary}
        contextEmployeeId="sbauer-id"
        contextYear={2026}
        contextLeaveTypeCode="urlaub"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByText(/von 25 Tagen verbleibend/);
    expect(screen.queryByText(/Vertretung/)).not.toBeInTheDocument();
  });

  it('falls back to the empty-state when the API call rejects', async () => {
    listLeaveBalancesMock.mockRejectedValue(new Error('rls denied'));
    render(
      <DecisionDialog
        decision="approved"
        summary={baseSummary}
        contextEmployeeId="sbauer-id"
        contextYear={2026}
        contextLeaveTypeCode="urlaub"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Kein Urlaubsanspruch hinterlegt/)).toBeInTheDocument();
  });
});
