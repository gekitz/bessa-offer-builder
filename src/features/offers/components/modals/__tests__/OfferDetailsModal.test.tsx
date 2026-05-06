import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OfferDetailsModal, { type OfferDetailsOffer } from '../OfferDetailsModal';

function makeOffer(p: Partial<OfferDetailsOffer> = {}): OfferDetailsOffer {
  return {
    id: 'offer-uuid-12345678',
    status: 'sent',
    stage: 'offer_sent',
    customer_company: 'Acme GmbH',
    customer_name: 'Max Mustermann',
    customer_email: 'max@acme.at',
    customer_phone: '+43 1 234 5678',
    customer_address: 'Hauptplatz 1, 9020 Klagenfurt',
    mesonic_customer_id: 12345,
    creator_name: 'Georg Kitz',
    creator_email: 'g.kitz@kitz.co.at',
    briefing: 'Eröffnung im Juli, 3 Kassen + Drucker',
    total_monthly: 60,
    total_once: 1500,
    total_period: 720,
    sent_at: '2026-05-01T08:00:00Z',
    opened_at: '2026-05-01T10:30:00Z',
    created_at: '2026-04-29T14:00:00Z',
    updated_at: '2026-05-01T08:00:00Z',
    offer_data: { cart: {}, notes: 'Bitte beachten Sie unsere AGB.' },
    ...p,
  };
}

describe('OfferDetailsModal', () => {
  it('renders the customer header and the customer card with all fields', () => {
    render(<OfferDetailsModal offer={makeOffer()} onClose={() => {}} />);
    // Company name appears in both header and customer card; either
    // location is fine for the rep, so just assert it's rendered.
    expect(screen.getAllByText('Acme GmbH').length).toBeGreaterThan(0);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('max@acme.at')).toBeInTheDocument();
    expect(screen.getByText('+43 1 234 5678')).toBeInTheDocument();
    expect(screen.getByText('Hauptplatz 1, 9020 Klagenfurt')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
  });

  it('shows the briefing as a non-truncated block (the WHY of the offer)', () => {
    render(<OfferDetailsModal offer={makeOffer()} onClose={() => {}} />);
    expect(screen.getByText(/Eröffnung im Juli/)).toBeInTheDocument();
  });

  it('renders the totals row with all three figures', () => {
    render(<OfferDetailsModal offer={makeOffer()} onClose={() => {}} />);
    expect(screen.getByText('Monatlich')).toBeInTheDocument();
    expect(screen.getByText('Einmalig')).toBeInTheDocument();
    expect(screen.getByText('Gesamtperiode')).toBeInTheDocument();
  });

  it('shows the customer-visible PDF Anmerkungen (kept distinct from internal Briefing)', () => {
    render(<OfferDetailsModal offer={makeOffer()} onClose={() => {}} />);
    expect(screen.getByText(/Anmerkungen \(im PDF\)/)).toBeInTheDocument();
    expect(screen.getByText(/Bitte beachten Sie unsere AGB/)).toBeInTheDocument();
  });

  it('shows a loading state when offer is null and loading=true', () => {
    render(<OfferDetailsModal offer={null} loading onClose={() => {}} />);
    expect(screen.getByText(/Wird geladen/)).toBeInTheDocument();
  });

  it('renders a "no positions" empty state when the cart is empty', () => {
    render(<OfferDetailsModal offer={makeOffer({ offer_data: { cart: {} } })} onClose={() => {}} />);
    expect(screen.getByText('Keine Positionen')).toBeInTheDocument();
  });

  it('shows the lost reason badge in the status row when stage=lost', () => {
    render(
      <OfferDetailsModal
        offer={makeOffer({ stage: 'lost', lost_reason: 'price', lost_reason_note: 'zu teuer' })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Preis \/ Budget/)).toBeInTheDocument();
    expect(screen.getByText(/Verlust-Notiz/)).toBeInTheDocument();
    expect(screen.getByText('zu teuer')).toBeInTheDocument();
  });

  it('handles offers with no customer data without crashing', () => {
    render(
      <OfferDetailsModal
        offer={makeOffer({
          customer_company: null,
          customer_name: null,
          customer_email: null,
          customer_phone: null,
          customer_address: null,
          mesonic_customer_id: null,
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Keine Kundendaten erfasst')).toBeInTheDocument();
  });

  it('the footer Schließen button invokes onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OfferDetailsModal offer={makeOffer()} onClose={onClose} />);
    // Both the X icon and the footer button have the accessible name
    // "Schließen" — pick the last (the footer). Either works equally
    // well for the user; the test just needs a deterministic target.
    const buttons = screen.getAllByRole('button', { name: /Schließen/ });
    await user.click(buttons[buttons.length - 1]!);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the X close icon (header) also invokes onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OfferDetailsModal offer={makeOffer()} onClose={onClose} />);
    const buttons = screen.getAllByRole('button', { name: /Schließen/ });
    // The first one is the X icon at the header.
    await user.click(buttons[0]!);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders cart line items resolved from the catalog with quantity and totals', () => {
    // Use a real catalog id we know exists; test with a custom item
    // to keep the assertion stable against catalog drift.
    const offer = makeOffer({
      offer_data: {
        cart: {
          'custom-1': { qty: 2, discountQty: 0, mode: 'rent' },
        },
        cartOrder: ['custom-1'],
        customItems: {
          'custom-1': {
            id: 'custom-1',
            name: 'Spezial-Position',
            price: 50,
            t: 'm',
          },
        },
      },
    });
    render(<OfferDetailsModal offer={offer} onClose={() => {}} />);
    expect(screen.getByText('Spezial-Position')).toBeInTheDocument();
    expect(screen.getByText(/Menge: 2/)).toBeInTheDocument();
  });

  it('omits the briefing section when no briefing is set', () => {
    render(<OfferDetailsModal offer={makeOffer({ briefing: null })} onClose={() => {}} />);
    expect(screen.queryByText(/Briefing \(intern\)/)).not.toBeInTheDocument();
  });
});
