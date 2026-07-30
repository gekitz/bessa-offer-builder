import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { fmt } from '../../../../lib/format';
import { VAT, computePlanPricing, planBasisFromOffer } from '../../../../lib/planPricing';

// What the customer sees on the accept page must be, cent for cent, what
// stripe-complete-acceptance charges. Both sides go through the shared
// planPricing module — these tests pin the page to it, so any drift back to
// inline math (the pre-refactor state, where e.g. the 2% Rabatt was shown in
// the PDF but not applied to the charge) fails loudly.
const getOfferByShareCode = vi.fn();

vi.mock('../../../../lib/offerApi', () => ({
  getOfferByShareCode: (code: string) => getOfferByShareCode(code),
  acceptOfferWithSignature: vi.fn(),
}));

vi.mock('../../../../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import AcceptPage from '../AcceptPage';

// Deliberately uneven numbers + Rabatt + a non-12 term so every formula
// component (VAT, 8%, 30%, /raten, /months, 2% Rabatt) shows up in the output.
const offer = {
  accepted_at: null,
  payment_enabled: true,
  customer_company: 'ACME GmbH',
  service_start_date: '2026-08-01',
  total_monthly: 0, // stale columns — the snapshot must win
  total_once: 0,
  total_period: 0,
  offer_data: {
    globalTier: '12mo',
    raten: 10,
    rabattActive: true,
    acceptSnapshot: { monthly: 123.45, once: 678.9, yearly: 67.89, periodTotal: 2228.19, maxMonths: 12 },
  },
};

const pricing = computePlanPricing(planBasisFromOffer(offer));

describe('AcceptPage plan cards show exactly the charged amounts', () => {
  beforeEach(() => {
    getOfferByShareCode.mockReset();
    getOfferByShareCode.mockResolvedValue(offer);
  });

  it('standard card renders the shared standard amounts', async () => {
    const { container } = render(<AcceptPage shareCode="abc" />);
    await screen.findByText('Standard wählen');

    const text = container.textContent ?? '';
    expect(text).toContain(`€ ${fmt(pricing.standard.onceBrutto)}`);
    expect(text).toContain(`€ ${fmt(pricing.standard.monthlyBrutto)}/Mo`);
    expect(text).toContain(`€ ${fmt(pricing.standard.yearlyBrutto)}/J`);
  });

  it('every gross amount carries a net + USt breakdown that reconciles with the quoted net', async () => {
    const { container } = render(<AcceptPage shareCode="abc" />);
    await screen.findByText('Standard wählen');

    const text = container.textContent ?? '';
    // gross / VAT restates the snapshot's quoted net values verbatim.
    const snap = offer.offer_data.acceptSnapshot;
    expect(text).toContain(`€ ${fmt(snap.monthly)} netto`);
    expect(text).toContain(`€ ${fmt(snap.once)} netto`);
    const rate = pricing.ratenzahlung.ratePerMonthBrutto;
    expect(text).toContain(`€ ${fmt(rate / VAT)} netto + € ${fmt(rate - rate / VAT)} USt`);
  });

  it('the Kaution (refundable deposit) shows no VAT breakdown', async () => {
    const { container } = render(<AcceptPage shareCode="abc" />);
    await screen.findByText('Miete wählen');

    const text = container.textContent ?? '';
    const depositNet = pricing.miete.depositBrutto / VAT;
    expect(text).not.toContain(`€ ${fmt(depositNet)} netto`);
  });

  it('ratenzahlung card renders the shared financed amounts (incl. Rabatt)', async () => {
    const { container } = render(<AcceptPage shareCode="abc" />);
    await screen.findByText('Ratenzahlung wählen');

    const text = container.textContent ?? '';
    expect(text).toContain(`€ ${fmt(pricing.ratenzahlung.totalBrutto)}`);
    expect(text).toContain(`€ ${fmt(pricing.ratenzahlung.anzahlungBrutto)}`);
    expect(text).toContain(`€ ${fmt(pricing.ratenzahlung.ratePerMonthBrutto)}/Mo`);
    // The raten count from offer_data drives the labels.
    expect(screen.getByText('Rate (10×)')).toBeInTheDocument();
  });

  it('miete card renders the shared deposit and monthly rent', async () => {
    const { container } = render(<AcceptPage shareCode="abc" />);
    await screen.findByText('Miete wählen');

    const text = container.textContent ?? '';
    expect(text).toContain(`€ ${fmt(pricing.miete.depositBrutto)}`);
    expect(text).toContain(`€ ${fmt(pricing.miete.monthlyBrutto)}/Mo`);
  });
});

describe('AcceptanceDetails restates the charged plan', () => {
  it('ratenzahlung confirmation shows the same financed figures', async () => {
    getOfferByShareCode.mockReset();
    getOfferByShareCode.mockResolvedValue({
      ...offer,
      accepted_at: '2026-07-30T10:00:00.000Z',
      plan_chosen: 'ratenzahlung',
    });

    const { container } = render(<AcceptPage shareCode="abc" />);
    await screen.findByText('Angebot angenommen');

    const text = container.textContent ?? '';
    expect(text).toContain(`€ ${fmt(pricing.ratenzahlung.totalBrutto)} brutto`);
    expect(text).toContain(`€ ${fmt(pricing.ratenzahlung.anzahlungBrutto)} brutto`);
    expect(text).toContain(`€ ${fmt(pricing.ratenzahlung.ratePerMonthBrutto)}/Monat brutto`);
  });

  it('miete confirmation shows the same rent and deposit', async () => {
    getOfferByShareCode.mockReset();
    getOfferByShareCode.mockResolvedValue({
      ...offer,
      accepted_at: '2026-07-30T10:00:00.000Z',
      plan_chosen: 'miete',
    });

    const { container } = render(<AcceptPage shareCode="abc" />);
    await screen.findByText('Angebot angenommen');

    const text = container.textContent ?? '';
    expect(text).toContain(`€ ${fmt(pricing.miete.depositBrutto)} brutto`);
    expect(text).toContain(`€ ${fmt(pricing.miete.monthlyBrutto)}/Monat brutto`);
  });
});
