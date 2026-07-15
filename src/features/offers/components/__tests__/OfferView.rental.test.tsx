import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import OfferView from '../OfferView';
import { computeTotals } from '../../../../lib/totals';
import { ALL } from '../../data/catalogs';
import { rentalLineFields, RENTAL_LINE_ID, emptyRentalState } from '../../../../lib/rentalOffer';

// A Leihstellung collapses into one custom once-item. Register it in ALL the
// same way OfferBuilderPage.syncRentalCartLine does, then render OfferView with
// isRental so we can assert on the summary layout.
const rentalState = {
  ...emptyRentalState(),
  term: '6mo' as const,
  hardware: { hauptkasse: 1, bondrucker: 1 },
  services: { fiskalisierung: 1, arbeitszeit: 2 },
};
const fields = rentalLineFields(rentalState)!;
ALL[RENTAL_LINE_ID] = { id: RENTAL_LINE_ID, name: fields.name, price: fields.price, t: 'o', description: fields.description } as any;

const cart = { [RENTAL_LINE_ID]: { qty: 1, discountQty: 0 } };

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
  globalTier: '6mo',
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
  cartOrder: [RENTAL_LINE_ID],
  onReorder: () => {},
  onRemoveItem: () => {},
  onEditItem: () => {},
  isRental: true,
};

describe('OfferView — rental (Leihstellung) summary', () => {
  it('drops the GESAMTÜBERSICHT "Kosten im ersten Jahr" block', () => {
    render(<OfferView {...(baseProps as any)} />);
    expect(screen.queryByText('GESAMTÜBERSICHT')).not.toBeInTheDocument();
    expect(screen.queryByText(/Kosten im ersten Jahr/)).not.toBeInTheDocument();
  });

  it('still shows the one-off total in the EINMALIGE KOSTEN box', () => {
    render(<OfferView {...(baseProps as any)} />);
    expect(screen.getByText('EINMALIGE KOSTEN')).toBeInTheDocument();
    expect(screen.getByText(/Leihstellung POS, Laufzeit 6 Monate/)).toBeInTheDocument();
  });

  it('keeps the block for a normal PoS offer (regression guard)', () => {
    render(<OfferView {...(baseProps as any)} isRental={false} />);
    expect(screen.getByText('GESAMTÜBERSICHT')).toBeInTheDocument();
  });
});
