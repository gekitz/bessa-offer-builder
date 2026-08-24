import { describe, it, expect } from 'vitest';
import { normalizeJarltechEntry, indexJarltechItems } from './jarltechNormalize';

describe('normalizeJarltechEntry', () => {
  it('parses string prices (dot decimal) into numbers', () => {
    const info = normalizeJarltechEntry({
      jarltechItemId: 'mpk1s12v',
      price: { jarltech_item_identifier: 'mpk1s12v', unit_price: '150.13', list_price: '208.52', currency: 'EUR' },
      stock: { jarltech_item_identifier: 'mpk1s12v', stock: 42 },
    });
    expect(info).toEqual({
      jarltechItemId: 'mpk1s12v',
      unitPrice: 150.13,
      listPrice: 208.52,
      currency: 'EUR',
      stock: 42,
    });
  });

  it('handles a null list_price', () => {
    const info = normalizeJarltechEntry({
      jarltechItemId: 'x',
      price: { unit_price: '99.00', list_price: null, currency: 'EUR' },
      stock: { stock: 0 },
    });
    expect(info.listPrice).toBeNull();
    expect(info.unitPrice).toBe(99);
    expect(info.stock).toBe(0);
  });

  it('treats a 404 (null price/stock payload) as null fields, not a crash', () => {
    const info = normalizeJarltechEntry({ jarltechItemId: 'ghost', price: null, stock: null });
    expect(info).toEqual({
      jarltechItemId: 'ghost',
      unitPrice: null,
      listPrice: null,
      currency: null,
      stock: null,
    });
  });

  it('tolerates a comma decimal just in case', () => {
    const info = normalizeJarltechEntry({
      jarltechItemId: 'x',
      price: { unit_price: '1234,56', currency: 'EUR' },
      stock: null,
    });
    expect(info.unitPrice).toBe(1234.56);
  });

  it('returns null for an unparseable price', () => {
    const info = normalizeJarltechEntry({
      jarltechItemId: 'x',
      price: { unit_price: 'n/a', currency: 'EUR' },
      stock: null,
    });
    expect(info.unitPrice).toBeNull();
  });
});

describe('indexJarltechItems', () => {
  it('keys normalized entries by jarltech item id', () => {
    const m = indexJarltechItems([
      { jarltechItemId: 'a', price: { unit_price: '10.00', currency: 'EUR' }, stock: { stock: 5 } },
      { jarltechItemId: 'b', price: null, stock: { stock: 0 } },
    ]);
    expect(m.get('a')?.unitPrice).toBe(10);
    expect(m.get('b')?.unitPrice).toBeNull();
    expect(m.get('b')?.stock).toBe(0);
    expect(m.size).toBe(2);
  });
});
