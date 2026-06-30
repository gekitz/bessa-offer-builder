import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LeasingConditionsModal from '../LeasingConditionsModal';
import { SHARP } from '../../../data/catalogs';

const device = SHARP.find((d) => d.code === 'BP51C26')!;

describe('LeasingConditionsModal', () => {
  it('previews the standard 60-month rate and saves no overrides for defaults', () => {
    const onSave = vi.fn();
    const { container } = render(<LeasingConditionsModal item={device} cartItem={{ qty: 1, saleMode: 'leasing' }} onSave={onSave} onClose={() => {}} />);
    // Live preview shows the computed €71,18 (base 3.594,73 × 1,98%).
    expect(screen.getByText(/71,18/)).toBeInTheDocument();
    fireEvent.submit(container.querySelector('form')!);
    const patch = onSave.mock.calls[0][0];
    expect(patch.leasingTermMonths).toBe(60);
    // Untouched fields persist as undefined so config defaults still apply.
    expect(patch.leasingFactorOverride).toBeUndefined();
    expect(patch.restwertPercentOverride).toBeUndefined();
    expect(patch.bearbeitungsgebuehrOverride).toBeUndefined();
  });

  it('stores deviations as explicit overrides', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<LeasingConditionsModal item={device} cartItem={{ qty: 1, saleMode: 'leasing' }} onSave={onSave} onClose={() => {}} />);
    const restwert = screen.getByLabelText('Restwert');
    await user.clear(restwert);
    await user.type(restwert, '10');
    fireEvent.submit(container.querySelector('form')!);
    expect(onSave.mock.calls[0][0].restwertPercentOverride).toBe(10);
  });
});
