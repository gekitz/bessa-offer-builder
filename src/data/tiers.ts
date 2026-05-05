export type TierKey = '12mo' | '6mo' | '2mo' | 'event';

export const TIERS: readonly TierKey[] = ['12mo', '6mo', '2mo', 'event'] as const;

export const TIER_MONTHS: Record<TierKey, number> = {
  '12mo': 12,
  '6mo': 6,
  '2mo': 2,
  event: 1,
};

export const TIER_LABEL: Record<TierKey, string> = {
  '12mo': '12 Monate',
  '6mo': '6 Monate',
  '2mo': '2 Monate',
  event: '1-3 Tage',
};

export const TIER_SHORT: Record<TierKey, string> = {
  '12mo': 'Jahr',
  '6mo': 'Saison',
  '2mo': 'Märkte',
  event: 'Events',
};

export const TIER_LABEL_OFFER: Record<TierKey, string> = {
  '12mo': '12 Monate mtl.',
  '6mo': '6 Monate mtl.',
  '2mo': '2 Monate mtl.',
  event: '1-3 Tage/Event',
};

// Storage keys used inside item.p price tables (legacy short codes)
export type PriceKey = 'y' | 's' | 'm' | 'e';

export const TKEY: Record<PriceKey, TierKey> = {
  y: '12mo',
  s: '6mo',
  m: '2mo',
  e: 'event',
};

export const TKEY_REV: Record<TierKey, PriceKey> = {
  '12mo': 'y',
  '6mo': 's',
  '2mo': 'm',
  event: 'e',
};
