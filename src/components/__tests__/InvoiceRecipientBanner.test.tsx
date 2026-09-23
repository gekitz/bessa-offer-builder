import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// getCustomer is the only Mesonic call the banner makes. Mock the whole client so
// CrmPage's module graph doesn't try to init the real Supabase client.
// vi.hoisted so the fn exists before the hoisted vi.mock factory runs.
const { getCustomer } = vi.hoisted(() => ({ getCustomer: vi.fn() }));
vi.mock('../../lib/mesonicApi', () => ({
  getCustomer,
  searchCustomers: vi.fn(),
  listCustomers: vi.fn(),
  getCustomerContacts: vi.fn(),
  saveCustomer: vi.fn(),
  validateCustomer: vi.fn(),
  mesonicExport: vi.fn(),
  TYPES: {},
  TEMPLATES: {},
}));

// The detail-view child panels are irrelevant here — stub them to nothing so
// importing CrmPage stays cheap and hermetic.
vi.mock('../CustomerForm', () => ({ default: () => null }));
vi.mock('../ContactsPanel', () => ({ default: () => null }));
vi.mock('../TicketsPanel', () => ({ default: () => null }));
vi.mock('../NextcloudPanel', () => ({ default: () => null }));
vi.mock('../TeamViewerPanel', () => ({ default: () => null }));
vi.mock('../../features/viertl/components/BelegePanel', () => ({ default: () => null }));

import { invoiceRecipientAccount, InvoiceRecipientBanner } from '../CrmPage';

const recipientRecord = {
  Name: 'Zentrale Verrechnung GmbH',
  Strasse: 'Hauptstraße 1',
  Postleitzahl: '9020',
  Ort: 'Klagenfurt',
  Kontonummer: '230A001',
};

describe('invoiceRecipientAccount', () => {
  it('returns null when the Rechnungsempfänger field is absent', () => {
    expect(invoiceRecipientAccount({ Kontonummer: '500B002' })).toBeNull();
  });

  it('returns null when the recipient equals the own account (self-billing)', () => {
    expect(
      invoiceRecipientAccount({ Kontonummer: '500B002', Rechnungsempfaenger: '500B002' }),
    ).toBeNull();
  });

  it("returns null for the sentinel '0'", () => {
    expect(
      invoiceRecipientAccount({ Kontonummer: '500B002', Rechnungsempfaenger: '0' }),
    ).toBeNull();
  });

  it('returns the account number when invoices go elsewhere', () => {
    expect(
      invoiceRecipientAccount({ Kontonummer: '500B002', Rechnungsempfaenger: '230A001' }),
    ).toBe('230A001');
  });

  it('also reads the umlaut spelling of the field', () => {
    expect(
      invoiceRecipientAccount({ Kontonummer: '500B002', Rechnungsempfänger: '230A001' }),
    ).toBe('230A001');
  });
});

describe('InvoiceRecipientBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and shows the recipient account name + address', async () => {
    getCustomer.mockResolvedValue({ records: [recipientRecord] });
    render(<InvoiceRecipientBanner recipientNumber="230A001" onOpen={vi.fn()} />);

    // The account number is always visible; details fill in after the fetch.
    expect(screen.getByText('230A001')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Zentrale Verrechnung GmbH')).toBeTruthy());
    expect(screen.getByText(/Hauptstraße 1, 9020 Klagenfurt/)).toBeTruthy();
    expect(getCustomer).toHaveBeenCalledWith('230A001');
  });

  it('opens the recipient account when clicked', async () => {
    getCustomer.mockResolvedValue({ records: [recipientRecord] });
    const onOpen = vi.fn();
    render(<InvoiceRecipientBanner recipientNumber="230A001" onOpen={onOpen} />);

    await waitFor(() => expect(screen.getByText('Zentrale Verrechnung GmbH')).toBeTruthy());
    await userEvent.click(screen.getByTestId('invoice-recipient-banner'));
    expect(onOpen).toHaveBeenCalledWith(recipientRecord);
  });

  it('falls back to the bare number when the lookup fails', async () => {
    getCustomer.mockRejectedValue(new Error('boom'));
    render(<InvoiceRecipientBanner recipientNumber="230A001" onOpen={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Details nicht ladbar/)).toBeTruthy());
    expect(screen.getByText('230A001')).toBeTruthy();
  });

  it('is not clickable when the recipient could not be loaded', async () => {
    getCustomer.mockResolvedValue({ records: [] });
    const onOpen = vi.fn();
    render(<InvoiceRecipientBanner recipientNumber="230A001" onOpen={onOpen} />);

    await waitFor(() => expect(screen.getByText(/Details nicht ladbar/)).toBeTruthy());
    const banner = screen.getByTestId('invoice-recipient-banner');
    await userEvent.click(banner);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
