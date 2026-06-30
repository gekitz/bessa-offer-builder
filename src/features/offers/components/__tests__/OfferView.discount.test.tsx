import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OfferView from '../OfferView';
import { fmt } from '../../../../lib/format';

// Totals for a 1000 € first-year deal (once-only so the math is easy to assert).
const totals = {
  monthly: 0,
  once: 1000,
  yearly: 0,
  periodTotal: 1000,
  periodMonthly: 0,
  maxMonths: 12,
};

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
};

// Drives the Rabatt/Skonto toggles through real state, like OfferBuilderPage does.
function Harness() {
  const [rabattActive, setRabattActive] = useState(false);
  const [skontoActive, setSkontoActive] = useState(false);
  return (
    <OfferView
      {...baseProps}
      rabattActive={rabattActive}
      setRabattActive={setRabattActive}
      skontoActive={skontoActive}
      setSkontoActive={setSkontoActive}
    />
  );
}

// €-amounts render as three text nodes ("€ " + value + " brutto"). Testing
// Library normalizes the de-AT narrow-no-break thousands separator to a plain
// space, so we match the bare value node against an equally-normalized fmt().
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
// The value sits between "€ " and " brutto" text siblings in one div, so the
// smallest matching element is that whole "€ <value> brutto" line.
const money = (n: number) => (content: string) => norm(content) === norm(`€ ${fmt(n)} brutto`);

describe('OfferView Rabatt & Skonto', () => {
  it('shows no discount markers by default', () => {
    render(<Harness />);
    expect(screen.queryByText(/inkl. 2% Rabatt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bei Zahlung innerhalb/)).not.toBeInTheDocument();
    // The discounted period total only appears once Rabatt is on.
    expect(screen.queryByText(money(1176))).not.toBeInTheDocument();
  });

  it('applies 2% Rabatt to the first-year total when toggled', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '2% Rabatt' }));
    // 1000 - 2% = 980 netto -> 1176 brutto (unique to the discounted period total)
    expect(screen.getByText(money(1176))).toBeInTheDocument();
    expect(screen.getByText(/inkl. 2% Rabatt/)).toBeInTheDocument();
  });

  it('shows the conditional Skonto note with computed savings when toggled', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '3% Skonto' }));
    expect(screen.getByText(/Bei Zahlung innerhalb 10 Tagen/)).toBeInTheDocument();
    // 3% of 1200 = 36 -> 1164 brutto
    expect(screen.getByText(money(1164))).toBeInTheDocument();
  });

  it('stacks Skonto on top of the discounted total when both are active', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '2% Rabatt' }));
    await userEvent.click(screen.getByRole('button', { name: '3% Skonto' }));
    // 1176 brutto - 3% = 1140.72
    expect(screen.getByText(money(1140.72))).toBeInTheDocument();
  });
});
