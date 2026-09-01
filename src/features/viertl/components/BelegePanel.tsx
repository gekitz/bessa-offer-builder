import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Download, Wrench, ArrowUpToLine } from 'lucide-react';
import { loadCachedBelege, syncBelege, type BelegeCacheState, type CachedBeleg } from '../api/belegeApi';
import { isLikelyHardware } from '../lib/mesonicBelege';

// Belege eines Kunden (aus dem kdnr-basierten Cache). Auf Abruf: erst laden
// (voller Scan), danach nur neue Belege nachladen. Klick auf einen Beleg
// öffnet die Positionen; wahrscheinliche Hardware (Erlöskonto 8000/8050)
// ist hervorgehoben. Ist onPickHardware gesetzt, übernimmt ein Klick auf eine
// grüne Hardware-Zeile deren Bezeichnung (z. B. ins Hardware-Modell-Feld).
export default function BelegePanel({
  kdnr,
  highlightHardware = true,
  onPickHardware,
}: {
  kdnr: string;
  highlightHardware?: boolean;
  onPickHardware?: (bezeichnung: string) => void;
}) {
  const [cache, setCache] = useState<BelegeCacheState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ n: number; found: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCachedBelege(kdnr)
      .then((c) => { if (!cancelled) setCache(c); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kdnr]);

  const sync = useCallback(async (full: boolean) => {
    setSyncing(true);
    setError(null);
    setProgress({ n: 0, found: 0 });
    abortRef.current = false;
    try {
      const c = await syncBelege(kdnr, {
        full,
        onProgress: (n, found) => setProgress({ n, found }),
        abort: () => abortRef.current,
      });
      setCache(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync fehlgeschlagen');
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }, [kdnr]);

  const belege = cache?.belege ?? [];
  const hasCache = belege.length > 0;

  return (
    <div className="pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{highlightHardware ? 'Belege / Hardware' : 'Belege'}</span>
        {syncing ? (
          <button onClick={() => { abortRef.current = true; }} className="inline-flex items-center gap-1 text-xs text-amber-700">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {progress ? `${progress.n} · ${progress.found} neu` : '…'} — Stopp
          </button>
        ) : hasCache ? (
          <button onClick={() => void sync(false)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <RefreshCw className="w-3.5 h-3.5" /> Neue laden
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : !hasCache ? (
        <div>
          <p className="text-xs text-slate-400 mb-2">Noch keine Belege geladen.</p>
          <button
            onClick={() => void sync(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Download className="w-3.5 h-3.5" /> Belege aus Mesonic laden
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {belege.map((b) => (
              <BelegRow key={b.index} beleg={b} open={openIdx === b.index} onToggle={() => setOpenIdx(openIdx === b.index ? null : b.index)} highlightHardware={highlightHardware} onPickHardware={onPickHardware} />
            ))}
          </div>
          {cache?.syncedAt && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Stand: {new Date(cache.syncedAt).toLocaleDateString('de-AT')} · bis Beleg #{cache.syncedIndex}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BelegRow({ beleg, open, onToggle, highlightHardware, onPickHardware }: { beleg: CachedBeleg; open: boolean; onToggle: () => void; highlightHardware: boolean; onPickHardware?: (bezeichnung: string) => void }) {
  const hwCount = highlightHardware ? beleg.positions.filter(isLikelyHardware).length : 0;
  return (
    <div className="rounded border border-slate-200 bg-white">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-50">
        <span className="font-mono text-slate-700">
          {open ? '▾' : '▸'} {beleg.datumFaktura ?? '—'} · Belegart {beleg.belegart}
        </span>
        <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
          {hwCount > 0 && <span className="inline-flex items-center gap-0.5 text-emerald-700"><Wrench className="w-3 h-3" />{hwCount}</span>}
          {beleg.positions.length} Pos
        </span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 overflow-x-auto">
          <table className="w-full text-[11px]">
            <tbody>
              {beleg.positions.map((p, i) => {
                const hw = highlightHardware && isLikelyHardware(p);
                const isArt = p.datentyp === '1' && (p.artikelnummer || '').toUpperCase() !== 'TEXT';
                const pickable = hw && !!onPickHardware && !!p.bezeichnung;
                return (
                  <tr
                    key={i}
                    onClick={pickable ? () => onPickHardware!(p.bezeichnung) : undefined}
                    title={pickable ? 'Als Hardware-Modell übernehmen' : undefined}
                    className={
                      `${hw ? 'text-emerald-700 font-medium' : isArt ? 'text-slate-700' : 'text-slate-400'}` +
                      (pickable ? ' cursor-pointer hover:bg-emerald-50' : '')
                    }
                  >
                    <td className="pr-2 py-0.5 font-mono">{p.artikelnummer}</td>
                    <td className="pr-2">
                      <span className="inline-flex items-center gap-1">
                        {hw ? '🔧 ' : ''}{p.bezeichnung}
                        {pickable && <ArrowUpToLine className="w-3 h-3 opacity-40 shrink-0" />}
                      </span>
                    </td>
                    <td className="pr-1 text-right whitespace-nowrap">{p.menge}×</td>
                    <td className="text-right whitespace-nowrap">€ {p.einzelpreis}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
