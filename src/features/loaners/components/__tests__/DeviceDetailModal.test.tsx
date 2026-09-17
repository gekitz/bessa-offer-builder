import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { LoanerDevice } from '../../types';

// getDevice runs on mount — mock it so no Supabase/network is needed.
const getDevice = vi.fn();
vi.mock('../../api/loanerApi', () => ({
  getDevice: (...args: unknown[]) => getDevice(...args),
  checkInDevice: vi.fn(),
}));

import DeviceDetailModal from '../DeviceDetailModal';

const DEVICE: LoanerDevice = {
  id: 'd1',
  productId: null,
  bezeichnung: 'Sunmi V2s',
  serialNumber: 'V30521CK20287',
  inventoryNo: null,
  acquisitionCost: null,
  acquiredAt: null,
  notionalDailyValue: null,
  status: 'available',
  standort: 'klagenfurt',
  tags: [],
  note: null,
  active: true,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const noop = () => {};

describe('DeviceDetailModal — device note', () => {
  beforeEach(() => {
    getDevice.mockReset();
  });

  it('shows the device note even on an available, never-loaned device', async () => {
    getDevice.mockResolvedValue({
      device: { ...DEVICE, note: 'Akku bereits etwas degradiert' },
      history: [],
    });

    render(
      <DeviceDetailModal
        deviceId="d1"
        onClose={noop}
        onEdit={noop}
        onCheckOut={noop}
        onChanged={noop}
      />,
    );

    expect(await screen.findByText('Akku bereits etwas degradiert')).toBeInTheDocument();
    // Sanity: this device really is available + never loaned.
    expect(screen.getByText('Noch nie verliehen.')).toBeInTheDocument();
  });

  it('omits the Notiz block when the device has no note', async () => {
    getDevice.mockResolvedValue({ device: { ...DEVICE, note: null }, history: [] });

    render(
      <DeviceDetailModal
        deviceId="d1"
        onClose={noop}
        onEdit={noop}
        onCheckOut={noop}
        onChanged={noop}
      />,
    );

    await screen.findByText('Noch nie verliehen.');
    expect(screen.queryByText('Notiz')).not.toBeInTheDocument();
  });
});
