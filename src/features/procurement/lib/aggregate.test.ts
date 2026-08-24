import { describe, it, expect } from 'vitest';
import {
  aggregateOpenRequests,
  cheaperSupplierId,
  supplierOptionsFor,
} from './aggregate';
import type { OrderRequest, Supplier } from '../types';

function supplier(id: string, name: string, sort: number, active = true): Supplier {
  return {
    id, code: id, name, orderEmail: null, orderMethod: 'manual', notes: null, active, sort,
    createdAt: '', updatedAt: '',
  };
}

function req(overrides: Partial<OrderRequest>): OrderRequest {
  return {
    id: Math.random().toString(36).slice(2),
    productId: null,
    productName: 'Item',
    productCode: null,
    supplierId: null,
    qty: 1,
    note: null,
    status: 'open',
    unitPrice: null,
    customerId: null,
    customerName: null,
    offerId: null,
    purchaseOrderId: null,
    requestedBy: null,
    orderedAt: null,
    receivedAt: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const JARLTECH = supplier('s-jarl', 'Jarltech', 30);
const PULSA = supplier('s-pulsa', 'Pulsa', 40);
const ORDERMAN = supplier('s-order', 'Orderman', 10);
const SUPPLIERS = [ORDERMAN, JARLTECH, PULSA];

describe('aggregateOpenRequests', () => {
  it('sums quantities per product within a supplier (5 + 3 + 2 = 10)', () => {
    const requests = [
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 5 }),
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 3 }),
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 2 }),
    ];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe('s-jarl');
    expect(groups[0].lines).toHaveLength(1);
    expect(groups[0].lines[0].totalQty).toBe(10);
    expect(groups[0].lines[0].requests).toHaveLength(3);
    expect(groups[0].totalQty).toBe(10);
    expect(groups[0].requestCount).toBe(3);
  });

  it('groups by supplier and orders groups by supplier sort', () => {
    const requests = [
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 5 }),
      req({ productId: 'orderman-10', productName: 'Orderman 10', supplierId: 's-order', qty: 2 }),
    ];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups.map((g) => g.supplierId)).toEqual(['s-order', 's-jarl']); // sort 10 before 30
  });

  it('separates different products under the same supplier, sorted by name', () => {
    const requests = [
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 5 }),
      req({ productId: 'epson-tm', productName: 'Epson TM-m30', supplierId: 's-jarl', qty: 4 }),
    ];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups).toHaveLength(1);
    expect(groups[0].lines.map((l) => l.productName)).toEqual(['Epson TM-m30', 'Sunmi L3']);
    expect(groups[0].totalQty).toBe(9);
  });

  it('only counts open requests (ignores ordered/received/cancelled)', () => {
    const requests = [
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 5, status: 'open' }),
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 99, status: 'ordered' }),
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 99, status: 'received' }),
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 99, status: 'cancelled' }),
    ];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups[0].lines[0].totalQty).toBe(5);
  });

  it('puts requests without a supplier into a trailing "Ohne Lieferant" group', () => {
    const requests = [
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', supplierId: 's-jarl', qty: 5 }),
      req({ productName: 'Sonderteil', supplierId: null, qty: 1 }),
    ];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups[groups.length - 1].supplierId).toBeNull();
    expect(groups[groups.length - 1].supplierName).toBe('Ohne Lieferant');
  });

  it('merges free-text requests by normalised name', () => {
    const requests = [
      req({ productName: 'Sunmi L3', supplierId: 's-jarl', qty: 2 }),
      req({ productName: ' sunmi l3 ', supplierId: 's-jarl', qty: 3 }),
    ];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups[0].lines).toHaveLength(1);
    expect(groups[0].lines[0].totalQty).toBe(5);
  });

  it('backfills a missing product code from a later request', () => {
    const requests = [
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', productCode: null, supplierId: 's-jarl', qty: 1 }),
      req({ productId: 'sunmi-l3', productName: 'Sunmi L3', productCode: 'L3-001', supplierId: 's-jarl', qty: 1 }),
    ];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups[0].lines[0].productCode).toBe('L3-001');
  });

  it('labels an unknown supplier id rather than dropping the group', () => {
    const requests = [req({ productName: 'X', supplierId: 's-ghost', qty: 1 })];
    const groups = aggregateOpenRequests(requests, SUPPLIERS);
    expect(groups[0].supplierName).toBe('Unbekannter Lieferant');
  });
});

describe('cheaperSupplierId', () => {
  it('picks the lowest valid price', () => {
    expect(cheaperSupplierId([
      { supplierId: 's-jarl', unitPrice: 690 },
      { supplierId: 's-pulsa', unitPrice: 649 },
    ])).toBe('s-pulsa');
  });

  it('ignores null/negative prices', () => {
    expect(cheaperSupplierId([
      { supplierId: 's-jarl', unitPrice: null },
      { supplierId: 's-pulsa', unitPrice: 700 },
    ])).toBe('s-pulsa');
    expect(cheaperSupplierId([
      { supplierId: 's-jarl', unitPrice: -5 },
      { supplierId: 's-pulsa', unitPrice: 700 },
    ])).toBe('s-pulsa');
  });

  it('returns null when no valid price exists', () => {
    expect(cheaperSupplierId([{ supplierId: 's-jarl', unitPrice: null }])).toBeNull();
    expect(cheaperSupplierId([])).toBeNull();
  });

  it('keeps the first on a tie', () => {
    expect(cheaperSupplierId([
      { supplierId: 's-jarl', unitPrice: 690 },
      { supplierId: 's-pulsa', unitPrice: 690 },
    ])).toBe('s-jarl');
  });
});

describe('supplierOptionsFor', () => {
  it('lists preferred first, then alternatives', () => {
    const opts = supplierOptionsFor('s-jarl', ['s-pulsa'], SUPPLIERS);
    expect(opts.map((s) => s.id)).toEqual(['s-jarl', 's-pulsa']);
  });

  it('dedupes when preferred also appears in alternatives', () => {
    const opts = supplierOptionsFor('s-jarl', ['s-jarl', 's-pulsa'], SUPPLIERS);
    expect(opts.map((s) => s.id)).toEqual(['s-jarl', 's-pulsa']);
  });

  it('drops unknown and inactive suppliers', () => {
    const suppliers = [JARLTECH, supplier('s-pulsa', 'Pulsa', 40, false)];
    const opts = supplierOptionsFor('s-jarl', ['s-pulsa', 's-ghost'], suppliers);
    expect(opts.map((s) => s.id)).toEqual(['s-jarl']);
  });

  it('handles no preferred supplier', () => {
    const opts = supplierOptionsFor(null, ['s-pulsa'], SUPPLIERS);
    expect(opts.map((s) => s.id)).toEqual(['s-pulsa']);
  });
});
