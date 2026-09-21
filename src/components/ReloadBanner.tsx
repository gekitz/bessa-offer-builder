import { RefreshCw } from 'lucide-react';
import { useStaleChunk } from '../lib/reloadPrompt';

// Shown when a lazily-loaded chunk 404s — almost always because a new
// version was deployed while this tab was open (see lazyWithReload). Rather
// than silently reloading mid-action and dropping in-flight work, we ask the
// user to reload when it suits them.
export default function ReloadBanner() {
  const stale = useStaleChunk();
  if (!stale) return null;
  return (
    <div className="no-print fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-white shadow-lg">
      <span className="text-sm font-medium">
        Eine neue Version ist verfügbar. Bitte lade die Seite neu.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold hover:bg-white/25 active:scale-[0.98] transition-all"
      >
        <RefreshCw size={14} /> Neu laden
      </button>
    </div>
  );
}
