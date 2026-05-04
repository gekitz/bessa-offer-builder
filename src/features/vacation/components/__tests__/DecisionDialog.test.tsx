import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DecisionDialog from '../DecisionDialog';

const baseSummary = 'Stefan Bauer · Urlaub · 10.08.2026 – 15.08.2026';

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
