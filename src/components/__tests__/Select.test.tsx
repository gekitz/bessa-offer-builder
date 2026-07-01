import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Select from '../Select';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

function open() {
  return userEvent.click(screen.getByRole('button', { name: /pick/i }));
}

describe('Select', () => {
  it('opens the listbox and selects an option', async () => {
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={OPTIONS} ariaLabel="pick" />);

    await open();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: /Bravo/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('stays open when scrolling inside its own option list', async () => {
    render(<Select value="" onChange={vi.fn()} options={OPTIONS} ariaLabel="pick" />);

    await open();
    const listbox = screen.getByRole('listbox');

    // Scroll originating from within the popover must not close it.
    fireEvent.scroll(listbox);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes when an ancestor / document outside the popover scrolls', async () => {
    render(<Select value="" onChange={vi.fn()} options={OPTIONS} ariaLabel="pick" />);

    await open();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.scroll(document);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(<Select value="" onChange={vi.fn()} options={OPTIONS} ariaLabel="pick" />);

    await open();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
