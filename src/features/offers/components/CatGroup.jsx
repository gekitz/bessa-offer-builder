import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ItemCard from './ItemCard';

export default function CatGroup({ title, items, cart, globalTier, handlers, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = items.filter(i => cart[i.id]).length;
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-2 group">
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="font-bold text-slate-500 uppercase tracking-wider" style={{ fontSize: 11 }}>{title}</span>
        {count > 0 && <span className="bg-red-600 text-white rounded-full px-1.5" style={{ fontSize: 10, lineHeight: '18px' }}>{count}</span>}
      </button>
      {open && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
          {items.map(item => (
            <ItemCard key={item.id} item={item} cartItem={cart[item.id]} globalTier={globalTier} {...handlers} />
          ))}
        </div>
      )}
    </div>
  );
}
