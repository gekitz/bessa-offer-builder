import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditItemModal from '../EditItemModal';
import type { Item } from '../../../../../lib/pricing';
import { ALL as CATALOG } from '../../../data/catalogs';

const CUSTOM_ITEM: Item = { id: 'custom-uuid-1', name: 'Lenovo ThinkCentre', t: 'o', price: 999, description: 'RAM 16 GB' };
const catalogId = Object.keys(CATALOG)[0]!;

function renderModal(overrides: Partial<React.ComponentProps<typeof EditItemModal>> = {}) {
  const onSave = vi.fn();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  render(
    <EditItemModal
      item={CUSTOM_ITEM}
      cartItem={{ qty: 1, discountQty: 0 }}
      monthly={false}
      onSave={onSave}
      onRemove={onRemove}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSave, onRemove, onClose };
}

describe('EditItemModal — custom-item description', () => {
  it('shows the description field for a custom item, prefilled with the current text', () => {
    renderModal();
    const ta = screen.getByPlaceholderText('Eine Zeile pro Spezifikation') as HTMLTextAreaElement;
    expect(ta).toBeInTheDocument();
    expect(ta.value).toBe('RAM 16 GB');
  });

  it('does NOT show the description field for a catalog item', () => {
    renderModal({ item: { ...CATALOG[catalogId]! } });
    expect(screen.queryByPlaceholderText('Eine Zeile pro Spezifikation')).not.toBeInTheDocument();
  });

  it('flows an edited description through onSave', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    const ta = screen.getByPlaceholderText('Eine Zeile pro Spezifikation');
    await user.clear(ta);
    await user.type(ta, 'Core i5{Enter}SSD 512 GB');
    await user.click(screen.getByRole('button', { name: /übernehmen/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Core i5\nSSD 512 GB' }),
    );
  });

  it('clearing the description sends an empty string so the field can be removed', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.clear(screen.getByPlaceholderText('Eine Zeile pro Spezifikation'));
    await user.click(screen.getByRole('button', { name: /übernehmen/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ description: '' }));
  });
});

describe('EditItemModal — option groups', () => {
  it('an ungrouped item shows no recommended toggle and saves an empty group', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    expect(screen.queryByRole('checkbox', { name: /empfohlene option/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /übernehmen/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ optionGroup: '', optionSelected: false }),
    );
  });

  it('prefills an existing group + recommended flag and passes them through unchanged', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({
      cartItem: { qty: 1, discountQty: 0, optionGroup: 'PC-Auswahl', optionSelected: true },
      availableGroups: ['PC-Auswahl'],
    });

    const checkbox = screen.getByRole('checkbox', { name: /empfohlene option/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await user.click(screen.getByRole('button', { name: /übernehmen/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ optionGroup: 'PC-Auswahl', optionSelected: true }),
    );
  });

  it('unchecking "empfohlen" marks the item as a non-counted alternative', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({
      cartItem: { qty: 1, discountQty: 0, optionGroup: 'PC-Auswahl', optionSelected: true },
      availableGroups: ['PC-Auswahl'],
    });

    await user.click(screen.getByRole('checkbox', { name: /empfohlene option/i }));
    await user.click(screen.getByRole('button', { name: /übernehmen/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ optionGroup: 'PC-Auswahl', optionSelected: false }),
    );
  });

  it('lets the user create a new group via the picker and mark it recommended', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Wahlgruppe' }));
    await user.click(await screen.findByRole('option', { name: /neue wahlgruppe/i }));
    await user.type(screen.getByPlaceholderText(/Name der Gruppe/), 'PC-Auswahl');
    await user.click(screen.getByRole('checkbox', { name: /empfohlene option/i }));
    await user.click(screen.getByRole('button', { name: /übernehmen/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ optionGroup: 'PC-Auswahl', optionSelected: true }),
    );
  });
});
