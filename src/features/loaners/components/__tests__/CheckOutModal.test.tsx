import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Loan, LoanerDevice } from '../../types';

// The guardrail queries the customer's open loans on mount and branches the
// submit: append-to-existing (addDevicesToLoan + reexportLoanBeleg, one amended
// Beleg) vs. a fresh loan (checkOut + exportLoanBeleg, a new Beleg). We mock the
// API + export edges; the branch logic under test stays real.
const listOpenLoansForCustomer = vi.fn();
const checkOut = vi.fn();
const addDevicesToLoan = vi.fn();
const findDeviceBySerial = vi.fn();
vi.mock('../../api/loanerApi', () => ({
  listOpenLoansForCustomer: (...a: unknown[]) => listOpenLoansForCustomer(...a),
  checkOut: (...a: unknown[]) => checkOut(...a),
  addDevicesToLoan: (...a: unknown[]) => addDevicesToLoan(...a),
  findDeviceBySerial: (...a: unknown[]) => findDeviceBySerial(...a),
}));

const exportLoanBeleg = vi.fn();
const reexportLoanBeleg = vi.fn();
vi.mock('../../lib/runLoanBelegExport', () => ({
  exportLoanBeleg: (...a: unknown[]) => exportLoanBeleg(...a),
  reexportLoanBeleg: (...a: unknown[]) => reexportLoanBeleg(...a),
}));

import CheckOutModal from '../CheckOutModal';

const DEVICE: LoanerDevice = {
  id: 'dev-1',
  productId: null,
  bezeichnung: 'Sunmi L3',
  serialNumber: 'SN-1',
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

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    customerName: 'ALFRED PFANDL',
    customerKdnr: '24998',
    ticketId: null,
    startedAt: '2026-09-20',
    expectedReturn: null,
    note: null,
    mesonicBelegLaufnummer: 26,
    mesonicBelegKey: '24998-26',
    mesonicBelegCreatedAt: null,
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    devices: [{ id: 'ld-1', loanId: 'loan-1', deviceId: 'dev-0', returnedAt: null, note: null, createdAt: '' }],
    ...overrides,
  };
}

function renderModal() {
  const onDone = vi.fn();
  render(
    <CheckOutModal
      devices={[DEVICE]}
      preselectDeviceId="dev-1"
      initialCustomer={{ name: 'ALFRED PFANDL', kdnr: '24998' }}
      onClose={() => {}}
      onDone={onDone}
    />,
  );
  return { onDone };
}

describe('CheckOutModal guardrail', () => {
  beforeEach(() => {
    listOpenLoansForCustomer.mockReset();
    checkOut.mockReset();
    addDevicesToLoan.mockReset();
    findDeviceBySerial.mockReset();
    exportLoanBeleg.mockReset();
    reexportLoanBeleg.mockReset();
    exportLoanBeleg.mockResolvedValue({ ok: true });
    reexportLoanBeleg.mockResolvedValue({ ok: true });
    checkOut.mockResolvedValue({ loan: makeLoan() });
    addDevicesToLoan.mockResolvedValue([]);
  });

  it('warns and defaults to append when the customer already has an open loan', async () => {
    listOpenLoansForCustomer.mockResolvedValue([makeLoan()]);
    const { onDone } = renderModal();

    // Banner appears once the open-loan lookup resolves.
    await screen.findByText(/bereits 1 offene Leihstellung/i);

    // Default = append: submit appends to the existing loan + edits its Beleg.
    fireEvent.click(screen.getByRole('button', { name: /Zu Leihstellung hinzufügen/i }));

    await waitFor(() => expect(addDevicesToLoan).toHaveBeenCalledWith('loan-1', ['dev-1']));
    expect(reexportLoanBeleg).toHaveBeenCalledWith('loan-1');
    expect(checkOut).not.toHaveBeenCalled();
    expect(exportLoanBeleg).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('lets the user override to a NEW loan (checkOut + new Beleg)', async () => {
    listOpenLoansForCustomer.mockResolvedValue([makeLoan()]);
    renderModal();
    await screen.findByText(/bereits 1 offene Leihstellung/i);

    fireEvent.click(screen.getByRole('button', { name: /^Neue Leihstellung$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Verleihen$/i }));

    await waitFor(() => expect(checkOut).toHaveBeenCalled());
    expect(exportLoanBeleg).toHaveBeenCalled();
    expect(addDevicesToLoan).not.toHaveBeenCalled();
    expect(reexportLoanBeleg).not.toHaveBeenCalled();
  });

  it('no open loan → no banner, plain check-out path', async () => {
    listOpenLoansForCustomer.mockResolvedValue([]);
    renderModal();

    await waitFor(() => expect(listOpenLoansForCustomer).toHaveBeenCalledWith('24998'));
    expect(screen.queryByText(/offene Leihstellung/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Verleihen$/i }));
    await waitFor(() => expect(checkOut).toHaveBeenCalled());
    expect(addDevicesToLoan).not.toHaveBeenCalled();
  });
});
