import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-table chainable Supabase mock. Mirrors the harness style in
// src/features/tickets/api/__tests__. Each from(table) returns its own
// recording chain so we can assert what was inserted/updated per table.
type AnyFn = (...args: unknown[]) => unknown;
interface ChainResponse { data: unknown; error: unknown; count?: number }

function makeChain(response: ChainResponse) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'order'];
  for (const m of passthrough) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(response).then(resolve);
  return Object.assign(builder, { _calls: calls }) as Record<string, ReturnType<typeof vi.fn>> & {
    _calls: typeof calls;
  };
}

const chains: Record<string, ReturnType<typeof makeChain>> = {};
const fromMock = vi.fn<AnyFn>((table: unknown) => chains[table as string]);

vi.mock('../../../../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import {
  countOpenRequests,
  createOrderRequest,
  createPurchaseOrder,
  markPurchaseOrderReceived,
} from '../procurementApi';

beforeEach(() => {
  for (const k of Object.keys(chains)) delete chains[k];
  fromMock.mockClear();
});

describe('createOrderRequest', () => {
  it('maps camelCase input to snake_case row and defaults optionals to null', async () => {
    chains.order_requests = makeChain({
      data: { id: 'r1', product_name: 'Sunmi L3', qty: 5, status: 'open', created_at: '', updated_at: '' },
      error: null,
    });

    await createOrderRequest({
      productId: 'sunmi-l3',
      productName: 'Sunmi L3',
      supplierId: 's-jarl',
      qty: 5,
      requestedBy: 'emp-a',
    });

    const insert = chains.order_requests._calls.find((c) => c.method === 'insert');
    const payload = insert!.args[0] as Record<string, unknown>;
    expect(payload.product_id).toBe('sunmi-l3');
    expect(payload.product_name).toBe('Sunmi L3');
    expect(payload.supplier_id).toBe('s-jarl');
    expect(payload.qty).toBe(5);
    expect(payload.requested_by).toBe('emp-a');
    expect(payload.offer_id).toBeNull();
    expect(payload.customer_id).toBeNull();
  });
});

describe('createPurchaseOrder', () => {
  it('inserts a PO then flips its request lines to ordered with the chosen price', async () => {
    chains.purchase_orders = makeChain({
      data: { id: 'po1', supplier_id: 's-jarl', status: 'ordered', ordered_at: '', created_at: '', updated_at: '' },
      error: null,
    });
    chains.order_requests = makeChain({ data: null, error: null });

    const po = await createPurchaseOrder({
      supplierId: 's-jarl',
      orderedBy: 'emp-buyer',
      priceQuotes: [
        { productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', unitPrice: 690 },
        { productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-pulsa', unitPrice: 649 },
      ],
      lines: [{ requestIds: ['r1', 'r2'], supplierId: 's-jarl', unitPrice: 649 }],
    });

    expect(po.id).toBe('po1');

    const poInsert = chains.purchase_orders._calls.find((c) => c.method === 'insert');
    const poRow = poInsert!.args[0] as Record<string, unknown>;
    expect(poRow.supplier_id).toBe('s-jarl');
    expect(poRow.ordered_by).toBe('emp-buyer');
    expect(Array.isArray(poRow.price_quotes)).toBe(true);

    const reqUpdate = chains.order_requests._calls.find((c) => c.method === 'update');
    const patch = reqUpdate!.args[0] as Record<string, unknown>;
    expect(patch.status).toBe('ordered');
    expect(patch.purchase_order_id).toBe('po1');
    expect(patch.supplier_id).toBe('s-jarl');
    expect(patch.unit_price).toBe(649);

    const inCall = chains.order_requests._calls.find((c) => c.method === 'in');
    expect(inCall!.args).toEqual(['id', ['r1', 'r2']]);
  });

  it('skips empty request lines', async () => {
    chains.purchase_orders = makeChain({
      data: { id: 'po2', supplier_id: 's-rch', status: 'ordered', ordered_at: '', created_at: '', updated_at: '' },
      error: null,
    });
    chains.order_requests = makeChain({ data: null, error: null });

    await createPurchaseOrder({
      supplierId: 's-rch',
      lines: [{ requestIds: [], supplierId: 's-rch', unitPrice: null }],
    });

    expect(chains.order_requests._calls.find((c) => c.method === 'update')).toBeUndefined();
  });
});

describe('markPurchaseOrderReceived', () => {
  it('sets the PO received and flips its ordered requests to received', async () => {
    chains.purchase_orders = makeChain({
      data: { id: 'po1', supplier_id: 's-jarl', status: 'received', received_at: 'now', created_at: '', updated_at: '' },
      error: null,
    });
    chains.order_requests = makeChain({ data: null, error: null });

    const po = await markPurchaseOrderReceived('po1');
    expect(po.status).toBe('received');

    const poPatch = chains.purchase_orders._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(poPatch.status).toBe('received');
    expect(poPatch.received_at).toBeTruthy();

    const reqPatch = chains.order_requests._calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>;
    expect(reqPatch.status).toBe('received');
    // Only the PO's still-ordered requests are pulled along.
    const eqCalls = chains.order_requests._calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['purchase_order_id', 'po1'] },
      { method: 'eq', args: ['status', 'ordered'] },
    ]);
  });
});

describe('countOpenRequests', () => {
  it('returns the head count of open requests', async () => {
    chains.order_requests = makeChain({ data: null, error: null, count: 7 });
    const n = await countOpenRequests();
    expect(n).toBe(7);
    const selectCall = chains.order_requests._calls.find((c) => c.method === 'select');
    expect(selectCall!.args[1]).toEqual({ count: 'exact', head: true });
  });
});
