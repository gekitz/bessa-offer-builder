import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OfferView from '../OfferView';
import { computeTotals } from '../../../../lib/totals';
import { ALL } from '../../data/catalogs';

// A custom once-item so the cart is non-empty and the Actions/edit controls
// render. Registered in ALL like a "Freie Position".
const CUSTOM_ID = 'locked-test-item';
ALL[CUSTOM_ID] = { id: CUSTOM_ID, name: 'Testposition', price: 500, t: 'o' } as any;

const cart = { [CUSTOM_ID]: { qty: 1, discountQty: 0 } };

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    cart,
    copierOffer: { isCopierOffer: false },
    customer: { name: '', company: '', email: 'kunde@example.at', phone: '', address: '' },
    setCustomer: () => {},
    creator: 'gkitz',
    setCreator: () => {},
    creators: [],
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
    currentOfferId: 'offer-1',
    onSign: () => {},
    onAddCustom: () => {},
    cartOrder: [CUSTOM_ID],
    onReorder: () => {},
    onRemoveItem: () => {},
    onEditItem: () => {},
    ...overrides,
  };
}

describe('OfferView — locked (accepted) offer', () => {
  it('shows the read-only banner with the accepted date', () => {
    render(<OfferView {...(makeProps({ locked: true, lockedAt: '2026-07-10T09:00:00Z' }) as any)} />);
    expect(screen.getByText('Angenommenes Angebot')).toBeInTheDocument();
    expect(screen.getByText(/Angenommen am 10\.7\.2026/)).toBeInTheDocument();
  });

  it('hides Save / Send / Sign and the Freie Position button when locked', () => {
    render(<OfferView {...(makeProps({ locked: true }) as any)} />);
    expect(screen.queryByText('Speichern')).not.toBeInTheDocument();
    expect(screen.queryByText('Aktualisieren')).not.toBeInTheDocument();
    expect(screen.queryByText('Angebot senden')).not.toBeInTheDocument();
    expect(screen.queryByText('Unterschreiben')).not.toBeInTheDocument();
    expect(screen.queryByText('Freie Position')).not.toBeInTheDocument();
  });

  it('keeps Copy / Link / PDF available when locked', () => {
    render(<OfferView {...(makeProps({ locked: true }) as any)} />);
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Link')).toBeInTheDocument();
  });

  it('fires onDuplicate from the banner Duplizieren button', async () => {
    const onDuplicate = vi.fn();
    render(<OfferView {...(makeProps({ locked: true, onDuplicate }) as any)} />);
    await userEvent.click(screen.getByText('Duplizieren'));
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it('unlocked offer still shows Save/Send and the banner is absent', () => {
    render(<OfferView {...(makeProps({ locked: false }) as any)} />);
    expect(screen.queryByText('Angenommenes Angebot')).not.toBeInTheDocument();
    expect(screen.getByText('Angebot senden')).toBeInTheDocument();
    expect(screen.getByText('Freie Position')).toBeInTheDocument();
  });
});
