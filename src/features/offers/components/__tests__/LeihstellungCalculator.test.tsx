import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LeihstellungCalculator from '../LeihstellungCalculator';
import { emptyRentalState, type RentalState } from '../../../../lib/rentalOffer';
import { fmt } from '../../../../lib/format';

// "€ 1.618,00" renders as two text nodes ("€ " + number) and de-AT uses a
// non-breaking thousands separator, so match on the leaf element's normalized
// textContent and build the expected string with fmt(). A value can appear in
// more than one place (totals + offer-line preview), so match all.
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const money = (n: number) =>
  screen.getAllByText(
    (_, el) => el?.children.length === 0 && norm(el.textContent || '') === norm(`€ ${fmt(n)}`),
  );

// A tiny stateful host so clicks actually mutate the controlled state, the way
// OfferBuilderPage drives the component.
function Host({ initial, onChangeSpy }: { initial?: RentalState; onChangeSpy?: (s: RentalState) => void }) {
  const [rental, setRental] = useState<RentalState>(initial ?? emptyRentalState());
  return (
    <LeihstellungCalculator
      rental={rental}
      onChange={(next) => {
        onChangeSpy?.(next);
        setRental(next);
      }}
    />
  );
}

const populated: RentalState = {
  term: '6mo',
  hardware: { 'standalone-mobile': 2 },
  services: { fiskalisierung: 2, arbeitszeit: 2 },
  software: {
    '3942f638-1abb-4be9-85a5-d3bf442aa3d8': 2, // Mobile Kassa
    '65e7e1a8-23b3-444f-8b18-c5ca7312cf28': 2, // Anbindung Kartenzahlungsterminal
  },
};

describe('LeihstellungCalculator', () => {
  it('renders the three timespan pills and a row from each bucket', () => {
    render(<Host />);
    expect(screen.getByRole('button', { name: '1–3 Tage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 Monate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6 Monate' })).toBeInTheDocument();
    expect(screen.getByText('Hauptkasse')).toBeInTheDocument(); // hardware
    expect(screen.getByText('Arbeitszeit')).toBeInTheDocument(); // service
    expect(screen.getByText('Mobile Kassa')).toBeInTheDocument(); // software (from bessa)
  });

  it('shows the spreadsheet totals for the populated 6-Monate scenario', () => {
    render(<Host initial={populated} />);
    expect(money(1618).length).toBeGreaterThan(0); // Netto (totals + offer-line)
    expect(money(1941.6).length).toBeGreaterThan(0); // Brutto
  });

  it('recomputes totals when the timespan changes', async () => {
    const user = userEvent.setup();
    render(<Host initial={populated} />);
    await user.click(screen.getByRole('button', { name: '2 Monate' }));
    expect(money(1071).length).toBeGreaterThan(0); // 2-Monate netto
  });

  it('stepping the first hardware row up reports the new quantity to onChange', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Host onChangeSpy={spy} />);
    // Hauptkasse is the first row in the Hardware section (pills have no stepper).
    await user.click(screen.getAllByRole('button', { name: 'Mehr' })[0]!);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ hardware: expect.objectContaining({ hauptkasse: 1 }) }),
    );
  });
});
