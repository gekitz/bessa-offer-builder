import { useState, useEffect } from 'react';
import { Loader2, FolderOpen, ExternalLink, RefreshCw, Cloud } from 'lucide-react';
import { findCustomerDocs } from '../lib/nextcloudApi';
import type { CustomerFolder } from '../lib/nextcloudDav';

// Nextcloud-Dokumentation eines Kunden. Die Ordner tragen die Kundennummer als
// Suffix ("Zum Alois - 233679"); der Proxy sucht sie über WebDAV und liefert
// je Treffer einen Deep-Link, der den Ordner im Nextcloud-Web öffnet. Lädt
// automatisch beim Öffnen des Kunden — genau dann will man die Doku sehen.
export default function NextcloudPanel({ kdnr }: { kdnr: string }) {
  const [matches, setMatches] = useState<CustomerFolder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    findCustomerDocs(kdnr)
      .then((res) => { if (!cancelled) setMatches(res); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kdnr]);

  function reload() {
    setLoading(true);
    setError(null);
    findCustomerDocs(kdnr)
      .then(setMatches)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <Cloud className="w-3.5 h-3.5" /> Nextcloud
        </span>
        {!loading && (
          <button onClick={reload} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : !matches || matches.length === 0 ? (
        <p className="text-xs text-slate-400">Keine Dokumentation in Nextcloud gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={m.relPath}>
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-red-300 hover:bg-red-50 transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-slate-400 group-hover:text-red-500 flex-shrink-0" />
                <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{m.name}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-400 flex-shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
