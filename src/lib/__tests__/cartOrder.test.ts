import { describe, it, expect } from 'vitest';
import { orderedCartEntries } from '../cartOrder';
import type { Cart } from '../totals';

const cart: Cart = {
  a: { qty: 1 },
  b: { qty: 2 },
  c: { qty: 3 },
};

describe('orderedCartEntries', () => {
  it('returns iteration-order entries when cartOrder is empty/missing', () => {
    expect(orderedCartEntries(cart, null).map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(orderedCartEntries(cart, undefined).map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(orderedCartEntries(cart, []).map(([id]) => id)).toEqual(['a', 'b', 'c']);
  });

  it('respects cartOrder when it covers every cart id', () => {
    expect(orderedCartEntries(cart, ['c', 'a', 'b']).map(([id]) => id)).toEqual(['c', 'a', 'b']);
  });

  it('appends ids not present in cartOrder at the end', () => {
    expect(orderedCartEntries(cart, ['c']).map(([id]) => id)).toEqual(['c', 'a', 'b']);
  });

  it('drops cartOrder entries that no longer exist in the cart', () => {
    expect(orderedCartEntries(cart, ['ghost', 'c', 'also-ghost', 'a']).map(([id]) => id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('returns the same CartItem references the cart contains', () => {
    const result = orderedCartEntries(cart, ['b', 'a']);
    expect(result[0]![1]).toBe(cart.b);
    expect(result[1]![1]).toBe(cart.a);
  });
});
