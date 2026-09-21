import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { Loan, LoanDevice, LoanerDevice } from '../../types';

// getDevice runs on mount — mock it so no Supabase/network is needed.
const getDevice = vi.fn();
const getLoanWithDevices = vi.fn();
vi.mock('../../api/loanerApi', () => ({
  getDevice: (...args: unknown[]) => getDevice(...args),
  getLoanWithDevices: (...args: unknown[]) => getLoanWithDevices(...args),
  checkInDevice: vi.fn(),
}));

const exportLoanBeleg = vi.fn();
vi.mock('../../lib/runLoanBelegExport', () => ({
  exportLoanBeleg: (...args: unknown[]) => exportLoanBeleg(...args),
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

function openLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    customerName: 'ALFRED PFANDL',
    customerKdnr: '24998',
    ticketId: null,
    startedAt: '2026-09-20',
    expectedReturn: null,
    note: null,
    mesonicBelegLaufnummer: null,
    mesonicBelegKey: null,
    mesonicBelegCreatedAt: null,
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function openHistoryRow(loan: Loan): LoanDevice & { loan: Loan } {
  return { id: 'ld-1', loanId: loan.id, deviceId: 'd1', returnedAt: null, note: null, createdAt: '', loan };
}

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

describe('DeviceDetailModal — retroactive Leih-Lieferschein', () => {
  beforeEach(() => {
    getDevice.mockReset();
    getLoanWithDevices.mockReset();
    exportLoanBeleg.mockReset();
  });

  it('offers "erzeugen" for a loan without a Beleg and pushes it on click', async () => {
    const loan = openLoan();
    const onLoanDevice = { ...DEVICE, status: 'on_loan' as const };
    getDevice.mockResolvedValue({ device: onLoanDevice, history: [openHistoryRow(loan)] });
    getLoanWithDevices.mockResolvedValue({ loan, devices: [onLoanDevice] });
    exportLoanBeleg.mockResolvedValue({ ok: true, belegKey: '24998-26', laufnummer: 26 });

    render(
      <DeviceDetailModal deviceId="d1" onClose={noop} onEdit={noop} onCheckOut={noop} onChanged={noop} />,
    );

    const btn = await screen.findByRole('button', { name: /Leih-Lieferschein erzeugen/ });
    fireEvent.click(btn);

    await waitFor(() => expect(exportLoanBeleg).toHaveBeenCalledWith(loan, [onLoanDevice]));
    expect(getLoanWithDevices).toHaveBeenCalledWith('loan-1');
  });

  it('shows the Beleg number and no "erzeugen" button once a loan has a key', async () => {
    const loan = openLoan({ mesonicBelegKey: '24998-26' });
    getDevice.mockResolvedValue({
      device: { ...DEVICE, status: 'on_loan' as const },
      history: [openHistoryRow(loan)],
    });

    render(
      <DeviceDetailModal deviceId="d1" onClose={noop} onEdit={noop} onCheckOut={noop} onChanged={noop} />,
    );

    expect(await screen.findByText(/Leih-Lieferschein #24998-26/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Leih-Lieferschein erzeugen/ })).not.toBeInTheDocument();
  });
});
