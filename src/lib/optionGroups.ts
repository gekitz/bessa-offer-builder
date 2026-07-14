// Option groups ("Wahlpositionen"): a set of cart items the customer picks
// ONE of (e.g. PC Option A vs Option B). Exactly one member per group is the
// "selected" / recommended one whose price counts toward the offer total; the
// others render as alternatives with a +/- price delta (the "Default + Mehrpreis"
// model). These helpers are pure so totals, the PDF builder, and the on-screen
// builder all agree on which member counts.

export interface OptionCartItem {
  /** Group label shared by all alternatives the customer chooses between. */
  optionGroup?: string;
  /** True on the recommended member counted in the total. Maintained so that
   *  exactly one member per group is selected (see normalizeGroups). */
  optionSelected?: boolean;
  /** Optional add-on: still listed in the offer but never counted in the
   *  total (the customer may add it later). Independent of option groups. */
  optional?: boolean;
}

type OptionCart<T extends OptionCartItem> = Record<string, T>;

/**
 * For each option group, the id whose price counts toward the total: the
 * explicitly selected member, or — defensively — the first member if a group
 * somehow has none flagged.
 */
export function selectedByGroup<T extends OptionCartItem>(cart: OptionCart<T>): Record<string, string> {
  const firstByGroup: Record<string, string> = {};
  const selByGroup: Record<string, string> = {};
  for (const [id, c] of Object.entries(cart)) {
    const g = c.optionGroup;
    if (!g) continue;
    if (!(g in firstByGroup)) firstByGroup[g] = id;
    if (c.optionSelected && !(g in selByGroup)) selByGroup[g] = id;
  }
  const out: Record<string, string> = {};
  for (const g of Object.keys(firstByGroup)) out[g] = selByGroup[g] ?? firstByGroup[g];
  return out;
}

/**
 * Ids whose price counts toward the total: every ungrouped item, plus the
 * single counted member of each option group. Optional add-ons never count.
 */
export function countedIds<T extends OptionCartItem>(cart: OptionCart<T>): Set<string> {
  const sel = selectedByGroup(cart);
  const counted = new Set<string>();
  for (const [id, c] of Object.entries(cart)) {
    if (c.optional) continue;
    if (!c.optionGroup) counted.add(id);
    else if (sel[c.optionGroup] === id) counted.add(id);
  }
  return counted;
}

/** Unique option-group labels present in the cart, in first-seen order. */
export function listGroups<T extends OptionCartItem>(cart: OptionCart<T>): string[] {
  const seen: string[] = [];
  for (const c of Object.values(cart)) {
    if (c.optionGroup && !seen.includes(c.optionGroup)) seen.push(c.optionGroup);
  }
  return seen;
}

/**
 * Ensure every option group has exactly one selected member. Pure: returns a
 * new cart, touching only entries whose flag actually changes. A group with no
 * selected member gets its first member selected; extra selections beyond the
 * first are cleared.
 */
export function normalizeGroups<T extends OptionCartItem>(cart: OptionCart<T>): OptionCart<T> {
  const membersByGroup: Record<string, string[]> = {};
  for (const [id, c] of Object.entries(cart)) {
    if (c.optionGroup) (membersByGroup[c.optionGroup] ??= []).push(id);
  }
  let next = cart;
  const setSelected = (id: string, selected: boolean) => {
    if (!!next[id].optionSelected === selected) return;
    next = { ...next, [id]: { ...next[id], optionSelected: selected } };
  };
  for (const ids of Object.values(membersByGroup)) {
    const selected = ids.filter((id) => cart[id].optionSelected);
    if (selected.length === 0) {
      setSelected(ids[0], true);
    } else if (selected.length > 1) {
      selected.slice(1).forEach((id) => setSelected(id, false));
    }
  }
  return next;
}

/**
 * Assign `id` to option group `group` (empty string removes it from any group)
 * and optionally mark it the recommended/selected member. Returns a normalized
 * cart with exactly one selected member per remaining group.
 */
export function applyOptionGroup<T extends OptionCartItem>(
  cart: OptionCart<T>,
  id: string,
  group: string,
  selected: boolean,
): OptionCart<T> {
  if (!cart[id]) return cart;
  const g = group.trim();
  const next: OptionCart<T> = { ...cart, [id]: { ...cart[id] } };
  const entry = next[id] as OptionCartItem;
  if (!g) {
    delete entry.optionGroup;
    delete entry.optionSelected;
  } else {
    entry.optionGroup = g;
    if (selected) {
      // Become the sole selected member: clear the others first.
      for (const [otherId, c] of Object.entries(next)) {
        if (otherId !== id && c.optionGroup === g && c.optionSelected) {
          next[otherId] = { ...next[otherId], optionSelected: false };
        }
      }
      entry.optionSelected = true;
    } else {
      entry.optionSelected = false;
    }
  }
  return normalizeGroups(next);
}

/**
 * Reorder rows so each option group's members are contiguous — the selected
 * member first — placed at the group's first occurrence in the input order.
 * Ungrouped rows keep their position.
 */
export function orderWithGroups<T extends OptionCartItem>(rows: T[]): T[] {
  const membersByGroup: Record<string, T[]> = {};
  for (const r of rows) {
    if (r.optionGroup) (membersByGroup[r.optionGroup] ??= []).push(r);
  }
  const emitted = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r.optionGroup) {
      out.push(r);
      continue;
    }
    if (emitted.has(r.optionGroup)) continue;
    emitted.add(r.optionGroup);
    const members = membersByGroup[r.optionGroup];
    out.push(
      ...members.filter((m) => m.optionSelected),
      ...members.filter((m) => !m.optionSelected),
    );
  }
  return out;
}
