import { TIERS, TKEY_REV, type TierKey, type PriceKey } from '../data/tiers';

export type ItemKind = 'm' | 'o' | 'h' | 'term';
export type ItemMode = 'rent' | 'buy' | 'kauf' | undefined;

export interface ItemDiscount {
  type: 'fixed' | 'percent';
  value: number;
  label?: string;
}

export interface Item {
  id: string;
  name: string;
  t: ItemKind;
  p?: Partial<Record<PriceKey | 'o', number>>;
  price?: number;
  buy?: number;
  rent?: number;
  servicePercent?: number;
  discount?: ItemDiscount;
  code?: string;
  cat?: string;
  note?: string;
  info?: string;
  /** Optional multi-line article description (one spec per line) shown on the PDF. */
  description?: string;
}

export type Catalog = Record<string, Item>;

export function availableTiers(item: Item): TierKey[] {
  if (item.t !== 'm') return [];
  return TIERS.filter((t) => item.p?.[TKEY_REV[t]] !== undefined);
}

export function bestTier(item: Item, global: TierKey): TierKey | null {
  const av = availableTiers(item);
  if (av.includes(global)) return global;
  return av[0] ?? null;
}

export function price(
  item: Item | undefined | null,
  tier: TierKey | undefined,
  mode: ItemMode,
): number | null {
  if (!item) return null;
  if (item.t === 'o') return item.p?.o ?? item.price ?? 0;
  if (item.t === 'h') return item.p?.o ?? item.price ?? 0;
  if (item.t === 'term') return (mode === 'buy' ? item.buy : item.rent) ?? null;
  if (item.t === 'm') {
    if (tier) {
      const k = TKEY_REV[tier];
      if (k && item.p?.[k] !== undefined) return item.p[k]!;
    }
    const av = availableTiers(item);
    if (av.length) return item.p?.[TKEY_REV[av[0]!]] ?? null;
  }
  return null;
}

export function discountedPrice(
  item: Item,
  tier: TierKey | undefined,
  mode: ItemMode,
): number | null {
  const basePrice = price(item, tier, mode);
  if (!item.discount || basePrice === null) return basePrice;
  if (item.discount.type === 'fixed') return Math.max(0, basePrice - item.discount.value);
  if (item.discount.type === 'percent') return basePrice * (1 - item.discount.value / 100);
  return basePrice;
}

export function hasDiscount(item: Item): boolean {
  return !!item.discount;
}

export function isMonthly(item: Item | undefined | null, mode: ItemMode): boolean {
  if (!item) return false;
  if (item.t === 'term') return mode === 'rent';
  return item.t === 'm';
}

// Annual Wartung fee per unit, charged on top of the one-time price.
// Items without a servicePercent return 0.
export function yearlyServicePerUnit(item: Item | undefined | null): number {
  if (!item || !item.servicePercent) return 0;
  const base = item.price ?? item.p?.o ?? 0;
  return base * (item.servicePercent / 100);
}
