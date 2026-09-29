import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Package, Search, X } from 'lucide-react';
import { baseArticleNumber, getArticlePrice, searchArticles } from '../../../lib/mesonicApi';
import { normaliseArticle, type MesonicArticle } from '../../../lib/mesonicArticles';
import type { RepairOrderMaterialInput } from '../types';

interface MaterialPickerProps {
  onSelect: (input: RepairOrderMaterialInput) => Promise<void> | void;
  onClose: () => void;
}

// Net price → German decimal string (comma, 2 places) for the input field.
function formatPrice(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function MaterialPicker({ onSelect, onClose }: MaterialPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 400);
  const [results, setResults] = useState<MesonicArticle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection / add flow
  const [picked, setPicked] = useState<MesonicArticle | null>(null);
  const [quantity, setQuantity] = useState<string>('1');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [adding, setAdding] = useState(false);
  // Price prefill status for the picked article: 'loading' while we fetch the
  // Mesonic VK, 'found'/'missing' once resolved, 'idle' before a pick.
  const [priceStatus, setPriceStatus] = useState<'idle' | 'loading' | 'found' | 'missing'>('idle');
  // Increments on every pick / back so a slow price fetch can't apply to a
  // different (or no) selection after the user has moved on.
  const pickTokenRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchArticles(debouncedQuery)
      .then((data: { records?: Record<string, unknown>[] }) => {
        if (cancelled) return;
        const records = data?.records ?? [];
        const normalised = records
          .map(normaliseArticle)
          .filter((a): a is MesonicArticle => a !== null);
        setResults(normalised);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  async function handlePick(a: MesonicArticle) {
    setPicked(a);
    setError(null);
    const token = ++pickTokenRef.current;
    // The search template (T024) carries no price. If a result already hinted
    // one use it; otherwise fetch the standard VK (Preisliste 13) so the tech
    // gets a prefilled price to accept or override instead of a blank field.
    if (a.hintedPrice != null) {
      setUnitPrice(formatPrice(a.hintedPrice));
      setPriceStatus('found');
      return;
    }
    setUnitPrice('');
    setPriceStatus('loading');
    try {
      const price = await getArticlePrice(a.number);
      if (pickTokenRef.current !== token) return; // superseded by another pick / back
      if (price != null) {
        setUnitPrice(formatPrice(price));
        setPriceStatus('found');
      } else {
        setPriceStatus('missing');
      }
    } catch {
      // Best-effort — a price lookup failure must not block manual entry.
      if (pickTokenRef.current === token) setPriceStatus('missing');
    }
  }

  function backToSearch() {
    pickTokenRef.current++; // discard any in-flight price fetch
    setPicked(null);
    setUnitPrice('');
    setPriceStatus('idle');
    setError(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    const qty = Number(quantity.replace(',', '.'));
    const price = Number(unitPrice.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Menge muss > 0 sein.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Preis muss ≥ 0 sein.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await onSelect({
        // Store the BASE number — the Beleg build appends the KL/WO variant from
        // the ticket Standort (repairOrderToBelegPositions), so it doesn't matter
        // which Ausprägung the tech clicked in the search results.
        mesonicArtikelNr: baseArticleNumber(picked.number),
        bezeichnung: picked.name,
        quantity: qty,
        unitPrice: price,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
      // No backdrop close — see TicketForm rationale.
      data-testid="material-picker-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl mt-16 w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>
              {picked ? 'Material hinzufügen' : 'Artikel suchen'}
            </span>
            <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="Schließen">
              <X size={16} className="text-slate-500" />
            </button>
          </div>
          {!picked && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Artikelnummer oder Bezeichnung (min. 2 Zeichen)"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
          )}
        </div>

        {/* Body */}
        {picked ? (
          <form onSubmit={handleAdd} className="px-5 py-4 space-y-3 overflow-auto">
            <div className="rounded-lg border border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-slate-400" />
                <span className="font-medium text-slate-800 text-sm">{picked.name}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Nr. {picked.number}{picked.group ? ` · ${picked.group}` : ''}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Menge</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Einzelpreis (netto, €)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(e) => {
                      setUnitPrice(e.target.value);
                      setPriceStatus('idle'); // user is overriding the prefill
                    }}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    required
                    autoFocus
                  />
                  {priceStatus === 'loading' && (
                    <Loader2
                      size={14}
                      className="animate-spin text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2"
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-400">
              {priceStatus === 'loading'
                ? 'Preis wird aus Mesonic geladen…'
                : priceStatus === 'found'
                ? 'Preis aus Mesonic vorausgefüllt (Preisliste 13) — bei Bedarf anpassen.'
                : priceStatus === 'missing'
                ? 'Kein Mesonic-Preis gefunden — bitte manuell eingeben.'
                : 'Preis netto eingeben.'}
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={backToSearch}
                className="text-sm text-slate-500 hover:text-slate-700"
                disabled={adding}
              >
                ← Zurück zur Suche
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={adding}
              >
                {adding && <Loader2 size={14} className="animate-spin" />}
                Hinzufügen
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 overflow-auto px-3 py-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700 mb-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            {!loading && results !== null && results.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-8">Keine Treffer.</div>
            )}
            {!loading && results === null && (
              <div className="text-center text-xs text-slate-400 py-8">
                Mindestens 2 Zeichen eingeben, um zu suchen.
              </div>
            )}
            {results && results.length > 0 && (
              <ul className="space-y-1" data-testid="material-picker-results">
                {results.slice(0, 30).map((a, i) => (
                  <li key={`${a.number}-${i}`}>
                    <button
                      type="button"
                      onClick={() => handlePick(a)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-slate-800 truncate">{a.name}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">Nr. {a.number}</span>
                      </div>
                      {a.group && <div className="text-xs text-slate-400 mt-0.5">{a.group}</div>}
                    </button>
                  </li>
                ))}
                {results.length > 30 && (
                  <li className="text-xs text-slate-400 text-center py-2">
                    + {results.length - 30} weitere Treffer — Suche verfeinern.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
