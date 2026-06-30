import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CopierItemCard from '../CopierItemCard';
import { SHARP } from '../../data/catalogs';

const device = SHARP.find((d) => d.code === 'BP51C26')!; // vk 3150, uhg 194.73, install 250

function handlers() {
  return {
    onAddCopier: vi.fn(),
    onRemove: vi.fn(),
    onQty: vi.fn(),
    onCopierField: vi.fn(),
  };
}

describe('CopierItemCard', () => {
  it('shows Kauf and Leasing prices and an add button when not in cart', () => {
    const h = handlers();
    render(<CopierItemCard item={device} {...h} />);
    // List price for Kauf, computed Grenke rate for Leasing. (Unescaped "." so
    // the de-AT narrow-no-break thousands separator is matched too.)
    expect(screen.getByText(/3.150,00/)).toBeInTheDocument();
    expect(screen.getByText(/71,18/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
  });

  it('calls onAddCopier with the device id when added', async () => {
    const h = handlers();
    render(<CopierItemCard item={device} {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(h.onAddCopier).toHaveBeenCalledWith(device.id);
  });

  it('toggles to Leasing via onCopierField when in cart', async () => {
    const h = handlers();
    render(<CopierItemCard item={device} cartItem={{ qty: 1, saleMode: 'kauf' }} {...h} />);
    // In-cart the Kauf button shows the net (vk + uhg + install = 3 594,73).
    expect(screen.getByRole('button', { name: /Kauf.*594,73/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Leasing/ }));
    expect(h.onCopierField).toHaveBeenCalledWith(device.id, { saleMode: 'leasing' });
  });

  it('reveals trade-in inputs when the trade-in box is checked', async () => {
    const h = handlers();
    render(<CopierItemCard item={device} cartItem={{ qty: 1, saleMode: 'kauf' }} {...h} />);
    expect(screen.queryByPlaceholderText(/Gerät/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByPlaceholderText(/Gerät/)).toBeInTheDocument();
  });

  it('shows the Leasing-Konditionen button only under Leasing mode', () => {
    const h = handlers();
    const { rerender } = render(<CopierItemCard item={device} cartItem={{ qty: 1, saleMode: 'kauf' }} {...h} />);
    expect(screen.queryByText(/Leasing-Konditionen bearbeiten/)).not.toBeInTheDocument();
    rerender(<CopierItemCard item={device} cartItem={{ qty: 1, saleMode: 'leasing' }} {...h} />);
    expect(screen.getByText(/Leasing-Konditionen bearbeiten/)).toBeInTheDocument();
  });

  it('opens the leasing conditions dialog from the card', async () => {
    const h = handlers();
    render(<CopierItemCard item={device} cartItem={{ qty: 1, saleMode: 'leasing' }} {...h} />);
    await userEvent.click(screen.getByText(/Leasing-Konditionen bearbeiten/));
    expect(screen.getByText('Leasing-Konditionen')).toBeInTheDocument(); // modal title
    expect(screen.getByLabelText('Leasingfaktor')).toBeInTheDocument();
  });
});
