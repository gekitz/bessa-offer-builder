import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CopierPricesModal from '../CopierPricesModal';
import { SHARP } from '../../../data/catalogs';

const device = SHARP.find((d) => d.code === 'BP51C26')!; // install 250, bw 0.0075, color 0.075, scan 0.0019

describe('CopierPricesModal', () => {
  it('prefills from the catalog device and saves no overrides for unchanged defaults', () => {
    const onSave = vi.fn();
    const { container } = render(<CopierPricesModal item={device} cartItem={{ qty: 1 }} onSave={onSave} onClose={() => {}} />);
    expect((screen.getByLabelText('Lieferung, Installation und Einschulung') as HTMLInputElement).value).toBe('250');
    expect((screen.getByLabelText('Preis pro Kopie s/w') as HTMLInputElement).value).toBe('0.0075');
    fireEvent.submit(container.querySelector('form')!);
    const patch = onSave.mock.calls[0][0];
    expect(patch.installOverride).toBeUndefined();
    expect(patch.pageBwOverride).toBeUndefined();
    expect(patch.pageColorOverride).toBeUndefined();
    expect(patch.pageScanOverride).toBeUndefined();
  });

  it('stores changed install and copy prices as explicit overrides', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<CopierPricesModal item={device} cartItem={{ qty: 1 }} onSave={onSave} onClose={() => {}} />);

    const install = screen.getByLabelText('Lieferung, Installation und Einschulung');
    await user.clear(install);
    await user.type(install, '350');
    const bw = screen.getByLabelText('Preis pro Kopie s/w');
    await user.clear(bw);
    await user.type(bw, '0.0065');

    fireEvent.submit(container.querySelector('form')!);
    const patch = onSave.mock.calls[0][0];
    expect(patch.installOverride).toBe(350);
    expect(patch.pageBwOverride).toBe(0.0065);
    // Untouched fields stay undefined → catalog default still applies.
    expect(patch.pageColorOverride).toBeUndefined();
    expect(patch.pageScanOverride).toBeUndefined();
  });

  it('prefills an existing override instead of the catalog default', () => {
    const onSave = vi.fn();
    render(<CopierPricesModal item={device} cartItem={{ qty: 1, installOverride: 400 }} onSave={onSave} onClose={() => {}} />);
    expect((screen.getByLabelText('Lieferung, Installation und Einschulung') as HTMLInputElement).value).toBe('400');
  });
});
