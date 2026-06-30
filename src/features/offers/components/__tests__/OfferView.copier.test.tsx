import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OfferView from '../OfferView';
import { buildCopierOffer } from '../../../../lib/copierOffer';
import { computeTotals } from '../../../../lib/totals';
import { ALL } from '../../data/catalogs';

const cart = {
  // Mirrors the sample: negotiated device price 3180 + 650 trade-in → €58,90/mo lease.
  'sharp-bp51c26': { qty: 1, saleMode: 'leasing', priceOverride: 3180, tradeIn: { name: 'Sharp MX 2651', value: 650 } },
};

const baseProps = {
  cart,
  copierOffer: buildCopierOffer(cart as any, ALL),
  customer: { name: '', company: '', email: '', phone: '', address: '' },
  setCustomer: () => {},
  creator: 'gkitz',
  setCreator: () => {},
  notes: '',
  setNotes: () => {},
  briefing: '',
  setBriefing: () => {},
  totals: computeTotals(cart as any, ALL), // all zeros — copier skipped in PoS totals
  onPrint: () => {},
  onCopy: () => {},
  copied: false,
  onCopyLink: () => {},
  linkCopied: false,
  raten: 12,
  setRaten: () => {},
  pdfLoading: false,
  finanzOpen: false,
  setFinanzOpen: () => {},
  globalTier: '12mo',
  rabattActive: false,
  setRabattActive: () => {},
  skontoActive: false,
  setSkontoActive: () => {},
  serviceStartDate: '',
  setServiceStartDate: () => {},
  onSave: () => {},
  onSend: () => {},
  saving: false,
  sending: false,
  saveSuccess: false,
  currentOfferId: null,
  onSign: () => {},
  onAddCustom: () => {},
  cartOrder: ['sharp-bp51c26'],
  onReorder: () => {},
  onRemoveItem: () => {},
  onEditItem: () => {},
};

describe('OfferView — Sharp/copier summary', () => {
  it('renders the copier summary, leasing terms and maintenance rates', () => {
    render(<OfferView {...(baseProps as any)} />);
    expect(screen.getByText(/SHARP MFP – DIGITALKOPIERGERÄT/)).toBeInTheDocument();
    expect(screen.getByText(/LEASING – GRENKE/)).toBeInTheDocument();
    expect(screen.getByText(/All-in Kopienpreiswartung/)).toBeInTheDocument();
    // Sample trade-in lease rate (value node only; "/Mo" is a separate node).
    expect(screen.getByText(/58,90/)).toBeInTheDocument();
  });

  it('does NOT render the PoS monthly/once cost tables', () => {
    render(<OfferView {...(baseProps as any)} />);
    expect(screen.queryByText('MONATLICHE KOSTEN')).not.toBeInTheDocument();
    expect(screen.queryByText('EINMALIGE KOSTEN')).not.toBeInTheDocument();
    expect(screen.queryByText('FINANZIERUNGSOPTIONEN')).not.toBeInTheDocument();
  });

  it('lets the rep edit the device price via the line pencil', async () => {
    render(<OfferView {...(baseProps as any)} />);
    // Each editable copier line (device, accessory) has a "Bearbeiten" pencil.
    const editButtons = screen.getAllByRole('button', { name: 'Bearbeiten' });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(editButtons[0]!);
    // EditItemModal opens with the net-price field (device VK editable).
    expect(screen.getByText('Preis netto (€)')).toBeInTheDocument();
  });
});
