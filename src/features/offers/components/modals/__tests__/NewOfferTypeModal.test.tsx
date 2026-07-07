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

  it('calls onSelect directly for Sharp and Brother', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NewOfferTypeModal onSelect={onSelect} onClose={() => {}} />);
    await user.click(screen.getByText('Sharp MFP'));
    expect(onSelect).toHaveBeenCalledWith('sharp');

    await user.click(screen.getByText('Brother'));
    expect(onSelect).toHaveBeenCalledWith('brother');
  });

  it('PoS opens a Kauf/Leihstellung step that selects pos or rental', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NewOfferTypeModal onSelect={onSelect} onClose={() => {}} />);

    // PoS doesn't select immediately — it reveals the sub-step.
    await user.click(screen.getByText('PoS'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText('Kauf')).toBeInTheDocument();
    expect(screen.getByText('Leihstellung')).toBeInTheDocument();

    await user.click(screen.getByText('Kauf'));
    expect(onSelect).toHaveBeenCalledWith('pos');
  });

  it('picks the rental offer type via Leihstellung', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NewOfferTypeModal onSelect={onSelect} onClose={() => {}} />);
    await user.click(screen.getByText('PoS'));
    await user.click(screen.getByText('Leihstellung'));
    expect(onSelect).toHaveBeenCalledWith('rental');
  });

  it('closes when the backdrop is dismissed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NewOfferTypeModal onSelect={() => {}} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalled();
  });
});
