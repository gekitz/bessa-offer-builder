import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LostReasonModal from '../LostReasonModal';

function renderModal(overrides: Partial<React.ComponentProps<typeof LostReasonModal>> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <LostReasonModal
      customerLabel="Acme GmbH"
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

describe('LostReasonModal', () => {
  it('renders all seven reason chips and the customer label', () => {
    renderModal();
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    for (const label of ['Preis / Budget', 'Mitbewerber', 'Timing / kein Bedarf', 'Funktion fehlt', 'Keine Antwort', 'Intern entschieden', 'Sonstiges']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('the submit button is disabled until a reason is selected (required)', async () => {
    const user = userEvent.setup();
    renderModal();

    const submit = screen.getByRole('button', { name: /Verloren markieren/ });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Preis / Budget' }));
    expect(submit).not.toBeDisabled();
  });

  it('submits with the chosen reason and trims the optional note', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Mitbewerber' }));
    await user.type(screen.getByLabelText(/Notiz/), '  ist zu Konkurrent X gegangen  ');
    await user.click(screen.getByRole('button', { name: /Verloren markieren/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      reason: 'competitor',
      note: '  ist zu Konkurrent X gegangen  ',
    });
  });

  it('submits with empty note when the rep skips it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Keine Antwort' }));
    await user.click(screen.getByRole('button', { name: /Verloren markieren/ }));

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'no_response', note: '' });
  });

  it('switching reason replaces the previous selection (not a multi-select)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Preis / Budget' }));
    await user.click(screen.getByRole('button', { name: 'Sonstiges' }));
    await user.click(screen.getByRole('button', { name: /Verloren markieren/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ reason: 'other' }));
  });

  it('clicking Abbrechen invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose, onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit button is disabled while saving (so the rep can\'t double-click it)', () => {
    renderModal({ saving: true });
    const submit = screen.getByRole('button', { name: /Wird gespeichert/ });
    expect(submit).toBeDisabled();
  });

  it('does not invoke onClose while saving (no mid-flight dismiss)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ saving: true });
    await user.click(screen.getByLabelText('Schließen'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
