import { describe, it, expect } from 'vitest';
import {
  availableTiers,
  bestTier,
  price,
  discountedPrice,
  hasDiscount,
  isMonthly,
  yearlyServicePerUnit,
  type Item,
} from '../pricing';

const monthly: Item = {
  id: 'kassa',
  name: 'Kassa',
  t: 'm',
  p: { y: 12, s: 18, m: 24, e: 30 },
};

const monthlyPartial: Item = {
  id: 'webkassa',
  name: 'Web Kassa',
  t: 'm',
  p: { y: 19, s: 25, m: 30 }, // no event tier
};

const onceItem: Item = {
  id: 'install',
  name: 'Installation',
  t: 'o',
  p: { o: 250 },
};

const hardware: Item = {
  id: 'kassen-pc',
  name: 'Kassen PC',
  t: 'h',
  price: 899,
};

const termItem: Item = {
  id: 'orderman',
  name: 'Orderman',
  t: 'term',
  buy: 1200,
  rent: 39,
};

const withFixedDiscount: Item = {
  id: 'bessa-handel',
  name: 'bessa Handel',
  t: 'm',
  p: { y: 160 },
  discount: { type: 'fixed', value: 50, label: 'Weitere Filiale' },
};

const withPercentDiscount: Item = {
  id: 'percent-item',
  name: 'Percent Item',
  t: 'm',
  p: { y: 100 },
  discount: { type: 'percent', value: 25 },
};

const withService: Item = {
  id: 'melzer-1',
  name: 'Melzer Gerät',
  t: 'o',
  price: 1000,
  servicePercent: 12,
};

describe('availableTiers', () => {
  it('returns empty for non-monthly items', () => {
    expect(availableTiers(onceItem)).toEqual([]);
    expect(availableTiers(hardware)).toEqual([]);
    expect(availableTiers(termItem)).toEqual([]);
  });

  it('returns only the tiers with a defined price', () => {
    expect(availableTiers(monthly)).toEqual(['12mo', '6mo', '2mo', 'event']);
    expect(availableTiers(monthlyPartial)).toEqual(['12mo', '6mo', '2mo']);
  });
});

describe('bestTier', () => {
  it('returns the requested tier when available', () => {
    expect(bestTier(monthly, '6mo')).toBe('6mo');
  });

  it('falls back to the first available tier when the requested one is not offered', () => {
    expect(bestTier(monthlyPartial, 'event')).toBe('12mo');
  });

  it('returns null for items with no tiers', () => {
    expect(bestTier(onceItem, '12mo')).toBeNull();
  });
});

describe('price', () => {
  it('returns null for missing item', () => {
    expect(price(undefined, '12mo', undefined)).toBeNull();
    expect(price(null, '12mo', undefined)).toBeNull();
  });

  it('returns p.o (or .price fallback) for one-time and hardware items', () => {
    expect(price(onceItem, undefined, undefined)).toBe(250);
    expect(price(hardware, undefined, undefined)).toBe(899);
  });

  it('returns rent or buy for term items based on mode', () => {
    expect(price(termItem, undefined, 'rent')).toBe(39);
    expect(price(termItem, undefined, 'buy')).toBe(1200);
    // mode defaults to rent path (mode !== 'buy')
    expect(price(termItem, undefined, undefined)).toBe(39);
  });

  it('returns the requested tier price for monthly items', () => {
    expect(price(monthly, '12mo', undefined)).toBe(12);
    expect(price(monthly, 'event', undefined)).toBe(30);
  });

  it('falls back to the first available tier when the requested tier has no price', () => {
    expect(price(monthlyPartial, 'event', undefined)).toBe(19); // first available is 12mo
  });

  it('returns the per-line override regardless of item type, including 0', () => {
    expect(price(onceItem, undefined, undefined, 199)).toBe(199);
    expect(price(termItem, undefined, 'buy', 1000)).toBe(1000);
    expect(price(monthly, '12mo', undefined, 5)).toBe(5);
    expect(price(onceItem, undefined, undefined, 0)).toBe(0); // free line
  });

  it('ignores a null/undefined override and uses the catalog price', () => {
    expect(price(onceItem, undefined, undefined, null)).toBe(250);
    expect(price(onceItem, undefined, undefined, undefined)).toBe(250);
  });
});

describe('discountedPrice', () => {
  it('returns the base price for items without a discount', () => {
    expect(discountedPrice(monthly, '12mo', undefined)).toBe(12);
  });

  it('subtracts a fixed discount, clamped at zero', () => {
    expect(discountedPrice(withFixedDiscount, '12mo', undefined)).toBe(110);
    const tiny: Item = { ...withFixedDiscount, p: { y: 30 } };
    expect(discountedPrice(tiny, '12mo', undefined)).toBe(0);
  });

  it('applies a percent discount', () => {
    expect(discountedPrice(withPercentDiscount, '12mo', undefined)).toBe(75);
  });

  it('applies the item discount on top of a price override', () => {
    // override 200, then fixed discount of 50 -> 150
    expect(discountedPrice(withFixedDiscount, '12mo', undefined, 200)).toBe(150);
  });
});

describe('hasDiscount', () => {
  it('detects discount config', () => {
    expect(hasDiscount(monthly)).toBe(false);
    expect(hasDiscount(withFixedDiscount)).toBe(true);
  });
});

describe('isMonthly', () => {
  it('treats t=m items as monthly', () => {
    expect(isMonthly(monthly, undefined)).toBe(true);
  });

  it('treats t=term items as monthly only when rented', () => {
    expect(isMonthly(termItem, 'rent')).toBe(true);
    expect(isMonthly(termItem, 'buy')).toBe(false);
  });

  it('treats one-time and hardware items as not monthly', () => {
    expect(isMonthly(onceItem, undefined)).toBe(false);
    expect(isMonthly(hardware, undefined)).toBe(false);
  });

  it('returns false for missing item', () => {
    expect(isMonthly(undefined, undefined)).toBe(false);
  });
});

describe('yearlyServicePerUnit', () => {
  it('returns 0 for items without servicePercent', () => {
    expect(yearlyServicePerUnit(onceItem)).toBe(0);
    expect(yearlyServicePerUnit(hardware)).toBe(0);
    expect(yearlyServicePerUnit(undefined)).toBe(0);
  });

  it('returns price * percent / 100', () => {
    expect(yearlyServicePerUnit(withService)).toBe(120);
  });
});
