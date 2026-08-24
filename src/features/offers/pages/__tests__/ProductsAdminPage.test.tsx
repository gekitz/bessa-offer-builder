import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ProductsAdminPage from '../ProductsAdminPage';
import * as productApi from '../../api/productApi';
import * as procurementApi from '../../../procurement/api/procurementApi';
import * as jarltech from '../../../procurement/api/jarltechApi';
import type { Supplier } from '../../../procurement/types';

vi.mock('../../api/productApi');
vi.mock('../../../procurement/api/procurementApi');
vi.mock('../../../procurement/api/jarltechApi');

function makeSupplier(over: Partial<Supplier>): Supplier {
  return {
    id: over.id ?? 's-x', code: over.code ?? 'x', name: over.name ?? 'Lieferant',
    orderEmail: null, orderMethod: 'manual', notes: null, active: true, sort: 0, createdAt: '', updatedAt: '', ...over,
  };
}

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
    supplierId: null,
    altSupplierIds: [],
    jarltechItemId: null,
    ...over,
  };
}

const PRODUCTS: productApi.Product[] = [
  makeProduct({ id: 'p1', name: 'Mobile Kassa', catalog: 'BESSA', category: 'Kassa – Mobil', sort: 0 }),
  makeProduct({ id: 'p2', name: 'Handel Kassa', catalog: 'BESSA', category: 'Kassa – Handel', sort: 1 }),
  makeProduct({ id: 'p3', name: 'Freies Produkt', catalog: 'BESSA', category: null, sort: 2 }),
  makeProduct({ id: 'p4', name: 'Anderer Katalog', catalog: 'MELZER', category: 'Melzer – Basis', sort: 0 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(productApi.listProductsAdmin).mockResolvedValue(PRODUCTS);
  vi.mocked(productApi.updateProduct).mockImplementation(async (id, patch) =>
    makeProduct({ ...PRODUCTS.find((p) => p.id === id)!, ...patch }),
  );
  vi.mocked(productApi.deleteProduct).mockResolvedValue(undefined);
  // Default: no suppliers (supplier/Jarltech block hidden) — keeps the
  // existing category tests unchanged. Individual tests opt in.
  vi.mocked(procurementApi.listSuppliers).mockResolvedValue([]);
  vi.mocked(jarltech.resolveJarltechId).mockResolvedValue(null);
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
    await openEditor('Freies Produkt');
    // Chips for the other BESSA categories, not the MELZER one.
    expect(screen.getByRole('button', { name: 'Kassa – Mobil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kassa – Handel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Melzer – Basis' })).not.toBeInTheDocument();
  });

  it('clicking a chip fills the category input', async () => {
    await openEditor('Freies Produkt');
    const input = screen.getByPlaceholderText('z. B. Kassa – Mobil') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Kassa – Mobil' }));
    expect(input.value).toBe('Kassa – Mobil');
  });

  it('saves a newly typed category', async () => {
    await openEditor('Freies Produkt');
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

describe('ProductsAdminPage — category grouping', () => {
  it('groups products under category headers within a catalog, like the builder', async () => {
    vi.mocked(productApi.listProductsAdmin).mockResolvedValue([
      makeProduct({ id: 'a', name: 'Mobil A', catalog: 'BESSA', category: 'Kassa – Mobil', sort: 0 }),
      makeProduct({ id: 'b', name: 'Handel B', catalog: 'BESSA', category: 'Kassa – Handel', sort: 1 }),
      makeProduct({ id: 'c', name: 'Mobil C', catalog: 'BESSA', category: 'Kassa – Mobil', sort: 2 }),
    ]);
    render(<ProductsAdminPage />);
    await screen.findByText('Mobil A');
    // Category header appears once per distinct category.
    expect(screen.getAllByRole('heading', { name: 'Kassa – Mobil' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'Kassa – Handel' })).toHaveLength(1);
    // Category order follows first appearance in sort order (Mobil before Handel).
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Kassa – Mobil', 'Kassa – Handel']);
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

describe('ProductsAdminPage — Jarltech SKU lookup', () => {
  beforeEach(() => {
    // Suppliers present → the supplier/Jarltech block renders.
    vi.mocked(procurementApi.listSuppliers).mockResolvedValue([
      makeSupplier({ id: 's-jarl', code: 'jarltech', name: 'Jarltech' }),
    ]);
  });

  it('resolves an exact manufacturer SKU to a Jarltech id and fills the field', async () => {
    vi.mocked(jarltech.resolveJarltechId).mockResolvedValue({
      jarltechItemId: 'v3xyz',
      manufacturerId: 'SUNMI-V3-XYZ',
    });
    await openEditor('Mobile Kassa');

    fireEvent.change(screen.getByPlaceholderText('Exakte Hersteller-Artikelnr.'), {
      target: { value: 'SUNMI-V3-XYZ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Jarltech-ID suchen/ }));

    // Looked up by exact part number (not the ambiguous product name).
    await waitFor(() => expect(jarltech.resolveJarltechId).toHaveBeenCalledWith('SUNMI-V3-XYZ'));
    const jtField = screen.getByPlaceholderText(/für Preis-\/Lagerabruf/) as HTMLInputElement;
    await waitFor(() => expect(jtField.value).toBe('v3xyz'));
    expect(screen.getByText(/Gefunden: v3xyz/)).toBeInTheDocument();
  });

  it('reports when no purchasable item matches the manufacturer number', async () => {
    vi.mocked(jarltech.resolveJarltechId).mockResolvedValue(null);
    await openEditor('Mobile Kassa');

    fireEvent.change(screen.getByPlaceholderText('Exakte Hersteller-Artikelnr.'), {
      target: { value: 'UNKNOWN-SKU' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Jarltech-ID suchen/ }));

    expect(await screen.findByText(/Kein Jarltech-Artikel/)).toBeInTheDocument();
  });
});

describe('ProductsAdminPage — supplier visibility', () => {
  beforeEach(() => {
    vi.mocked(procurementApi.listSuppliers).mockResolvedValue([makeSupplier({ id: 's-jarl', name: 'Jarltech' })]);
    vi.mocked(productApi.listProductsAdmin).mockResolvedValue([
      makeProduct({ id: 'linked', name: 'Linked Prod', catalog: 'HARDWARE', supplierId: 's-jarl' }),
      makeProduct({ id: 'unlinked', name: 'Unlinked Prod', catalog: 'HARDWARE', supplierId: null }),
    ]);
  });

  it('shows a supplier chip only on linked rows; unlinked rows have none', async () => {
    render(<ProductsAdminPage />);
    await screen.findByText('Linked Prod');
    expect(screen.getByText('Jarltech')).toBeInTheDocument(); // supplier chip on the linked row
    // No per-row "Kein Lieferant" clutter — the gap is surfaced only in the header count.
    expect(screen.queryByText('Kein Lieferant')).not.toBeInTheDocument();
    expect(screen.getByText(/1 ohne Lieferant/)).toBeInTheDocument();
  });

  it('filters to only products without a supplier', async () => {
    render(<ProductsAdminPage />);
    await screen.findByText('Linked Prod');
    fireEvent.click(screen.getByRole('button', { name: /Ohne Lieferant/ }));
    expect(screen.queryByText('Linked Prod')).not.toBeInTheDocument();
    expect(screen.getByText('Unlinked Prod')).toBeInTheDocument();
  });

  it('loads and shows the Jarltech Einkaufspreis for linked products', async () => {
    vi.mocked(productApi.listProductsAdmin).mockResolvedValue([
      makeProduct({ id: 'jt', name: 'JT Prod', catalog: 'HARDWARE', supplierId: 's-jarl', jarltechItemId: 'jt123' }),
    ]);
    vi.mocked(jarltech.fetchJarltechPrices).mockResolvedValue(
      new Map([['jt123', { jarltechItemId: 'jt123', unitPrice: 1234.5, listPrice: null, currency: 'EUR', stock: 12 }]]),
    );
    render(<ProductsAdminPage />);
    await screen.findByText('JT Prod');

    fireEvent.click(screen.getByRole('button', { name: /Jarltech-Preise laden/ }));
    await waitFor(() => expect(jarltech.fetchJarltechPrices).toHaveBeenCalledWith(['jt123']));
    expect(await screen.findByText(/EK €/)).toBeInTheDocument();
  });
});
