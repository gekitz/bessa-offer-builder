import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import type { Product } from '../../offers/api/productApi';
import { searchHardwareProducts } from '../lib/hardwareCatalogs';

// Searchable product picker for the loaner device form. Type-ahead over the
// HARDWARE catalogs only (software/service catalogs are filtered out — see
// hardwareCatalogs.ts). Portals its popover to body so it escapes the modal's
// overflow. Siehe docs/leihstellungen.md.

interface Props {
  products: Product[];
  value: string; // selected product id, '' = none
  onChange: (productId: string, product: Product | null) => void;
  placeholder?: string;
}

export default function ProductPicker({ products, value, onChange, placeholder = 'Hardware suchen…' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = products.find((p) => p.id === value) ?? null;
  const results = searchHardwareProducts(products, open ? query : '', 50);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;
    function compute() {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    }
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll(e: Event) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function pick(p: Product) {
    onChange(p.id, p);
    setQuery('');
    setOpen(false);
  }
  function clear() {
    onChange('', null);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selected?.name ?? ''}
          placeholder={selected ? selected.name : placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          className="w-full border border-slate-200 rounded-lg pl-8 pr-14 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selected && (
            <button type="button" onClick={clear} aria-label="Produkt entfernen" className="text-slate-300 hover:text-slate-500">
              <X size={14} />
            </button>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && rect && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, zIndex: 60 }}
          className="bg-white rounded-xl border border-slate-200 shadow-lg py-1 max-h-64 overflow-auto"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-slate-400" style={{ fontSize: 12 }}>
              {query.trim() ? 'Keine Hardware gefunden' : 'Keine Hardware im Katalog'}
            </div>
          ) : (
            results.map((p) => {
              const isSel = p.id === value;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                    isSel ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  style={{ fontSize: 13 }}
                >
                  <span className="flex-shrink-0 w-3.5">{isSel && <Check size={13} />}</span>
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="text-slate-400 flex-shrink-0" style={{ fontSize: 11 }}>
                    {p.category || p.catalog}
                  </span>
                </button>
              );
            })
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
