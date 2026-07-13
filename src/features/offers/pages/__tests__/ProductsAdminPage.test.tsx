import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ProductsAdminPage from '../ProductsAdminPage';
import * as productApi from '../../api/productApi';

vi.mock('../../api/productApi');

function makeProduct(over: Partial<productApi.Product>): productApi.Product {
  return {
    id: over.id ?? crypto.randomUUID(),
    code: null,
    name: 'Produkt',
    catalog: 'BESSA',
    category: null,
    kind: 'm',
    note: null,
    info: null,
    pricing: {},
    attrs: {},
    autoAdd: null,
    active: true,
    sort: 0,
    ...over,
  };
}

const PRODUCTS: productApi.Product[] = [
  makeProduct({ id: 'p1', name: 'Mobile Kassa', catalog: 'BESSA', category: 'Kassa – Mobil', sort: 0 }),
  makeProduct({ id: 'p2', name: 'Handel Kassa', catalog: 'BESSA', category: 'Kassa – Handel', sort: 1 }),
  makeProduct({ id: 'p3', name: 'Ohne Kategorie', catalog: 'BESSA', category: null, sort: 2 }),
  makeProduct({ id: 'p4', name: 'Anderer Katalog', catalog: 'MELZER', category: 'Melzer – Basis', sort: 0 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(productApi.listProductsAdmin).mockResolvedValue(PRODUCTS);
  vi.mocked(productApi.updateProduct).mockImplementation(async (id, patch) =>
    makeProduct({ ...PRODUCTS.find((p) => p.id === id)!, ...patch }),
  );
  vi.mocked(productApi.deleteProduct).mockResolvedValue(undefined);
});

async function openEditor(name: string) {
  render(<ProductsAdminPage />);
  const row = (await screen.findByText(name)).closest('li') as HTMLElement;
  fireEvent.click(within(row).getByLabelText('Bearbeiten'));
  return screen.getByRole('heading', { name: 'Produkt bearbeiten' }).closest('div') as HTMLElement;
}

describe('ProductsAdminPage — Kategorie picker', () => {
  it('shows each product’s category in the list', async () => {
    render(<ProductsAdminPage />);
    expect(await screen.findByText('Kassa – Mobil')).toBeInTheDocument();
    expect(screen.getByText('Kassa – Handel')).toBeInTheDocument();
  });

  it('offers existing categories of the same catalog as pickable chips', async () => {
    await openEditor('Ohne Kategorie');
    // Chips for the other BESSA categories, not the MELZER one.
    expect(screen.getByRole('button', { name: 'Kassa – Mobil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kassa – Handel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Melzer – Basis' })).not.toBeInTheDocument();
  });

  it('clicking a chip fills the category input', async () => {
    await openEditor('Ohne Kategorie');
    const input = screen.getByPlaceholderText('z. B. Kassa – Mobil') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Kassa – Mobil' }));
    expect(input.value).toBe('Kassa – Mobil');
  });

  it('saves a newly typed category', async () => {
    await openEditor('Ohne Kategorie');
    const input = screen.getByPlaceholderText('z. B. Kassa – Mobil');
    fireEvent.change(input, { target: { value: 'Kassa – Gastro' } });
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }));
    await waitFor(() =>
      expect(productApi.updateProduct).toHaveBeenCalledWith(
        'p3',
        expect.objectContaining({ category: 'Kassa – Gastro' }),
      ),
    );
  });
});

describe('ProductsAdminPage — ordering', () => {
  it('renders each catalog’s products in sort order, not array order', async () => {
    // Returned out of sort order on purpose (sort: 2, 0, 1 within BESSA).
    vi.mocked(productApi.listProductsAdmin).mockResolvedValue([
      makeProduct({ id: 'a', name: 'Third', catalog: 'BESSA', sort: 2 }),
      makeProduct({ id: 'b', name: 'First', catalog: 'BESSA', sort: 0 }),
      makeProduct({ id: 'c', name: 'Second', catalog: 'BESSA', sort: 1 }),
    ]);
    render(<ProductsAdminPage />);
    await screen.findByText('First');
    const names = screen.getAllByTestId('product-row').map((row) => within(row).getByText(/First|Second|Third/).textContent);
    expect(names).toEqual(['First', 'Second', 'Third']);
  });
});

describe('ProductsAdminPage — delete', () => {
  it('requires confirmation before deleting', async () => {
    await openEditor('Mobile Kassa');
    // First click only reveals the confirmation, does not delete.
    fireEvent.click(screen.getByRole('button', { name: /^löschen$/i }));
    expect(productApi.deleteProduct).not.toHaveBeenCalled();
    expect(screen.getByText(/wirklich endgültig löschen/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ja, löschen/i }));
    await waitFor(() => expect(productApi.deleteProduct).toHaveBeenCalledWith('p1'));
  });

  it('can cancel the delete confirmation', async () => {
    await openEditor('Mobile Kassa');
    fireEvent.click(screen.getByRole('button', { name: /^löschen$/i }));
    fireEvent.click(within(screen.getByText(/wirklich endgültig löschen/i).closest('div')!).getByRole('button', { name: /abbrechen/i }));
    expect(screen.queryByText(/wirklich endgültig löschen/i)).not.toBeInTheDocument();
    expect(productApi.deleteProduct).not.toHaveBeenCalled();
  });

  it('removes the product from the list after deletion', async () => {
    await openEditor('Mobile Kassa');
    fireEvent.click(screen.getByRole('button', { name: /^löschen$/i }));
    fireEvent.click(screen.getByRole('button', { name: /ja, löschen/i }));
    await waitFor(() => expect(screen.queryByText('Mobile Kassa')).not.toBeInTheDocument());
  });

  it('shows no delete button when adding a new product', async () => {
    render(<ProductsAdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: /neues produkt/i }));
    expect(screen.queryByRole('button', { name: /^löschen$/i })).not.toBeInTheDocument();
  });
});
