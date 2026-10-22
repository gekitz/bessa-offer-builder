import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OfferView from '../OfferView';

// A plain PoS offer with a synthetic once-only total — enough to render the
// GESAMTÜBERSICHT and the Bedingungen/terms editor.
const totals = { monthly: 0, once: 1000, yearly: 0, periodTotal: 1000, periodMonthly: 0, maxMonths: 12 };

const baseProps = {
  cart: {},
  copierOffer: null,
  customer: { name: '', company: '', email: '', phone: '', address: '' },
  setCustomer: () => {},
  creator: 'gkitz',
  setCreator: () => {},
  notes: '',
  setNotes: () => {},
  briefing: '',
  setBriefing: () => {},
  totals,
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
  cartOrder: [],
  onReorder: () => {},
  onRemoveItem: () => {},
  onEditItem: () => {},
  onCopierField: () => {},
  offerType: 'pos',
};

// Drives lieferung/zahlungsziel through real state, like OfferBuilderPage does.
function Harness(props: Record<string, unknown> = {}) {
  const [lieferung, setLieferung] = useState('');
  const [zahlungsziel, setZahlungsziel] = useState('');
  return (
    <OfferView
      {...(baseProps as any)}
      lieferung={lieferung}
      setLieferung={setLieferung}
      zahlungsziel={zahlungsziel}
      setZahlungsziel={setZahlungsziel}
      {...props}
    />
  );
}

describe('OfferView — editable delivery/payment terms', () => {
  it('defaults the Bedingungen to the standard Lieferzeit/Zahlungsziel', () => {
    render(<Harness />);
    expect(screen.getByText('Lieferzeit: 2 Wochen')).toBeInTheDocument();
    expect(screen.getByText('Zahlungsziel: 10 Tage netto Kassa')).toBeInTheDocument();
  });

  it('shows a pencil on the Bedingungen block that opens the TermsModal', async () => {
    render(<Harness />);
    // Modal is closed until the pencil is clicked.
    expect(screen.queryByLabelText('Lieferzeit')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByLabelText('Lieferzeit')).toBeInTheDocument();
    expect(screen.getByLabelText('Zahlungsziel')).toBeInTheDocument();
  });

  it('applies an edited Lieferzeit to the Bedingungen list', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Lieferzeit'), '3-4 Wochen');
    await userEvent.click(screen.getByRole('button', { name: /Übernehmen/ }));
    expect(screen.getByText('Lieferzeit: 3-4 Wochen')).toBeInTheDocument();
    expect(screen.queryByText('Lieferzeit: 2 Wochen')).not.toBeInTheDocument();
  });

  it('applies an edited Zahlungsziel to the Bedingungen list', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Zahlungsziel'), '30 Tage netto');
    await userEvent.click(screen.getByRole('button', { name: /Übernehmen/ }));
    expect(screen.getByText('Zahlungsziel: 30 Tage netto')).toBeInTheDocument();
  });

  it('hides the pencil once the offer is locked (terms still print)', () => {
    render(<Harness lieferung="3 Wochen" locked />);
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.getByText('Lieferzeit: 3 Wochen')).toBeInTheDocument();
  });
});
