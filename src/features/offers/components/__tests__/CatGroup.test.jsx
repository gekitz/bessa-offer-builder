import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import CatGroup from '../CatGroup';

// Minimal one-off hardware items; only the fields CatGroup / ItemCard touch.
const item = (id, name, cat) => ({ id, name, t: 'o', cat, price: 100 });

const baseProps = { cart: {}, globalTier: '12mo', handlers: {} };

describe('CatGroup category sub-grouping', () => {
  it('renders a sub-heading per category and places items under it', () => {
    const items = [
      item('a', 'Scanner', undefined),
      item('b', '2one Halterung', 'Self Ordering System 2one'),
      item('c', '2one Puck', 'Self Ordering System 2one'),
    ];
    render(<CatGroup title="Hardware" items={items} {...baseProps} />);

    const heading = screen.getByText('Self Ordering System 2one');
    expect(heading).toBeInTheDocument();
    // Both categorised items live under their category block.
    const block = heading.parentElement;
    expect(within(block).getByText('2one Halterung')).toBeInTheDocument();
    expect(within(block).getByText('2one Puck')).toBeInTheDocument();
    // The uncategorised item does not get a heading of its own.
    expect(within(block).queryByText('Scanner')).not.toBeInTheDocument();
  });

  it('renders no category sub-headings when nothing is categorised', () => {
    const items = [item('a', 'Scanner', undefined), item('b', 'Kassenlade', undefined)];
    render(<CatGroup title="Hardware" items={items} {...baseProps} />);

    expect(screen.getByText('Scanner')).toBeInTheDocument();
    expect(screen.getByText('Kassenlade')).toBeInTheDocument();
    // Only the top-level "Hardware" title, no sub-headings.
    expect(screen.queryByText('Ohne Kategorie')).not.toBeInTheDocument();
  });

  it('preserves first-appearance order of categories', () => {
    const items = [
      item('a', 'First', 'Beta'),
      item('b', 'Second', 'Alpha'),
      item('c', 'Third', 'Beta'),
    ];
    render(<CatGroup title="Hardware" items={items} {...baseProps} />);

    const headings = screen.getAllByText(/^(Alpha|Beta)$/).map(el => el.textContent);
    expect(headings).toEqual(['Beta', 'Alpha']);
  });
});
