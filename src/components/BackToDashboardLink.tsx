import { ArrowLeft } from 'lucide-react';

// Deep-links aus dem Reviewer-Dashboard tragen ?from=uebersicht (+ optional eine
// Item-ID), damit Ziel-Seiten einen „← Zur Übersicht"-Rückweg anbieten und das
// getippte Item öffnen können.
//
// Bewusst router-frei: wir lesen den Query-Teil direkt aus dem HashRouter-URL
// (#/pfad?from=uebersicht&…) statt über useLocation/useNavigate. So funktioniert
// das Widget in jedem Kontext (auch in Komponenten-Tests ohne <Router>).

function hashParams(): URLSearchParams {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const q = hash.indexOf('?');
  return new URLSearchParams(q >= 0 ? hash.slice(q + 1) : '');
}

export function isFromDashboard(): boolean {
  return hashParams().get('from') === 'uebersicht';
}

// Liest einen Deep-Link-Parameter (z. B. 'freigabe' | 'anfrage'), aber nur wenn
// die Seite aus dem Dashboard geöffnet wurde.
export function useDashboardParam(key: string): string | null {
  const p = hashParams();
  return p.get('from') === 'uebersicht' ? p.get(key) : null;
}

export default function BackToDashboardLink({ className = '' }: { className?: string }) {
  if (!isFromDashboard()) return null;
  return (
    <button
      type="button"
      onClick={() => { window.location.hash = '#/dashboard'; }}
      className={`inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 ${className}`}
    >
      <ArrowLeft className="w-4 h-4" /> Zur Übersicht
    </button>
  );
}
