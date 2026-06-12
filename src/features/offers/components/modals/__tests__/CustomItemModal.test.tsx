import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CustomItemModal from '../CustomItemModal';

function renderModal(overrides: Partial<React.ComponentProps<typeof CustomItemModal>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<CustomItemModal onConfirm={onConfirm} onClose={onClose} {...overrides} />);
  return { onConfirm, onClose };
}

describe('CustomItemModal', () => {
  it('confirms name + price with description undefined when the description is left empty', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.type(screen.getByPlaceholderText('z.B. Spezialgehäuse'), 'Spezialkabel');
    await user.type(screen.getByPlaceholderText('0,00'), '49.9');
    await user.click(screen.getByRole('button', { name: /hinzufügen/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ name: 'Spezialkabel', price: 49.9, description: undefined });
  });

  it('passes the multi-line description through verbatim', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.type(screen.getByPlaceholderText('z.B. Spezialgehäuse'), 'Lenovo ThinkCentre neo 50a');
    await user.type(screen.getByPlaceholderText('0,00'), '999');
    const desc = screen.getByPlaceholderText(/Eine Zeile pro Spezifikation/);
    await user.type(desc, 'Core i5 13420H{Enter}RAM 16 GB{Enter}SSD 512 GB NVMe');
    await user.click(screen.getByRole('button', { name: /hinzufügen/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      name: 'Lenovo ThinkCentre neo 50a',
      price: 999,
      description: 'Core i5 13420H\nRAM 16 GB\nSSD 512 GB NVMe',
    });
  });

  it('treats a whitespace-only description as no description', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.type(screen.getByPlaceholderText('z.B. Spezialgehäuse'), 'Pos');
    await user.type(screen.getByPlaceholderText('0,00'), '10');
    await user.type(screen.getByPlaceholderText(/Eine Zeile pro Spezifikation/), '   ');
    await user.click(screen.getByRole('button', { name: /hinzufügen/i }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ description: undefined }));
  });

  it('does not submit without a name even if a description is filled in', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.type(screen.getByPlaceholderText('0,00'), '10');
    await user.type(screen.getByPlaceholderText(/Eine Zeile pro Spezifikation/), 'irgendwas');
    expect(screen.getByRole('button', { name: /hinzufügen/i })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
