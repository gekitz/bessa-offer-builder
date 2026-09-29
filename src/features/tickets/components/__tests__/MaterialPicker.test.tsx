import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaterialPicker from '../MaterialPicker';

// Mock the Mesonic client — we drive search + price responses per test.
vi.mock('../../../../lib/mesonicApi', () => ({
  baseArticleNumber: (n: string) => n.replace(/(KL|WO)$/i, ''),
  searchArticles: vi.fn(),
  getArticlePrice: vi.fn(),
}));

import { searchArticles, getArticlePrice } from '../../../../lib/mesonicApi';

const ARTICLE = { Artikelnummer: '16030051', Artikelbezeichnung: 'Bondrucker' };

async function searchAndPick(user: ReturnType<typeof userEvent.setup>) {
  (searchArticles as ReturnType<typeof vi.fn>).mockResolvedValue({ records: [ARTICLE] });
  await user.type(screen.getByPlaceholderText(/Artikelnummer oder Bezeichnung/), 'Bon');
  const result = await screen.findByText('Bondrucker');
  await user.click(result);
}

describe('MaterialPicker price prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills the unit price with the Mesonic VK when an article is picked', async () => {
    const user = userEvent.setup();
    (getArticlePrice as ReturnType<typeof vi.fn>).mockResolvedValue(12.5);

    render(<MaterialPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await searchAndPick(user);

    // Base number (no KL/WO suffix) is what we look the price up for.
    await waitFor(() => expect(getArticlePrice).toHaveBeenCalledWith('16030051'));
    expect(await screen.findByDisplayValue('12,50')).toBeInTheDocument();
    expect(screen.getByText(/aus Mesonic vorausgefüllt/)).toBeInTheDocument();
  });

  it('shows a loading hint while the price is being fetched', async () => {
    const user = userEvent.setup();
    let resolvePrice: (v: number | null) => void = () => {};
    (getArticlePrice as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((r) => { resolvePrice = r; }),
    );

    render(<MaterialPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await searchAndPick(user);

    expect(screen.getByText(/wird aus Mesonic geladen/)).toBeInTheDocument();
    await act(async () => { resolvePrice(9); });
    expect(await screen.findByDisplayValue('9,00')).toBeInTheDocument();
  });

  it('falls back to manual entry when no Mesonic price exists', async () => {
    const user = userEvent.setup();
    (getArticlePrice as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    render(<MaterialPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await searchAndPick(user);

    expect(await screen.findByText(/Kein Mesonic-Preis gefunden/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0,00')).toHaveValue('');
  });

  it('does not block manual entry when the price lookup throws', async () => {
    const user = userEvent.setup();
    (getArticlePrice as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('proxy down'));

    render(<MaterialPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await searchAndPick(user);

    expect(await screen.findByText(/Kein Mesonic-Preis gefunden/)).toBeInTheDocument();
    // No error banner — a price failure is silent, the tech just types the price.
    expect(screen.queryByText('proxy down')).not.toBeInTheDocument();
  });

  it('submits the prefilled price to onSelect', async () => {
    const user = userEvent.setup();
    (getArticlePrice as ReturnType<typeof vi.fn>).mockResolvedValue(12.5);
    const onSelect = vi.fn().mockResolvedValue(undefined);

    render(<MaterialPicker onSelect={onSelect} onClose={vi.fn()} />);
    await searchAndPick(user);
    await screen.findByDisplayValue('12,50');
    await user.click(screen.getByRole('button', { name: /Hinzufügen/ }));

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          mesonicArtikelNr: '16030051',
          bezeichnung: 'Bondrucker',
          quantity: 1,
          unitPrice: 12.5,
        }),
      ),
    );
  });
});
