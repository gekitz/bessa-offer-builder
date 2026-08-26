import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ProcurementPage from '../ProcurementPage';
import * as api from '../../api/procurementApi';
import * as jarltech from '../../api/jarltechApi';
import type { JarltechItemInfo } from '../../lib/jarltechNormalize';
import type { OrderRequest, PurchaseOrder, RequestableProduct, Supplier } from '../../types';

vi.mock('../../api/procurementApi');
vi.mock('../../api/jarltechApi');
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ profile: { role: 'admin', microsoft_email: 'buyer@kitz.co.at' }, user: null }),
}));

const SUPPLIERS: Supplier[] = [
  { id: 's-jarl', code: 'jarltech', name: 'Jarltech', orderEmail: null, orderMethod: 'api', customerNumber: null, notes: null, active: true, sort: 30, createdAt: '', updatedAt: '' },
  { id: 's-pulsa', code: 'pulsa', name: 'Pulsa', orderEmail: null, orderMethod: 'manual', customerNumber: null, notes: null, active: true, sort: 40, createdAt: '', updatedAt: '' },
];

const PRODUCTS: RequestableProduct[] = [
  { id: 'sunmi-l3', name: 'Sunmi L3', code: 'L3', catalog: 'HARDWARE', supplierId: 's-jarl', altSupplierIds: ['s-pulsa'], jarltechItemId: 'sunmil3jt', supplierArticleNo: null, manufacturerSku: 'SUNMI-L3', ean: null, pulsaBestellnummer: null },
];

function req(id: string, qty: number, requester: string): OrderRequest {
  return {
    id, productId: 'sunmi-l3', productName: 'Sunmi L3', productCode: 'L3', supplierId: 's-jarl',
    qty, note: null, status: 'open', unitPrice: null, customerId: null, customerName: null,
    offerId: null, purchaseOrderId: null, requestedBy: null, orderedAt: null, receivedAt: null,
    createdAt: '', updatedAt: '', _requesterName: requester, _supplierName: 'Jarltech',
  };
}

const REQUESTS: OrderRequest[] = [req('r1', 5, 'Anna'), req('r2', 3, 'Bert'), req('r3', 2, 'Cara')];

const PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'po1', supplierId: 's-jarl', status: 'ordered', note: null, priceQuotes: null,
    orderedBy: null, orderedAt: '2026-08-20T10:00:00Z', receivedAt: null, createdAt: '', updatedAt: '',
    _supplierName: 'Jarltech',
    _requests: [{ ...req('r9', 4, 'Dora'), status: 'ordered', purchaseOrderId: 'po1', unitPrice: 649 }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listSuppliers).mockResolvedValue(SUPPLIERS);
  vi.mocked(api.listRequestableProducts).mockResolvedValue(PRODUCTS);
  vi.mocked(api.listOrderRequests).mockResolvedValue(REQUESTS);
  vi.mocked(api.listPurchaseOrders).mockResolvedValue(PURCHASE_ORDERS);
  vi.mocked(api.createOrderRequest).mockResolvedValue(REQUESTS[0]);
  vi.mocked(api.createPurchaseOrder).mockResolvedValue(PURCHASE_ORDERS[0]);
  vi.mocked(api.updateOrderRequest).mockResolvedValue(REQUESTS[0]);
  vi.mocked(api.markPurchaseOrderReceived).mockResolvedValue({ ...PURCHASE_ORDERS[0], status: 'received' });
  const jtInfo: JarltechItemInfo = { jarltechItemId: 'sunmil3jt', unitPrice: 611.5, listPrice: 690, currency: 'EUR', stock: 37 };
  vi.mocked(jarltech.fetchJarltechPrices).mockResolvedValue(new Map([['sunmil3jt', jtInfo]]));
  // Default: cannot place binding orders (button hidden). Order tests opt in.
  vi.mocked(jarltech.canPlaceJarltechOrder).mockResolvedValue(false);
  vi.mocked(jarltech.placeJarltechOrder).mockResolvedValue({ api_request_id: 60001, message: 'ok' });
  vi.mocked(jarltech.pingJarltech).mockResolvedValue(true);
  vi.mocked(api.matchPulsaItems).mockResolvedValue(new Map());
  vi.mocked(api.triggerPulsaImport).mockResolvedValue({ imported: 0 });
  vi.mocked(api.pulsaLastImportedAt).mockResolvedValue(null);
  vi.mocked(api.sendSupplierTestMail).mockResolvedValue({ to: 'nv@pulsa.de' });
});

describe('ProcurementPage — settings menu', () => {
  it('runs the Jarltech connection test from the cog menu (not inline)', async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(3));

    // Test action lives in the settings menu, not on the Einkauf surface.
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Jarltech Verbindung testen/ }));

    await waitFor(() => expect(jarltech.pingJarltech).toHaveBeenCalledTimes(1));
  });

  it('sends a Pulsa test mail (no attachment) from the settings menu', async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(3));
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Testmail ohne Anhang/ }));
    await waitFor(() =>
      expect(api.sendSupplierTestMail).toHaveBeenCalledWith({ supplierId: 's-pulsa', withAttachment: false }),
    );
  });
});

describe('ProcurementPage — Anfragen', () => {
  it('lists existing requests', async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(3));
  });

  it('creates a request from the catalog-search form', async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(3));

    fireEvent.change(screen.getByPlaceholderText('Produkt suchen oder frei eingeben…'), {
      target: { value: 'Sunmi' },
    });
    // The catalog-search dropdown option is a button (the 3 request rows
    // that also say "Sunmi L3" are list items, not buttons).
    fireEvent.click(await screen.findByRole('button', { name: /Sunmi L3/ }));
    fireEvent.click(screen.getByRole('button', { name: /Anfrage hinzufügen/ }));

    await waitFor(() => expect(api.createOrderRequest).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(api.createOrderRequest).mock.calls[0][0];
    expect(arg.productId).toBe('sunmi-l3');
    expect(arg.supplierId).toBe('s-jarl'); // preferred supplier prefilled from product
    expect(arg.qty).toBe(1);
  });

  it('cancels an open request', async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(3));
    fireEvent.click(screen.getAllByLabelText('Anfrage stornieren')[0]);
    await waitFor(() => expect(api.updateOrderRequest).toHaveBeenCalledWith('r1', { status: 'cancelled' }));
  });
});

describe('ProcurementPage — Einkauf (admin aggregation)', () => {
  async function gotoEinkauf() {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(3));
    fireEvent.click(screen.getByRole('button', { name: /Einkauf/ }));
  }

  it('aggregates the three open requests into one 10× line under Jarltech', async () => {
    await gotoEinkauf();
    const group = await screen.findByTestId('supplier-group');
    expect(within(group).getAllByText('Jarltech').length).toBeGreaterThan(0);
    const line = within(group).getByTestId('agg-line');
    expect(within(line).getByText('10×')).toBeTruthy();
    expect(within(line).getByText('Sunmi L3')).toBeTruthy();
  });

  it('places a binding Jarltech order (allowed user) and records the consolidated PO', async () => {
    vi.mocked(jarltech.canPlaceJarltechOrder).mockResolvedValue(true);
    await gotoEinkauf();

    // Allowed users get the binding-order button; open it and confirm.
    fireEvent.click(await screen.findByTestId('auto-order-s-jarl'));
    fireEvent.click(await screen.findByRole('button', { name: /verbindlich bestellen/i }));

    // The aggregated 10× line is sent to Jarltech as one order item.
    await waitFor(() => expect(jarltech.placeJarltechOrder).toHaveBeenCalledTimes(1));
    const orderArg = vi.mocked(jarltech.placeJarltechOrder).mock.calls[0][0];
    expect(orderArg.items).toEqual([{ jarltechItemId: 'sunmil3jt', quantity: 10 }]);
    expect(orderArg.shippingAddress.city).toBe('Klagenfurt'); // default Standort

    // Internal consolidated PO records all three underlying requests.
    await waitFor(() => expect(api.createPurchaseOrder).toHaveBeenCalledTimes(1));
    const poArg = vi.mocked(api.createPurchaseOrder).mock.calls[0][0];
    expect(poArg.lines[0].requestIds.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('hides the binding-order action from users without permission', async () => {
    // default canPlaceJarltechOrder → false
    await gotoEinkauf();
    await screen.findByTestId('supplier-group');
    expect(screen.queryByTestId('auto-order-s-jarl')).toBeNull();
    const locked = screen.getByRole('button', { name: /Bei Jarltech bestellen/ });
    expect(locked).toBeDisabled();
  });

  it('prefills the Pulsa price + stock in the compare from the imported price list', async () => {
    vi.mocked(api.matchPulsaItems).mockResolvedValue(
      new Map([['sunmi-l3', { artikelnummer: 'PLS-1', name: 'Sunmi L3', ekNet: 296, verfuegbar: 10 }]]),
    );
    await gotoEinkauf();
    await screen.findByTestId('supplier-group');
    await waitFor(() => {
      expect((screen.getByLabelText('Preis Pulsa') as HTMLInputElement).value).toBe('296');
    });
    expect(screen.getByText('10')).toBeTruthy(); // stock badge
  });

  it('imports the Pulsa price list from the settings menu', async () => {
    vi.mocked(api.triggerPulsaImport).mockResolvedValue({ imported: 1234 });
    await gotoEinkauf();
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Pulsa-Preisliste aktualisieren/ }));
    await waitFor(() => expect(api.triggerPulsaImport).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/1234 Artikel importiert/)).toBeInTheDocument();
  });

  it('reassigns a dual-source line to the alternative supplier', async () => {
    await gotoEinkauf();
    await screen.findByTestId('supplier-group');
    // The compare panel exposes an "umstellen" action for Pulsa (the alt).
    fireEvent.click(screen.getByText('umstellen'));
    await waitFor(() => expect(api.updateOrderRequest).toHaveBeenCalled());
    // All three requests of the line get reassigned to Pulsa.
    const calls = vi.mocked(api.updateOrderRequest).mock.calls;
    expect(calls.map((c) => c[0]).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(calls.every((c) => (c[1] as { supplierId?: string }).supplierId === 's-pulsa')).toBe(true);
  });

  it('marks a purchase order received', async () => {
    await gotoEinkauf();
    fireEvent.click(await screen.findByRole('button', { name: /Erhalten/ }));
    await waitFor(() => expect(api.markPurchaseOrderReceived).toHaveBeenCalledWith('po1'));
  });

  it('auto-loads Jarltech prices when the Einkauf tab opens', async () => {
    await gotoEinkauf();
    // No button click needed — opening Einkauf fetches the open items' prices.
    await waitFor(() => expect(jarltech.fetchJarltechPrices).toHaveBeenCalledWith(['sunmil3jt']));
  });

  it('fetches Jarltech prices and pre-fills the price + stock', async () => {
    await gotoEinkauf();
    await screen.findByTestId('supplier-group');

    // Pull live Jarltech prices for the linked product.
    fireEvent.click(screen.getByRole('button', { name: /Jarltech-Preise abrufen/ }));
    await waitFor(() => expect(jarltech.fetchJarltechPrices).toHaveBeenCalledWith(['sunmil3jt']));

    // The fetched net price lands in the Jarltech price input, stock shows.
    await waitFor(() => {
      expect((screen.getByLabelText('Preis Jarltech') as HTMLInputElement).value).toBe('611.5');
    });
    expect(screen.getByText('37')).toBeTruthy();
  });
});

describe('ProcurementPage — Orderman email order (strategy: email)', () => {
  const OM_SUPPLIER: Supplier = {
    id: 's-order', code: 'orderman', name: 'Orderman', orderEmail: 'sales@orderman.com',
    orderMethod: 'email', customerNumber: null, notes: null, active: true, sort: 10, createdAt: '', updatedAt: '',
  };
  const OM_PRODUCT: RequestableProduct = {
    id: 'orderman10', name: 'Orderman 10', code: 'OM10', catalog: 'ORDERMAN',
    supplierId: 's-order', altSupplierIds: [], jarltechItemId: null,
    supplierArticleNo: 'OM-ART-9', // Orderman article number → goes in the email
    manufacturerSku: null, ean: null, pulsaBestellnummer: null,
  };
  const OM_REQ: OrderRequest = {
    ...req('o1', 6, 'Anna'), productId: 'orderman10', productName: 'Orderman 10',
    productCode: 'OM10', supplierId: 's-order', _supplierName: 'Orderman',
  };

  beforeEach(() => {
    vi.mocked(api.listSuppliers).mockResolvedValue([OM_SUPPLIER]);
    vi.mocked(api.listRequestableProducts).mockResolvedValue([OM_PRODUCT]);
    vi.mocked(api.listOrderRequests).mockResolvedValue([OM_REQ]);
    vi.mocked(api.listPurchaseOrders).mockResolvedValue([]);
    vi.mocked(api.sendSupplierOrderEmail).mockResolvedValue({ to: 'sales@orderman.com' });
  });

  it('sends the order email (no allowlist needed) and records the PO', async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: /Einkauf/ }));

    // Email strategy is not gated → any admin sees the button.
    fireEvent.click(await screen.findByTestId('auto-order-s-order'));
    fireEvent.click(await screen.findByRole('button', { name: /Stück bestellen/i }));

    await waitFor(() => expect(api.sendSupplierOrderEmail).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(api.sendSupplierOrderEmail).mock.calls[0][0];
    expect(arg.supplierId).toBe('s-order');
    // The Orderman article number (supplierArticleNo) is sent as the code,
    // not our internal product code.
    expect(arg.items).toEqual([{ name: 'Orderman 10', code: 'OM-ART-9', qty: 6 }]);
    expect(arg.shippingAddress.city).toBe('Klagenfurt');

    // Internal PO recorded for the emailed request.
    await waitFor(() => expect(api.createPurchaseOrder).toHaveBeenCalledTimes(1));
    const poArg = vi.mocked(api.createPurchaseOrder).mock.calls[0][0];
    expect(poArg.lines[0].requestIds).toEqual(['o1']);
  });
});

describe('ProcurementPage — Pulsa XML order (strategy: email_xml)', () => {
  const P_SUPPLIER: Supplier = {
    id: 's-pulsa2', code: 'pulsa', name: 'Pulsa', orderEmail: 'info@pulsa.de',
    orderMethod: 'email_xml', customerNumber: '11720', notes: null, active: true, sort: 40, createdAt: '', updatedAt: '',
  };
  const P_PRODUCT: RequestableProduct = {
    id: 'bon', name: 'Bonrollen', code: 'BR', catalog: 'HARDWARE',
    supplierId: 's-pulsa2', altSupplierIds: [], jarltechItemId: null, supplierArticleNo: null,
    manufacturerSku: 'MFR-1', ean: null, pulsaBestellnummer: '7201-080.02',
  };
  const P_REQ: OrderRequest = {
    ...req('q1', 40, 'Anna'), productId: 'bon', productName: 'Bonrollen',
    productCode: 'BR', supplierId: 's-pulsa2', _supplierName: 'Pulsa',
  };

  beforeEach(() => {
    vi.mocked(api.listSuppliers).mockResolvedValue([P_SUPPLIER]);
    vi.mocked(api.listRequestableProducts).mockResolvedValue([P_PRODUCT]);
    vi.mocked(api.listOrderRequests).mockResolvedValue([P_REQ]);
    vi.mocked(api.listPurchaseOrders).mockResolvedValue([]);
    vi.mocked(api.sendSupplierOrderXml).mockResolvedValue({ to: 'info@pulsa.de' });
  });

  it('sends an XML order with the Bestellnummer + Kundennummer and records the PO', async () => {
    render(<ProcurementPage />);
    await waitFor(() => expect(screen.getAllByTestId('request-row').length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: /Einkauf/ }));

    fireEvent.click(await screen.findByTestId('auto-order-s-pulsa2'));
    // The confirm footer shows exactly where the order goes.
    expect(await screen.findByText(/an den Lieferanten \(info@pulsa\.de\)/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Stück bestellen/i }));

    await waitFor(() => expect(api.sendSupplierOrderXml).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(api.sendSupplierOrderXml).mock.calls[0][0];
    expect(arg.supplierId).toBe('s-pulsa2');
    // Pulsa requires a constant filename + a subject that always begins the same.
    expect(arg.filename).toBe('Bestellung_KITZ.xml');
    expect(arg.subject).toMatch(/^PULSA Bestellung /);
    expect(arg.xml).toContain('<Bestellnummer>7201-080.02</Bestellnummer>');
    expect(arg.xml).toContain('<Kundennummer>11720</Kundennummer>');
    expect(arg.xml).toContain('<Anzahl>40.00</Anzahl>');
    // Delivery address comes from the Standort picker (default Klagenfurt).
    expect(arg.xml).toContain('<Ort>Klagenfurt</Ort>');

    await waitFor(() => expect(api.createPurchaseOrder).toHaveBeenCalledTimes(1));
  });
});
