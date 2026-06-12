import { describe, it, expect } from 'vitest';
import {
  selectedByGroup,
  countedIds,
  listGroups,
  normalizeGroups,
  applyOptionGroup,
  orderWithGroups,
} from '../optionGroups';

type Entry = { qty?: number; optionGroup?: string; optionSelected?: boolean };

describe('selectedByGroup', () => {
  it('returns the explicitly selected member per group', () => {
    const cart = {
      a: { optionGroup: 'pc', optionSelected: false },
      b: { optionGroup: 'pc', optionSelected: true },
    };
    expect(selectedByGroup(cart)).toEqual({ pc: 'b' });
  });

  it('falls back to the first member when none is flagged', () => {
    const cart = {
      a: { optionGroup: 'pc' },
      b: { optionGroup: 'pc' },
    };
    expect(selectedByGroup(cart)).toEqual({ pc: 'a' });
  });
});

describe('countedIds', () => {
  it('counts every ungrouped item plus the selected member of each group', () => {
    const cart = {
      sw: {},
      a: { optionGroup: 'pc', optionSelected: false },
      b: { optionGroup: 'pc', optionSelected: true },
      x: { optionGroup: 'drucker', optionSelected: true },
      y: { optionGroup: 'drucker', optionSelected: false },
    };
    expect(countedIds(cart)).toEqual(new Set(['sw', 'b', 'x']));
  });
});

describe('listGroups', () => {
  it('returns unique labels in first-seen order', () => {
    const cart = {
      a: { optionGroup: 'pc' },
      b: { optionGroup: 'pc' },
      c: {},
      d: { optionGroup: 'drucker' },
    };
    expect(listGroups(cart)).toEqual(['pc', 'drucker']);
  });
});

describe('normalizeGroups', () => {
  it('selects the first member when a group has none selected', () => {
    const cart: Record<string, Entry> = {
      a: { optionGroup: 'pc' },
      b: { optionGroup: 'pc' },
    };
    const out = normalizeGroups(cart);
    expect(out.a.optionSelected).toBe(true);
    expect(out.b.optionSelected ?? false).toBe(false);
  });

  it('keeps only the first selected when several are flagged', () => {
    const cart = {
      a: { optionGroup: 'pc', optionSelected: true },
      b: { optionGroup: 'pc', optionSelected: true },
    };
    const out = normalizeGroups(cart);
    expect(out.a.optionSelected).toBe(true);
    expect(out.b.optionSelected).toBe(false);
  });

  it('leaves an already-valid cart untouched (same reference)', () => {
    const cart = {
      a: { optionGroup: 'pc', optionSelected: true },
      b: { optionGroup: 'pc', optionSelected: false },
    };
    expect(normalizeGroups(cart)).toBe(cart);
  });
});

describe('applyOptionGroup', () => {
  it('assigns a group and makes the item the sole selected member', () => {
    const cart: Record<string, Entry> = {
      a: { qty: 1, optionGroup: 'pc', optionSelected: true },
      b: { qty: 1 },
    };
    const out = applyOptionGroup(cart, 'b', 'pc', true);
    expect(out.b.optionGroup).toBe('pc');
    expect(out.b.optionSelected).toBe(true);
    // a must lose its selection — only one counted member per group
    expect(out.a.optionSelected).toBe(false);
  });

  it('trims the group label', () => {
    const cart: Record<string, Entry> = { a: { qty: 1 } };
    expect(applyOptionGroup(cart, 'a', '  PC-Auswahl  ', true).a.optionGroup).toBe('PC-Auswahl');
  });

  it('adding a non-selected member keeps the existing selection', () => {
    const cart: Record<string, Entry> = {
      a: { qty: 1, optionGroup: 'pc', optionSelected: true },
      b: { qty: 1 },
    };
    const out = applyOptionGroup(cart, 'b', 'pc', false);
    expect(out.a.optionSelected).toBe(true);
    expect(out.b.optionSelected).toBe(false);
  });

  it('removing the selected member promotes the remaining one', () => {
    const cart: Record<string, Entry> = {
      a: { qty: 1, optionGroup: 'pc', optionSelected: true },
      b: { qty: 1, optionGroup: 'pc', optionSelected: false },
    };
    const out = applyOptionGroup(cart, 'a', '', false);
    expect(out.a.optionGroup).toBeUndefined();
    expect(out.a.optionSelected).toBeUndefined();
    // b is now the only member, so it becomes selected/counted
    expect(out.b.optionSelected).toBe(true);
  });
});

describe('orderWithGroups', () => {
  it('keeps group members contiguous with the selected one first', () => {
    const rows = [
      { id: 'altB', optionGroup: 'pc', optionSelected: false },
      { id: 'sw', optionGroup: undefined },
      { id: 'selA', optionGroup: 'pc', optionSelected: true },
    ];
    expect(orderWithGroups(rows).map((r) => r.id)).toEqual(['selA', 'altB', 'sw']);
  });

  it('places the group block at its first occurrence and leaves ungrouped rows in place', () => {
    const rows = [
      { id: 'x', optionGroup: undefined },
      { id: 'a', optionGroup: 'g', optionSelected: true },
      { id: 'y', optionGroup: undefined },
      { id: 'b', optionGroup: 'g', optionSelected: false },
    ];
    expect(orderWithGroups(rows).map((r) => r.id)).toEqual(['x', 'a', 'b', 'y']);
  });
});
