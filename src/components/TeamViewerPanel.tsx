import { useState, useEffect } from 'react';
import { Loader2, Monitor, RefreshCw } from 'lucide-react';
import { findCustomerDevices } from '../lib/teamviewerApi';
import type { CustomerDevice } from '../lib/teamviewerMatch';

// TeamViewer-Geräte eines Kunden. Treffer über die Kundennummer als Suffix am
// Geräte-Alias ODER am Gruppennamen (nur Nummer, keine Namensraterei). Jeder
// Treffer öffnet per teamviewer://-Link den lokal installierten TeamViewer des
// Technikers. Lädt automatisch beim Öffnen des Kunden.
export default function TeamViewerPanel({ kdnr }: { kdnr: string }) {
  const [devices, setDevices] = useState<CustomerDevice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    findCustomerDevices(kdnr)
      .then((res) => { if (!cancelled) setDevices(res); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kdnr]);

  function reload() {
    setLoading(true);
    setError(null);
    findCustomerDevices(kdnr)
      .then(setDevices)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <Monitor className="w-3.5 h-3.5" /> TeamViewer
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
      ) : !devices || devices.length === 0 ? (
        <p className="text-xs text-slate-400">Keine Geräte mit dieser Kundennummer in TeamViewer.</p>
      ) : (
        <ul className="space-y-2">
          {devices.map((d, i) => (
            <li key={`${d.url}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${d.online ? 'bg-emerald-500' : 'bg-slate-300'}`}
                title={d.online ? 'Online' : 'Offline'}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{d.alias || 'Gerät'}</div>
                {d.groupName && <div className="text-slate-400 truncate" style={{ fontSize: 11 }}>{d.groupName}</div>}
              </div>
              <a
                href={d.url}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors flex-shrink-0 ${
                  d.online
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" /> Verbinden
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
