import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { TAG_VOCAB } from '../lib/deviceTags';

// Multiselect "Typ" filter for the fleet list. Selecting several tags ANDs
// them (mobil + drucker → mobile printers). Each option shows a live count of
// how many devices in the current (status/Standort/search) set carry it.

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  counts: Record<string, number>;
  className?: string;
}

export default function TagFilterDropdown({ value, onChange, counts, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = new Set(value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(TAG_VOCAB.filter((t) => next.has(t.value)).map((t) => t.value));
  }

  const label = value.length === 0 ? 'Alle Typen' : `${value.length} Typ${value.length > 1 ? 'en' : ''}`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
      >
        <span className={value.length === 0 ? 'text-slate-400' : ''}>{label}</span>
        <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-56 right-0 sm:right-auto sm:left-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            >
              Auswahl löschen
            </button>
          )}
          {TAG_VOCAB.map((t) => {
            const on = selected.has(t.value);
            const count = counts[t.value] ?? 0;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => toggle(t.value)}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`flex items-center justify-center w-4 h-4 rounded border ${
                      on ? 'bg-red-600 border-red-600 text-white' : 'border-slate-300'
                    }`}
                  >
                    {on && <Check size={12} />}
                  </span>
                  {t.label}
                </span>
                <span className="text-xs text-slate-400 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
