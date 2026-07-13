import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// The acceptance-details screen depends on TIER_MONTHS. A missing import there
// previously threw "TIER_MONTHS is not defined" at render time, producing a
// blank white screen right after the customer signed (offer.accepted_at set).
const getOfferByShareCode = vi.fn();

vi.mock('../../../../lib/offerApi', () => ({
  getOfferByShareCode: (code: string) => getOfferByShareCode(code),
  acceptOfferWithSignature: vi.fn(),
}));

vi.mock('../../../../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import AcceptPage from '../AcceptPage';

const acceptedOffer = {
  accepted_at: '2026-07-13T10:00:00.000Z',
  plan_chosen: 'standard',
  payment_enabled: true,
  total_monthly: 100,
  total_once: 500,
  total_period: 1700,
  service_start_date: '2026-08-01',
  offer_data: { globalTier: '12mo', raten: 12 },
};

describe('AcceptPage acceptance details', () => {
  beforeEach(() => {
    getOfferByShareCode.mockReset();
  });

  it('renders the acceptance confirmation without crashing when the offer is accepted', async () => {
    getOfferByShareCode.mockResolvedValue(acceptedOffer);

    render(<AcceptPage shareCode="abc123" />);

    // If TIER_MONTHS were unresolved this render would throw and show nothing.
    expect(await screen.findByText('Angebot angenommen')).toBeInTheDocument();
    expect(screen.getByText('ZAHLUNGSPLAN')).toBeInTheDocument();
  });

  it('hides Stripe payment-plan and billing sections for signature-only acceptances', async () => {
    getOfferByShareCode.mockResolvedValue({
      ...acceptedOffer,
      payment_enabled: false,
      plan_chosen: null,
    });

    render(<AcceptPage shareCode="abc123" />);

    // Confirmation still shows...
    expect(await screen.findByText('Angebot angenommen')).toBeInTheDocument();
    // ...but the Stripe-only plan/billing blocks must not leak.
    expect(screen.queryByText('ZAHLUNGSPLAN')).not.toBeInTheDocument();
    expect(screen.queryByText('ABRECHNUNG')).not.toBeInTheDocument();
    expect(screen.queryByText('Keine Details verfügbar')).not.toBeInTheDocument();
  });
});
