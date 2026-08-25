// Beschaffungs-API. Spiegelt
// supabase/migrations/20260821120000_create_procurement.sql.
//
// Konvention wie ticketApi.ts: list*/get*/create*/update*, snake_case ↔
// camelCase Mapping ausschließlich hier, sodass der Rest der App mit den
// camelCase-Typen aus ../types arbeitet.

import { supabase } from '../../../lib/supabase';
import type {
  OrderLineDecision,
  OrderRequest,
  OrderRequestFilters,
  OrderRequestInput,
  PriceQuote,
  PulsaMatch,
  PurchaseOrder,
  RequestableProduct,
  Supplier,
} from '../types';

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

// ─────────────────────────────────────────────────────────────────────
// Row mappers (snake_case → camelCase)
// ─────────────────────────────────────────────────────────────────────

function rowToSupplier(r: any): Supplier {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    orderEmail: r.order_email ?? null,
    orderMethod: r.order_method ?? 'manual',
    notes: r.notes ?? null,
    active: !!r.active,
    sort: r.sort ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToRequest(r: any): OrderRequest {
  return {
    id: r.id,
    productId: r.product_id ?? null,
    productName: r.product_name,
    productCode: r.product_code ?? null,
    supplierId: r.supplier_id ?? null,
    qty: Number(r.qty),
    note: r.note ?? null,
    status: r.status,
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    customerId: r.customer_id ?? null,
    customerName: r.customer_name ?? null,
    offerId: r.offer_id ?? null,
    purchaseOrderId: r.purchase_order_id ?? null,
    requestedBy: r.requested_by ?? null,
    orderedAt: r.ordered_at ?? null,
    receivedAt: r.received_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    _requesterName: r.employees?.name,
    _supplierName: r.suppliers?.name,
  };
}

function rowToPurchaseOrder(r: any): PurchaseOrder {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    status: r.status,
    note: r.note ?? null,
    priceQuotes: (r.price_quotes as PriceQuote[]) ?? null,
    orderedBy: r.ordered_by ?? null,
    orderedAt: r.ordered_at,
    receivedAt: r.received_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    _supplierName: r.suppliers?.name,
    _requests: r.order_requests ? (r.order_requests as any[]).map(rowToRequest) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Email ordering strategy (Orderman & any supplier with order_method='email')
// ─────────────────────────────────────────────────────────────────────

import type { ShippingAddress } from '../lib/shipping';

// Send the order e-mail via the send-supplier-order edge function. The
// recipient is resolved server-side from suppliers.order_email by id;
// the signed-in user is CC'd. Returns the destination address on success.
export async function sendSupplierOrderEmail(input: {
  supplierId: string;
  items: Array<{ name: string; code?: string; qty: number }>;
  shippingAddress: ShippingAddress;
  note?: string;
}): Promise<{ to: string }> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('send-supplier-order', {
    body: {
      supplierId: input.supplierId,
      items: input.items,
      shippingAddress: input.shippingAddress,
      note: input.note,
    },
  });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try { const p = await (ctx as Response).json(); if (p?.error) detail = p.error; } catch { /* keep generic */ }
    }
    throw new Error(`Bestell-E-Mail: ${detail}`);
  }
  if (data?.error) throw new Error(`Bestell-E-Mail: ${data.error}`);
  return { to: data?.to ?? '' };
}

// ─────────────────────────────────────────────────────────────────────
// Pulsa price list (mirror in pulsa_items)
// ─────────────────────────────────────────────────────────────────────

// Trigger a fresh import of the Pulsa CSV feed into pulsa_items.
export async function triggerPulsaImport(): Promise<{ imported: number }> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('pulsa-import', { body: {} });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try { const p = await (ctx as Response).json(); if (p?.error) detail = p.error; } catch { /* keep generic */ }
    }
    throw new Error(`Pulsa-Import: ${detail}`);
  }
  if (data?.error) throw new Error(`Pulsa-Import: ${data.error}`);
  return { imported: data?.imported ?? 0 };
}

// PostgREST in-list value: double-quote + escape embedded quotes so values
// with commas/spaces don't break the filter.
function orValue(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

// Resolve products against the mirrored Pulsa price list by EAN (preferred)
// then manufacturer number. Returns a Map productId → PulsaMatch.
export async function matchPulsaItems(
  products: Array<{ id: string; ean: string | null; manufacturerSku: string | null }>,
): Promise<Map<string, PulsaMatch>> {
  const sb = requireSupabase();
  const eans = Array.from(new Set(products.map((p) => p.ean).filter(Boolean))) as string[];
  const skus = Array.from(new Set(products.map((p) => p.manufacturerSku).filter(Boolean))) as string[];
  if (eans.length === 0 && skus.length === 0) return new Map();

  const filters: string[] = [];
  if (eans.length) filters.push(`ean.in.(${eans.map(orValue).join(',')})`);
  if (skus.length) filters.push(`herstellernummer.in.(${skus.map(orValue).join(',')})`);

  const { data, error } = await sb
    .from('pulsa_items')
    .select('artikelnummer, name, ean, herstellernummer, ek_net, verfuegbar')
    .or(filters.join(','));
  if (error) throw error;

  const byEan = new Map<string, any>();
  const bySku = new Map<string, any>();
  for (const r of (data ?? []) as any[]) {
    if (r.ean) byEan.set(String(r.ean), r);
    if (r.herstellernummer) bySku.set(String(r.herstellernummer), r);
  }

  const out = new Map<string, PulsaMatch>();
  for (const p of products) {
    const row = (p.ean && byEan.get(p.ean)) || (p.manufacturerSku && bySku.get(p.manufacturerSku)) || null;
    if (row) {
      out.set(p.id, {
        artikelnummer: row.artikelnummer,
        name: row.name ?? null,
        ekNet: row.ek_net != null ? Number(row.ek_net) : null,
        verfuegbar: row.verfuegbar != null ? Number(row.verfuegbar) : null,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Suppliers
// ─────────────────────────────────────────────────────────────────────

const SUPPLIER_COLS = 'id, code, name, order_email, order_method, notes, active, sort, created_at, updated_at';

export async function listSuppliers(opts: { activeOnly?: boolean } = {}): Promise<Supplier[]> {
  const sb = requireSupabase();
  let q = sb.from('suppliers').select(SUPPLIER_COLS).order('sort');
  if (opts.activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToSupplier);
}

// ─────────────────────────────────────────────────────────────────────
// Bestellbare Produkte (für das Anfrage-Formular)
// ─────────────────────────────────────────────────────────────────────

export async function listRequestableProducts(): Promise<RequestableProduct[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('products')
    .select('id, name, code, catalog, supplier_id, alt_supplier_ids, jarltech_item_id, supplier_article_no, manufacturer_sku, ean')
    .eq('active', true)
    .order('catalog')
    .order('sort');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    code: r.code ?? null,
    catalog: r.catalog,
    supplierId: r.supplier_id ?? null,
    altSupplierIds: (r.alt_supplier_ids as string[]) ?? [],
    jarltechItemId: r.jarltech_item_id ?? null,
    supplierArticleNo: r.supplier_article_no ?? null,
    manufacturerSku: r.manufacturer_sku ?? null,
    ean: r.ean ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Order requests
// ─────────────────────────────────────────────────────────────────────

const REQUEST_COLS =
  'id, product_id, product_name, product_code, supplier_id, qty, note, status, unit_price, customer_id, customer_name, offer_id, purchase_order_id, requested_by, ordered_at, received_at, created_at, updated_at';

export async function listOrderRequests(filters: OrderRequestFilters = {}): Promise<OrderRequest[]> {
  const sb = requireSupabase();
  let q = sb
    .from('order_requests')
    .select(`${REQUEST_COLS}, employees:requested_by(name), suppliers:supplier_id(name)`)
    .order('created_at', { ascending: false });

  if (filters.status?.length) q = q.in('status', filters.status);
  if (filters.supplierId) q = q.eq('supplier_id', filters.supplierId);
  if (filters.requestedBy) q = q.eq('requested_by', filters.requestedBy);
  if (filters.purchaseOrderId) q = q.eq('purchase_order_id', filters.purchaseOrderId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToRequest);
}

// Schlanke Zählung für das Nav-Badge — nur die offenen Anfragen.
export async function countOpenRequests(): Promise<number> {
  const sb = requireSupabase();
  const { count, error } = await sb
    .from('order_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) throw error;
  return count ?? 0;
}

function requestInputToRow(input: OrderRequestInput): Record<string, unknown> {
  return {
    product_id: input.productId ?? null,
    product_name: input.productName,
    product_code: input.productCode ?? null,
    supplier_id: input.supplierId ?? null,
    qty: input.qty,
    note: input.note ?? null,
    customer_id: input.customerId ?? null,
    customer_name: input.customerName ?? null,
    offer_id: input.offerId ?? null,
    requested_by: input.requestedBy ?? null,
  };
}

export async function createOrderRequest(input: OrderRequestInput): Promise<OrderRequest> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('order_requests')
    .insert(requestInputToRow(input))
    .select(REQUEST_COLS)
    .single();
  if (error) throw error;
  return rowToRequest(data);
}

// Teil-Update einer offenen Anfrage: Menge, Notiz, Lieferant umstellen
// (Doppelquelle) oder Status auf 'cancelled' setzen.
export async function updateOrderRequest(
  id: string,
  patch: { qty?: number; note?: string | null; supplierId?: string | null; status?: 'open' | 'cancelled' },
): Promise<OrderRequest> {
  const sb = requireSupabase();
  const db: Record<string, unknown> = {};
  if (patch.qty !== undefined) db.qty = patch.qty;
  if (patch.note !== undefined) db.note = patch.note;
  if (patch.supplierId !== undefined) db.supplier_id = patch.supplierId;
  if (patch.status !== undefined) db.status = patch.status;
  const { data, error } = await sb
    .from('order_requests')
    .update(db)
    .eq('id', id)
    .select(REQUEST_COLS)
    .single();
  if (error) throw error;
  return rowToRequest(data);
}

// ─────────────────────────────────────────────────────────────────────
// Purchase orders (Sammelbestellung auslösen / Wareneingang)
// ─────────────────────────────────────────────────────────────────────

const PO_COLS =
  'id, supplier_id, status, note, price_quotes, ordered_by, ordered_at, received_at, created_at, updated_at';

/**
 * Sammelbestellung an EINEN Lieferanten anlegen und die enthaltenen
 * Anfragen auf 'ordered' setzen. `lines` bündelt die Anfragen je Produkt
 * mit dem beim Bestellen gewählten Stückpreis; alle Anfragen werden dem
 * PO-Lieferanten zugeordnet (falls sie vorher keinen hatten).
 */
export async function createPurchaseOrder(input: {
  supplierId: string;
  lines: OrderLineDecision[];
  orderedBy?: string | null;
  note?: string | null;
  priceQuotes?: PriceQuote[] | null;
}): Promise<PurchaseOrder> {
  const sb = requireSupabase();

  const { data: po, error } = await sb
    .from('purchase_orders')
    .insert({
      supplier_id: input.supplierId,
      note: input.note ?? null,
      price_quotes: input.priceQuotes ?? null,
      ordered_by: input.orderedBy ?? null,
    })
    .select(PO_COLS)
    .single();
  if (error) throw error;

  const orderedAt = new Date().toISOString();
  // Je Produktzeile alle zugehörigen Anfragen in einem Update abwickeln.
  for (const line of input.lines) {
    if (!line.requestIds.length) continue;
    const { error: e2 } = await sb
      .from('order_requests')
      .update({
        status: 'ordered',
        purchase_order_id: po.id,
        supplier_id: input.supplierId,
        unit_price: line.unitPrice ?? null,
        ordered_at: orderedAt,
      })
      .in('id', line.requestIds);
    if (e2) throw e2;
  }

  return rowToPurchaseOrder(po);
}

export async function listPurchaseOrders(
  filters: { status?: PurchaseOrder['status'][] } = {},
): Promise<PurchaseOrder[]> {
  const sb = requireSupabase();
  let q = sb
    .from('purchase_orders')
    .select(`${PO_COLS}, suppliers:supplier_id(name), order_requests(${REQUEST_COLS})`)
    .order('ordered_at', { ascending: false });
  if (filters.status?.length) q = q.in('status', filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToPurchaseOrder);
}

/**
 * Wareneingang: PO auf 'received' setzen und alle noch offenen (ordered)
 * Anfragen des PO mitziehen. Bereits einzeln als received markierte
 * Anfragen bleiben unberührt.
 */
export async function markPurchaseOrderReceived(poId: string): Promise<PurchaseOrder> {
  const sb = requireSupabase();
  const receivedAt = new Date().toISOString();

  const { data: po, error } = await sb
    .from('purchase_orders')
    .update({ status: 'received', received_at: receivedAt })
    .eq('id', poId)
    .select(PO_COLS)
    .single();
  if (error) throw error;

  const { error: e2 } = await sb
    .from('order_requests')
    .update({ status: 'received', received_at: receivedAt })
    .eq('purchase_order_id', poId)
    .eq('status', 'ordered');
  if (e2) throw e2;

  return rowToPurchaseOrder(po);
}
