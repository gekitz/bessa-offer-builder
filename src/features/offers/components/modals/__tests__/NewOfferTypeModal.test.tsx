import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NewOfferTypeModal from '../NewOfferTypeModal';

describe('NewOfferTypeModal', () => {
  it('renders a PoS (Kasse) tile, a Sharp MFP tile and a Brother tile', () => {
    render(<NewOfferTypeModal onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('PoS')).toBeInTheDocument();
    expect(screen.getByText('Kasse')).toBeInTheDocument();
    expect(screen.getByText('Sharp MFP')).toBeInTheDocument();
    expect(screen.getByText('Brother')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen type', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NewOfferTypeModal onSelect={onSelect} onClose={() => {}} />);
    await user.click(screen.getByText('Sharp MFP'));
    expect(onSelect).toHaveBeenCalledWith('sharp');

    await user.click(screen.getByText('Brother'));
    expect(onSelect).toHaveBeenCalledWith('brother');

    await user.click(screen.getByText('PoS'));
    expect(onSelect).toHaveBeenCalledWith('pos');
  });

  it('closes when the backdrop is dismissed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NewOfferTypeModal onSelect={() => {}} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalled();
  });
});
