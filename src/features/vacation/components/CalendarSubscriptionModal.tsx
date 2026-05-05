import { useEffect, useState } from 'react';
import { AlertCircle, Calendar, Check, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import { getCalendarToken, regenerateCalendarToken } from '../api/vacationApi';

interface CalendarSubscriptionModalProps {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  // Optional override for tests so they don't have to stub
  // import.meta.env.
  supabaseUrlOverride?: string;
}

function buildFeedUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl}/functions/v1/calendar-feed?token=${token}`;
}

// Modal that surfaces the per-employee ICS feed URL. The user pastes
// it into Outlook / Apple Calendar / Google Calendar as a "subscribe
// by URL" calendar; the client polls on its own schedule and reflects
// changes automatically. Regenerating rotates the token on the server
// and invalidates any subscription set up against the previous URL.
export default function CalendarSubscriptionModal({
  employeeId,
  employeeName,
  onClose,
  supabaseUrlOverride,
}: CalendarSubscriptionModalProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const supabaseUrl = supabaseUrlOverride ?? import.meta.env.VITE_SUPABASE_URL ?? '';

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCalendarToken(employeeId)
      .then((t) => {
        if (!cancelled) setToken(t);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [employeeId]);

  const url = token ? buildFeedUrl(supabaseUrl, token) : '';

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const fresh = await regenerateCalendarToken(employeeId);
      setToken(fresh);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={18} />
            <span className="font-bold" style={{ fontSize: 16 }}>Kalender abonnieren</span>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="Dialog schließen">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-slate-600" style={{ fontSize: 13 }}>
            Diese URL gehört zu <span className="font-semibold text-slate-800">{employeeName}</span>{' '}
            und zeigt alle Urlaubseinträge des Teams. Outlook, Apple Kalender und Google Kalender
            aktualisieren das Abo automatisch (alle paar Stunden).
          </p>

          {loading && (
            <div className="bg-slate-50 rounded-lg p-4 flex items-center gap-2 text-slate-500" style={{ fontSize: 13 }}>
              <Loader2 size={14} className="animate-spin" />
              URL wird geladen…
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-red-700" style={{ fontSize: 12 }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && token && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Abo-URL
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url}
                  aria-label="Kalender-Abo-URL"
                  className="flex-1 font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-red-500"
                  style={{ fontSize: 12 }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition-colors ${
                    copied
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-800 text-white hover:bg-slate-900'
                  }`}
                  style={{ fontSize: 12 }}
                  aria-label={copied ? 'URL kopiert' : 'URL kopieren'}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-slate-600" style={{ fontSize: 12 }}>
            <div className="font-semibold text-slate-700 mb-1">So abonnierst du den Kalender:</div>
            <div><span className="font-semibold">Outlook:</span> Datei → Kontoeinstellungen → Internetkalender → Neu → URL einfügen.</div>
            <div><span className="font-semibold">Apple Kalender:</span> Ablage → Neues Kalenderabonnement → URL einfügen.</div>
            <div><span className="font-semibold">Google Kalender:</span> + Weitere Kalender → Per URL → URL einfügen.</div>
          </div>

          {!loading && token && (
            <div className="border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                style={{ fontSize: 12 }}
              >
                {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {regenerating ? 'URL wird zurückgesetzt…' : 'URL zurücksetzen'}
              </button>
              <p className="text-slate-400 mt-1" style={{ fontSize: 11 }}>
                Setzt einen neuen Token. Bestehende Abos hören auf zu aktualisieren.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-100 text-slate-700 font-semibold py-3 hover:bg-slate-200 transition-colors"
            style={{ fontSize: 14 }}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
