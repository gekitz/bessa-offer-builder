import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────
const listOffersMock = vi.fn();
const listOfferCreatorsMock = vi.fn();

vi.mock('../../../../lib/offerApi', () => ({
  listOffers: () => listOffersMock(),
  listOfferCreators: () => listOfferCreatorsMock(),
  deleteOffer: vi.fn(),
  getOffer: vi.fn(),
  getEmailEvents: vi.fn(),
  updateOfferStage: vi.fn(),
  markOfferLost: vi.fn(),
  listActivities: vi.fn(),
  logActivity: vi.fn(),
}));

// supabase must be truthy or the page renders the "nicht konfiguriert" guard.
vi.mock('../../../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../lib/runOfferAngebotExport', () => ({ runOfferAngebotExport: vi.fn() }));

const useAuthMock = vi.fn(() => ({
  user: { id: 'user-1', email: 'g.kitz@kitz.co.at' },
  profile: null,
}));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => useAuthMock(),
}));

import OfferListPage from '../OfferListPage';

const CREATORS = [
  { id: 'gk', name: 'Georg Kitz', email: 'g.kitz@kitz.co.at' },
  { id: 'hb', name: 'Helmut Bauer', email: 'h.bauer@kitz.co.at' },
];

function offer(partial: Record<string, unknown>) {
  return {
    id: 'offer-x',
    stage: 'new',
    status: 'draft',
    customer_company: 'Acme GmbH',
    customer_name: null,
    customer_email: null,
    creator_name: 'Georg Kitz',
    offer_type: 'pos',
    updated_at: new Date('2026-10-01').toISOString(),
    created_at: new Date('2026-10-01').toISOString(),
    total_monthly: 100,
    total_once: 0,
    total_period: 5000,
    ...partial,
  };
}

beforeEach(() => {
  listOffersMock.mockReset();
  listOfferCreatorsMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'user-1', email: 'g.kitz@kitz.co.at' }, profile: null });
});

describe('OfferListPage — default Ersteller filter', () => {
  it('pre-selects the logged-in user and shows only their offers', async () => {
    listOffersMock.mockResolvedValue([
      offer({ id: 'mine', customer_company: 'Mine GmbH', creator_name: 'Georg Kitz' }),
      offer({ id: 'theirs', customer_company: 'Their GmbH', creator_name: 'Helmut Bauer' }),
    ]);
    listOfferCreatorsMock.mockResolvedValue(CREATORS);

    render(<OfferListPage onLoad={() => {}} onNew={() => {}} onOpenFollowUps={() => {}} />);

    // Once the default resolves the user's own offer is visible and the
    // other rep's offer is filtered out.
    expect(await screen.findByText('Mine GmbH')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Their GmbH')).not.toBeInTheDocument());

    // The dropdown button reflects the pre-selected creator name.
    expect(screen.getByRole('button', { name: /Georg Kitz/ })).toBeInTheDocument();
  });

  it('falls back to "Alle" when the logged-in user matches no employee', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-9', email: 'x.unknown@kitz.co.at' }, profile: null });
    listOffersMock.mockResolvedValue([
      offer({ id: 'mine', customer_company: 'Mine GmbH', creator_name: 'Georg Kitz' }),
      offer({ id: 'theirs', customer_company: 'Their GmbH', creator_name: 'Helmut Bauer' }),
    ]);
    listOfferCreatorsMock.mockResolvedValue(CREATORS);

    render(<OfferListPage onLoad={() => {}} onNew={() => {}} onOpenFollowUps={() => {}} />);

    // No match → the filter stays on 'Alle' and both reps' offers show.
    expect(await screen.findByText('Mine GmbH')).toBeInTheDocument();
    expect(screen.getByText('Their GmbH')).toBeInTheDocument();
  });
});
