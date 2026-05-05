import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OfferView from '../OfferView';
import { TEAM } from '../../data/catalogs';

const noopProps = {
  cart: {},
  customer: { name: '', company: '', email: '', phone: '', address: '' },
  setCustomer: () => {},
  notes: '',
  setNotes: () => {},
  totals: { monthlyTotal: 0, onceTotal: 0, periodTotal: 0 },
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

describe('OfferView Ersteller dropdown', () => {
  it('renders the Select dropdown even when a creator is already set so a different employee can be picked', async () => {
    const setCreator = vi.fn();
    render(
      <OfferView
        {...noopProps}
        creator="gkitz"
        setCreator={setCreator}
      />,
    );

    // The trigger button must be present (the bug rendered a static div instead).
    const trigger = screen.getByRole('button', { name: /ersteller/i });
    expect(trigger).toBeInTheDocument();
    // And the currently-selected name must be on the trigger.
    expect(trigger).toHaveTextContent('Georg Kitz');

    await userEvent.click(trigger);
    // Every TEAM member must be selectable.
    for (const member of TEAM) {
      expect(screen.getByRole('option', { name: new RegExp(member.name, 'i') })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('option', { name: /helmut bauer/i }));
    expect(setCreator).toHaveBeenCalledWith('hbauer');
  });

  it('shows the dropdown with placeholder when creator is empty', () => {
    render(
      <OfferView
        {...noopProps}
        creator=""
        setCreator={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /ersteller/i })).toHaveTextContent(/erstellt von/i);
  });
});
