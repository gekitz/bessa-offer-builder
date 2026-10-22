import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OfferView from '../OfferView';
import { computeTotals } from '../../../../lib/totals';
import { ALL } from '../../data/catalogs';

// A Brother offer is a pure one-off hardware sale.
const BROTHER_ID = 'brother-mfc-j4350dw';
const cart = { [BROTHER_ID]: { qty: 1, discountQty: 0 } };

const baseProps = {
  cart,
  copierOffer: { isCopierOffer: false },
  customer: { name: '', company: '', email: '', phone: '', address: '' },
  setCustomer: () => {},
  creator: 'gkitz',
  setCreator: () => {},
  notes: '',
  setNotes: () => {},
  briefing: '',
  setBriefing: () => {},
  totals: computeTotals(cart as any, ALL),
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
  cartOrder: [BROTHER_ID],
  onReorder: () => {},
  onRemoveItem: () => {},
  onEditItem: () => {},
  offerType: 'brother',
};

describe('OfferView — Brother offer', () => {
  it('labels the GESAMTÜBERSICHT total "Kosten" (not "Kosten im ersten Jahr")', () => {
    render(<OfferView {...(baseProps as any)} />);
    expect(screen.getByText('GESAMTÜBERSICHT')).toBeInTheDocument();
    expect(screen.getByText('Kosten')).toBeInTheDocument();
    expect(screen.queryByText(/Kosten im ersten Jahr/)).not.toBeInTheDocument();
  });

  it('defaults the Bedingungen to Lieferzeit: lagernd and Zahlungsziel: netto Kassa', () => {
    render(<OfferView {...(baseProps as any)} />);
    expect(screen.getByText('Lieferzeit: lagernd')).toBeInTheDocument();
    expect(screen.getByText('Zahlungsziel: netto Kassa')).toBeInTheDocument();
  });

  it('lets the rep switch the Lieferzeit to "nach Rücksprache"', async () => {
    const setLieferung = vi.fn();
    render(<OfferView {...(baseProps as any)} lieferung="lagernd" setLieferung={setLieferung} />);
    await userEvent.click(screen.getByRole('button', { name: 'nach Rücksprache' }));
    expect(setLieferung).toHaveBeenCalledWith('ruecksprache');
  });

  it('lets the rep edit the Zahlungsziel', async () => {
    const setZahlungsziel = vi.fn();
    render(<OfferView {...(baseProps as any)} zahlungsziel="netto Kassa" setZahlungsziel={setZahlungsziel} />);
    const input = screen.getByLabelText('Zahlungsziel');
    await userEvent.type(input, '!');
    expect(setZahlungsziel).toHaveBeenCalled();
  });

  it('hides the delivery/payment editor once the offer is locked', () => {
    render(<OfferView {...(baseProps as any)} locked />);
    // The label heading of the editor card is gone…
    expect(screen.queryByText('Lieferung & Zahlung')).not.toBeInTheDocument();
    // …but the chosen terms still print in the Bedingungen list.
    expect(screen.getByText('Lieferzeit: lagernd')).toBeInTheDocument();
  });

  it('labels a PoS offer with only Einmalige Kosten "Kosten" too (no recurring → no "erstes Jahr")', () => {
    // Same pure one-off cart, but a normal PoS offer: the "im ersten Jahr"
    // framing is just as meaningless when nothing recurs.
    render(<OfferView {...(baseProps as any)} offerType="pos" />);
    expect(screen.getByText('GESAMTÜBERSICHT')).toBeInTheDocument();
    expect(screen.getByText('Kosten')).toBeInTheDocument();
    expect(screen.queryByText(/Kosten im ersten Jahr/)).not.toBeInTheDocument();
  });

  it('keeps the "Kosten im ersten Jahr" framing for a PoS offer that recurs (regression guard)', () => {
    const recurringTotals = { monthly: 100, once: 500, yearly: 0, periodTotal: 1700, periodMonthly: 1200, maxMonths: 12 };
    render(<OfferView {...(baseProps as any)} offerType="pos" totals={recurringTotals} />);
    expect(screen.getByText(/Kosten im ersten Jahr/)).toBeInTheDocument();
  });
});
