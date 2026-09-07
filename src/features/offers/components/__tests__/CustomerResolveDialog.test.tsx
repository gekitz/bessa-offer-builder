import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CustomerResolveDialog, { parseAssignedKontonummer } from '../CustomerResolveDialog';

// Mock the Mesonic client — no live network calls.
const searchCustomers = vi.fn();
const saveCustomer = vi.fn();
vi.mock('../../../../lib/mesonicApi', () => ({
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  saveCustomer: (...args: unknown[]) => saveCustomer(...args),
}));

const CUSTOMER = { company: 'Firma GmbH', name: 'Max', email: 'm@x.at', phone: '0660', address: 'Weg 1' };

beforeEach(() => {
  searchCustomers.mockReset();
  saveCustomer.mockReset();
});

describe('parseAssignedKontonummer', () => {
  it('extracts the assigned Kontonummer', () => {
    expect(parseAssignedKontonummer('<r><Kontonummer>29999</Kontonummer></r>')).toBe('29999');
  });
  it('ignores the "+" placeholder and missing values', () => {
    expect(parseAssignedKontonummer('<Kontonummer>+</Kontonummer>')).toBeNull();
    expect(parseAssignedKontonummer('<r/>')).toBeNull();
    expect(parseAssignedKontonummer(null)).toBeNull();
  });
});

describe('CustomerResolveDialog', () => {
  it('runs the prefilled search on open and renders results', async () => {
    searchCustomers.mockResolvedValue({
      records: [{ Kontonummer: '24998', Name: 'Firma GmbH', Ort: 'Klagenfurt' }],
    });
    render(
      <CustomerResolveDialog open customer={CUSTOMER} onResolved={vi.fn()} onCancel={vi.fn()} />,
    );
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledWith('Firma GmbH'));
    expect(await screen.findByText('Firma GmbH')).toBeInTheDocument();
    expect(screen.getByText('#24998')).toBeInTheDocument();
    expect(screen.getByText(/Klagenfurt/)).toBeInTheDocument();
  });

  it('Auswählen resolves with the Kd.-Nr.', async () => {
    const onResolved = vi.fn();
    searchCustomers.mockResolvedValue({
      records: [{ Kontonummer: '24998', Name: 'Firma GmbH', Ort: 'Klagenfurt' }],
    });
    render(
      <CustomerResolveDialog open customer={CUSTOMER} onResolved={onResolved} onCancel={vi.fn()} />,
    );
    const btn = await screen.findByRole('button', { name: /Auswählen/ });
    await userEvent.click(btn);
    expect(onResolved).toHaveBeenCalledWith('24998');
  });

  it('Neu anlegen creates a customer and resolves with the new Kd.-Nr.', async () => {
    const onResolved = vi.fn();
    searchCustomers.mockResolvedValue({ records: [] });
    saveCustomer.mockResolvedValue({
      success: true,
      raw: '<r><Kontonummer>29999</Kontonummer></r>',
    });
    render(
      <CustomerResolveDialog open customer={CUSTOMER} onResolved={onResolved} onCancel={vi.fn()} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Neu in WinLine anlegen/ }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('29999'));
    expect(saveCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ Name: 'Firma GmbH', 'E-Mail': 'm@x.at', Telefon: '0660', Strasse: 'Weg 1' }),
      { actionCode: 1 },
    );
  });

  it('shows an inline error when create fails and does not resolve', async () => {
    const onResolved = vi.fn();
    searchCustomers.mockResolvedValue({ records: [] });
    saveCustomer.mockResolvedValue({ success: false, error: '030: Pflichtfeld fehlt' });
    render(
      <CustomerResolveDialog open customer={CUSTOMER} onResolved={onResolved} onCancel={vi.fn()} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Neu in WinLine anlegen/ }));
    expect(await screen.findByText(/Pflichtfeld fehlt/)).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('Abbrechen calls onCancel', async () => {
    const onCancel = vi.fn();
    searchCustomers.mockResolvedValue({ records: [] });
    render(
      <CustomerResolveDialog open customer={CUSTOMER} onResolved={vi.fn()} onCancel={onCancel} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
