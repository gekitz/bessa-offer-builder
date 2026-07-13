import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ItemCard from '../ItemCard';

// A minimal hourly item (kind 'h'), e.g. Arbeitszeit.
const hourly = { id: 'arbeit', name: 'Arbeitszeit', t: 'h', price: 100 };

function handlers() {
  return {
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onQty: vi.fn(),
    onSetQty: vi.fn(),
    onDiscountQty: vi.fn(),
    onTier: vi.fn(),
    onMode: vi.fn(),
  };
}

describe('ItemCard — fractional hours', () => {
  it('renders an editable hours field when the hourly item is in the cart', () => {
    const h = handlers();
    render(<ItemCard item={hourly} cartItem={{ qty: 2 }} globalTier="12mo" {...h} />);
    const input = screen.getByLabelText('Stunden') as HTMLInputElement;
    expect(input.value).toBe('2');
  });

  it('accepts a fractional value like 3.5 via onSetQty', async () => {
    const h = handlers();
    render(<ItemCard item={hourly} cartItem={{ qty: 1 }} globalTier="12mo" {...h} />);
    const input = screen.getByLabelText('Stunden');
    await userEvent.clear(input);
    await userEvent.type(input, '3.5');
    expect(h.onSetQty).toHaveBeenLastCalledWith('arbeit', 3.5);
  });

  it('accepts a comma decimal like 3,5', () => {
    const h = handlers();
    render(<ItemCard item={hourly} cartItem={{ qty: 1 }} globalTier="12mo" {...h} />);
    fireEvent.change(screen.getByLabelText('Stunden'), { target: { value: '3,5' } });
    expect(h.onSetQty).toHaveBeenLastCalledWith('arbeit', 3.5);
  });

  it('steps by half an hour with the +/- buttons', () => {
    const h = handlers();
    render(<ItemCard item={hourly} cartItem={{ qty: 3 }} globalTier="12mo" {...h} />);
    const row = screen.getByLabelText('Stunden').parentElement!;
    const buttons = row.querySelectorAll('button');
    fireEvent.click(buttons[1]); // plus (after minus + input)
    expect(h.onSetQty).toHaveBeenLastCalledWith('arbeit', 3.5);
    fireEvent.click(buttons[0]); // minus
    expect(h.onSetQty).toHaveBeenLastCalledWith('arbeit', 2.5);
  });

  it('does not go below zero when stepping down', () => {
    const h = handlers();
    render(<ItemCard item={hourly} cartItem={{ qty: 0 }} globalTier="12mo" {...h} />);
    const row = screen.getByLabelText('Stunden').parentElement!;
    fireEvent.click(row.querySelectorAll('button')[0]); // minus
    expect(h.onSetQty).toHaveBeenLastCalledWith('arbeit', 0);
  });

  it('computes the line total from a fractional quantity', () => {
    const h = handlers();
    render(<ItemCard item={hourly} cartItem={{ qty: 3.5 }} globalTier="12mo" {...h} />);
    // 3.5 × €100 = €350
    expect(screen.getByText(/€\s*350/)).toBeInTheDocument();
  });
});
