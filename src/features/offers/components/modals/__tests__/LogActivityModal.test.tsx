import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LogActivityModal from '../LogActivityModal';

function renderModal(overrides: Partial<React.ComponentProps<typeof LogActivityModal>> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <LogActivityModal
      customerLabel="Acme GmbH"
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

// Compares two Dates by local-day offset (NOW + offsetDays). We
// don't pin "now" via fake timers because they conflict with
// userEvent.setup(), per project test conventions.
function expectLocalDayOffset(actual: Date, offsetDays: number) {
  const expected = new Date();
  expected.setDate(expected.getDate() + offsetDays);
  expect(actual.getFullYear()).toBe(expected.getFullYear());
  expect(actual.getMonth()).toBe(expected.getMonth());
  expect(actual.getDate()).toBe(expected.getDate());
}

describe('LogActivityModal', () => {
  it('renders the customer label and shows all four kind pills', () => {
    renderModal();
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Kontakt protokollieren')).toBeInTheDocument();
    for (const label of ['Telefonat', 'E-Mail', 'Meeting', 'Notiz']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('saves with the chosen kind, outcome, note, and no follow-up by default', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Nicht erreicht' }));
    await user.type(screen.getByPlaceholderText(/bittet um Rückruf/), 'mailbox war voll');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'call',
      outcome: 'no_answer',
      note: 'mailbox war voll',
      nextFollowupAt: null,
      stageChange: null,
    });
  });

  it('does not show the stage suggestion for a neutral outcome like no_answer', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Nicht erreicht' }));

    expect(screen.queryByLabelText(/als gewonnen markieren/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/als verloren markieren/i)).not.toBeInTheDocument();
  });

  it('proposes "als gewonnen markieren" when outcome=interested; opt-in flows through to onSubmit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Interessiert' }));
    const checkbox = await screen.findByLabelText(/als gewonnen markieren/i);
    expect(checkbox).toBeInTheDocument();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ stageChange: 'closed' }));
  });

  it('proposes "als verloren markieren" when outcome=not_interested; opt-in flows through', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Kein Interesse' }));
    const checkbox = await screen.findByLabelText(/als verloren markieren/i);
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ stageChange: 'lost' }));
  });

  it('opt-in is null by default — saving without ticking the box leaves the stage alone', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Interessiert' }));
    expect(screen.getByLabelText(/als gewonnen markieren/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ stageChange: null }));
  });

  it('changing the outcome resets a previously-checked opt-in', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Interessiert' }));
    await user.click(screen.getByLabelText(/als gewonnen markieren/i));
    // Switch outcome to "Kein Interesse" — old "won" opt-in must NOT carry over.
    await user.click(screen.getByRole('button', { name: 'Kein Interesse' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // The "lost" checkbox is shown but never ticked, so stageChange must be null.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ stageChange: null }));
  });

  it('toggling the same outcome twice clears it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    const interestedBtn = screen.getByRole('button', { name: 'Interessiert' });
    await user.click(interestedBtn);
    await user.click(interestedBtn);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ outcome: null }));
  });

  it('switching the kind updates the saved record', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Meeting' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'meeting' }));
  });

  it('the "+1 Woche" shortcut produces a follow-up 7 days from today at the default 09:00 local time', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: '+1 Woche' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.nextFollowupAt).not.toBeNull();
    const due = new Date(draft.nextFollowupAt!);
    expectLocalDayOffset(due, 7);
    expect(due.getHours()).toBe(9);
    expect(due.getMinutes()).toBe(0);
  });

  it('the "Morgen" shortcut produces tomorrow at 09:00 local time', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Morgen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const due = new Date(onSubmit.mock.calls[0]![0].nextFollowupAt!);
    expectLocalDayOffset(due, 1);
    expect(due.getHours()).toBe(9);
  });

  it('"Entfernen" clears a previously-picked shortcut so the saved value is null', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: '+3 Tage' }));
    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nextFollowupAt: null }));
  });

  it('the time input is disabled until a follow-up date is picked', () => {
    renderModal();
    const timeInput = screen.getByLabelText('Follow-up Uhrzeit') as HTMLInputElement;
    expect(timeInput.disabled).toBe(true);
  });

  it('a custom time combined with a shortcut date is reflected in the saved ISO timestamp', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Morgen' }));
    const timeInput = screen.getByLabelText('Follow-up Uhrzeit') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '15:30' } });
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const due = new Date(onSubmit.mock.calls[0]![0].nextFollowupAt!);
    expect(due.getHours()).toBe(15);
    expect(due.getMinutes()).toBe(30);
  });

  it('clicking Abbrechen calls onClose without submitting', async () => {
    const user = userEvent.setup();
    const { onClose, onSubmit } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saving=true disables both Speichern and Abbrechen', () => {
    renderModal({ saving: true });
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /abbrechen/i })).toBeDisabled();
  });

  it('respects the defaultKind prop (preselects the kind pill)', () => {
    renderModal({ defaultKind: 'email' });
    const emailBtn = screen.getByRole('button', { name: 'E-Mail' });
    expect(emailBtn.className).toMatch(/ring-2/);
  });
});
