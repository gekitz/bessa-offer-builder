// Produkt ↔ Mesonic-Artikel: Suchen-und-Auswählen im Produkt-Detail.
//
// Spiegelt den MaterialPicker-Flow (searchArticles live gegen Mesonic), speichert
// aber die BASIS-Artikelnummer (ohne KL/WO) auf dem Produkt — der KL/WO-Suffix
// wird erst beim Beleg-Export aus dem Standort abgeleitet. Bei einem noch nicht
// verknüpften Produkt öffnet die Suche automatisch, vorbefüllt mit dem
// Produktnamen (die Mesonic-Bezeichnung weicht oft ab → als Startpunkt gedacht,
// frei editierbar).

import { useEffect, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { baseArticleNumber, searchArticles } from '../../../lib/mesonicApi';
import { normaliseArticle, type MesonicArticle } from '../../../lib/mesonicArticles';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

interface MesonicArticleFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  productName: string;
}

export default function MesonicArticleField({ value, onChange, productName }: MesonicArticleFieldProps) {
  // Unlinked → open the search straight away (prefilled with the product name).
  const [searching, setSearching] = useState(!value);
  const [query, setQuery] = useState(value ? '' : productName);
  const debounced = useDebounced(query, 400);
  const [results, setResults] = useState<MesonicArticle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searching) return;
    const q = debounced.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchArticles(q)
      .then((data: { records?: Record<string, unknown>[] }) => {
        if (cancelled) return;
        const records = data?.records ?? [];
        setResults(records.map(normaliseArticle).filter((a): a is MesonicArticle => a !== null));
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
  }, [debounced, searching]);

  function openSearch() {
    setSearching(true);
    setQuery(value ? '' : productName);
  }

  function pick(a: MesonicArticle) {
    onChange(baseArticleNumber(a.number));
    setSearching(false);
    setResults(null);
  }

  if (!searching) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {value ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs font-mono">
            <Check size={12} />
            {value}
          </span>
        ) : (
          <span className="text-xs text-slate-400">nicht verknüpft</span>
        )}
        <button
          type="button"
          onClick={openSearch}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          {value ? 'ändern' : 'Artikel suchen'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-0.5 text-slate-400 hover:text-red-600"
            aria-label="Verknüpfung entfernen"
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Mesonic-Artikel: Nummer oder Bezeichnung"
          className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 text-sm"
        />
      </div>
      {loading && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 px-1">
          <Loader2 size={12} className="animate-spin" />
          Suche…
        </div>
      )}
      {error && <div className="text-xs text-red-600 px-1">{error}</div>}
      {!loading && results && results.length === 0 && (
        <div className="text-xs text-slate-400 px-1">Keine Treffer.</div>
      )}
      {results && results.length > 0 && (
        <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {results.slice(0, 20).map((a, i) => (
            <li key={`${a.number}-${i}`}>
              <button
                type="button"
                onClick={() => pick(a)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-800 truncate">{a.name}</span>
                  <span className="text-xs text-slate-400 font-mono flex-shrink-0">{baseArticleNumber(a.number)}</span>
                </div>
                {a.group && <div className="text-[11px] text-slate-400">{a.group}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <button
          type="button"
          onClick={() => setSearching(false)}
          className="text-xs text-slate-500 hover:text-slate-700 px-1"
        >
          Abbrechen
        </button>
      )}
    </div>
  );
}
