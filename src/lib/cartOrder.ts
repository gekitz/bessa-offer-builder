import type { Cart, CartItem } from './totals';

// Returns [id, cartItem][] in the user-defined order. Items present in
// `cart` but missing from `cartOrder` get appended at the end in their
// own iteration order. Items in `cartOrder` that are no longer in
// `cart` are dropped silently.
export function orderedCartEntries(
  cart: Cart,
  cartOrder: readonly string[] | null | undefined,
): Array<[string, CartItem]> {
  const ids = Object.keys(cart);
  if (!cartOrder || cartOrder.length === 0) return ids.map((id) => [id, cart[id]!]);
  const ordered: Array<[string, CartItem]> = [];
  const seen = new Set<string>();
  for (const id of cartOrder) {
    const c = cart[id];
    if (c) {
      ordered.push([id, c]);
      seen.add(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) ordered.push([id, cart[id]!]);
  }
  return ordered;
}
