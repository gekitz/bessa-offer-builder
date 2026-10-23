import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ItemCard from './ItemCard';

const GRID = { gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' };

function ItemGrid({ items, cart, globalTier, handlers }) {
  return (
    <div className="grid gap-2" style={GRID}>
      {items.map(item => (
        <ItemCard key={item.id} item={item} cartItem={cart[item.id]} globalTier={globalTier} {...handlers} />
      ))}
    </div>
  );
}

// Split a catalog's items into the uncategorized ones (rendered first, without a
// sub-heading) and one labelled block per `cat`, preserving first-appearance
// order — matching the grouping shown on the Produkte admin page.
function splitByCategory(items) {
  const uncategorized = [];
  const groups = [];
  const index = new Map();
  for (const item of items) {
    if (!item.cat) { uncategorized.push(item); continue; }
    if (!index.has(item.cat)) {
      index.set(item.cat, groups.length);
      groups.push({ label: item.cat, items: [] });
    }
    groups[index.get(item.cat)].items.push(item);
  }
  return { uncategorized, groups };
}

export default function CatGroup({ title, items, cart, globalTier, handlers, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = items.filter(i => cart[i.id]).length;
  const { uncategorized, groups } = splitByCategory(items);
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-2 group">
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="font-bold text-slate-500 uppercase tracking-wider" style={{ fontSize: 11 }}>{title}</span>
        {count > 0 && <span className="bg-red-600 text-white rounded-full px-1.5" style={{ fontSize: 10, lineHeight: '18px' }}>{count}</span>}
      </button>
      {open && (
        <div className="space-y-3">
          {uncategorized.length > 0 && (
            <ItemGrid items={uncategorized} cart={cart} globalTier={globalTier} handlers={handlers} />
          )}
          {groups.map(g => (
            <div key={g.label}>
              <div className="font-semibold text-slate-400 uppercase tracking-wider mb-2 pl-0.5" style={{ fontSize: 10 }}>{g.label}</div>
              <ItemGrid items={g.items} cart={cart} globalTier={globalTier} handlers={handlers} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
