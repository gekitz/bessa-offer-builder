import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// The anonymous accept page must render payment plans purely from the frozen
// acceptSnapshot — it can no longer read the product catalog (RLS blocks anon
// from `products`, and the bundled fallback was removed). These tests would
// fail if AcceptPage still depended on the catalog to compute totals.
const getOfferByShareCode = vi.fn();

vi.mock('../../../../lib/offerApi', () => ({
  getOfferByShareCode: (code: string) => getOfferByShareCode(code),
  acceptOfferWithSignature: vi.fn(),
}));

vi.mock('../../../../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import AcceptPage from '../AcceptPage';

const baseOffer = {
  accepted_at: null,
  payment_enabled: true,
  customer_company: 'ACME GmbH',
  service_start_date: '2026-08-01',
  total_monthly: 0,
  total_once: 0,
  total_period: 0,
  offer_data: {
    globalTier: '12mo',
    raten: 12,
    acceptSnapshot: { monthly: 100, once: 500, yearly: 0, periodTotal: 1700, maxMonths: 12 },
  },
};

describe('AcceptPage payment plans (snapshot-only)', () => {
  beforeEach(() => {
    getOfferByShareCode.mockReset();
  });

  it('renders payment plans from acceptSnapshot without the product catalog', async () => {
    getOfferByShareCode.mockResolvedValue(baseOffer);

    render(<AcceptPage shareCode="abc" />);

    expect(await screen.findByText('Angebot annehmen')).toBeInTheDocument();
    expect(screen.getByText('Standard wählen')).toBeInTheDocument();
    // periodTotal > 0 → Ratenzahlung + Miete plans are surfaced.
    expect(screen.getByText('Ratenzahlung wählen')).toBeInTheDocument();
    expect(screen.getByText('Miete wählen')).toBeInTheDocument();
  });

  it('does not crash when acceptSnapshot is missing (guards with zeros)', async () => {
    getOfferByShareCode.mockResolvedValue({
      ...baseOffer,
      offer_data: { globalTier: '12mo', raten: 12 },
    });

    render(<AcceptPage shareCode="abc" />);

    expect(await screen.findByText('Angebot annehmen')).toBeInTheDocument();
    // With zeroed totals there are no period-based plans, only Standard.
    expect(screen.getByText('Standard wählen')).toBeInTheDocument();
    expect(screen.queryByText('Ratenzahlung wählen')).not.toBeInTheDocument();
    expect(screen.queryByText('Miete wählen')).not.toBeInTheDocument();
  });
});
