import { useMemo, useRef, useState } from 'react';
import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import type { RequestableProduct, Supplier } from '../types';

// Anfrage-Formular: Produkt aus dem Katalog wählen (oder Freitext),
// Menge + optionale Notiz + optionale Kundenzuordnung. Der Lieferant
// wird aus dem bevorzugten Lieferanten des Produkts vorbelegt (im
// Einkauf umstellbar).
export default function OrderRequestForm({
  products,
  suppliers,
  submitting,
  onSubmit,
}: {
  products: RequestableProduct[];
  suppliers: Supplier[];
  submitting: boolean;
  onSubmit: (input: {
    product: RequestableProduct | null;
    freeText: string;
    qty: number;
    note: string;
    customerName: string;
  }) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RequestableProduct | null>(null);
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const supplierName = useMemo(() => {
    if (!selected?.supplierId) return null;
    return suppliers.find((s) => s.id === selected.supplierId)?.name ?? null;
  }, [selected, suppliers]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || selected) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.code?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [query, products, selected]);

  const canSubmit = (selected || query.trim()) && Number(qty) > 0 && !submitting;

  function reset() {
    setQuery('');
    setSelected(null);
    setQty('1');
    setNote('');
    setCustomerName('');
    setError(null);
  }

  function submit() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Menge muss größer als 0 sein.');
      return;
    }
    if (!selected && !query.trim()) {
      setError('Bitte ein Produkt wählen oder eingeben.');
      return;
    }
    setError(null);
    onSubmit({
      product: selected,
      freeText: selected ? '' : query.trim(),
      qty: n,
      note: note.trim(),
      customerName: customerName.trim(),
    });
    reset();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-700 mb-3" style={{ fontSize: 14 }}>
        Neue Bestellanfrage
      </h2>

      {/* Produktsuche / -auswahl */}
      <label className="block text-xs font-medium text-slate-600 mb-1">Produkt</label>
      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <Check size={14} className="text-emerald-600 flex-shrink-0" />
          <span className="font-medium text-slate-800 truncate flex-1">
            {selected.code ? <span className="font-mono text-xs text-slate-400 mr-1.5">{selected.code}</span> : null}
            {selected.name}
          </span>
          {supplierName && (
            <span className="text-[11px] text-slate-400 flex-shrink-0">→ {supplierName}</span>
          )}
          <button
            type="button"
            onClick={() => { setSelected(null); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="text-slate-400 hover:text-slate-600 flex-shrink-0"
            aria-label="Auswahl entfernen"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Produkt suchen oder frei eingeben…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg py-1 max-h-56 overflow-auto">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { setSelected(p); setError(null); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                    style={{ fontSize: 13 }}
                  >
                    {p.code && <span className="font-mono text-xs text-slate-400 w-12 flex-shrink-0">{p.code}</span>}
                    <span className="flex-1 truncate text-slate-700">{p.name}</span>
                    <span className="text-[11px] text-slate-300 flex-shrink-0">{p.catalog}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Menge</label>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Für Kunde (optional)</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="z. B. Gasthaus Müller"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium text-slate-600 mb-1">Notiz (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="z. B. dringend, für Messe"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
        />
      </div>

      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

      <div className="flex justify-end mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Anfrage hinzufügen
        </button>
      </div>
    </div>
  );
}
