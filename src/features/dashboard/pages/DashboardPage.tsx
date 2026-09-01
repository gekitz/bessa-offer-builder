import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Loader2, RefreshCw, ShoppingCart, Umbrella, Wrench } from 'lucide-react';
import { loadReviewDashboard, type DashboardData } from '../api/dashboardApi';
import type { LeaveTypeCode } from '../../vacation/types';

// „Übersicht" — Freigabe-/Prüf-Cockpit für Georg + Herbert. Bündelt, was auf
// eine Entscheidung wartet: Tickets in Prüfung, Urlaub/Krank, offene
// Bestellanfragen. Jede Zeile springt in ihr Feature.

const LEAVE_LABEL: Record<LeaveTypeCode, string> = {
  urlaub: 'Urlaub',
  zeitausgleich: 'Zeitausgleich',
  krankenstand: 'Krankenstand',
  schule: 'Schule',
  pflege: 'Pflege',
  schulung: 'Schulung',
  sonderurlaub: 'Sonderurlaub',
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-AT');
}

interface DashboardPageProps {
  onOpenTicket?: (ticketId: string) => void;
  onOpenLeave?: (leaveId: string) => void;
  onOpenRequest?: (requestId: string) => void;
  onOpenSection?: (section: 'kalender' | 'bestellungen') => void;
}

export default function DashboardPage({ onOpenTicket, onOpenLeave, onOpenRequest, onOpenSection }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadReviewDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = data ? data.reviewTickets.length + data.pendingLeaves.length + data.openRequests.length : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Übersicht</h1>
          <p className="text-xs text-slate-500">
            {loading ? 'lädt …' : total === 0 ? 'Nichts zu prüfen — alles erledigt 🎉' : `${total} Punkt${total === 1 ? '' : 'e'} brauchen deine Aufmerksamkeit`}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Aktualisieren
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <div className="flex items-center gap-2 m-1 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : loading && !data ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 max-w-6xl">
            {/* Tickets in Prüfung → Freigabe → Mesonic */}
            <Card
              title="Tickets zu prüfen"
              icon={<Wrench className="w-4 h-4" />}
              count={data.reviewTickets.length}
              accent="violet"
              empty="Keine Tickets in Prüfung."
            >
              {data.reviewTickets.map((t) => (
                <Row key={t.id} onClick={onOpenTicket ? () => onOpenTicket(t.id) : undefined}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700 truncate">{t.title}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {t.ticketNumber}{t.customerName ? ` · ${t.customerName}` : ''}
                    </div>
                  </div>
                </Row>
              ))}
            </Card>

            {/* Urlaub / Krank zu genehmigen */}
            <Card
              title="Urlaub / Krank"
              icon={<Umbrella className="w-4 h-4" />}
              count={data.pendingLeaves.length}
              accent="amber"
              empty="Keine offenen Anträge."
              onHeaderClick={onOpenSection ? () => onOpenSection('kalender') : undefined}
            >
              {data.pendingLeaves.map((l) => (
                <Row key={l.id} onClick={onOpenLeave ? () => onOpenLeave(l.id) : undefined}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700 truncate">{l.employeeName}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {LEAVE_LABEL[l.leaveTypeCode] ?? l.leaveTypeCode} · {fmt(l.startDate)}
                      {l.endDate !== l.startDate ? `–${fmt(l.endDate)}` : ''}
                    </div>
                  </div>
                </Row>
              ))}
            </Card>

            {/* Offene Bestellanfragen */}
            <Card
              title="Bestellungen"
              icon={<ShoppingCart className="w-4 h-4" />}
              count={data.openRequests.length}
              accent="sky"
              empty="Keine offenen Anfragen."
              onHeaderClick={onOpenSection ? () => onOpenSection('bestellungen') : undefined}
            >
              {data.openRequests.map((r) => (
                <Row key={r.id} onClick={onOpenRequest ? () => onOpenRequest(r.id) : undefined}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700 truncate">
                      {r.qty}× {r.productName}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {[r.requesterName, r.customerName].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </Row>
              ))}
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const ACCENT: Record<string, string> = {
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  sky: 'bg-sky-100 text-sky-700',
};

function Card({
  title, icon, count, accent, empty, children, onHeaderClick,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  accent: keyof typeof ACCENT | string;
  empty: string;
  children?: React.ReactNode;
  onHeaderClick?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white flex flex-col" data-testid={`dashboard-card-${title}`}>
      <button
        type="button"
        onClick={onHeaderClick}
        disabled={!onHeaderClick}
        className={`flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-100 text-left ${onHeaderClick ? 'hover:bg-slate-50' : 'cursor-default'}`}
      >
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${ACCENT[accent] ?? ACCENT.violet}`}>{icon}</span>
        <span className="font-semibold text-slate-800 text-sm flex-1">{title}</span>
        <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-semibold ${count > 0 ? (ACCENT[accent] ?? ACCENT.violet) : 'bg-slate-100 text-slate-400'}`}>
          {count}
        </span>
      </button>
      {count === 0 ? (
        <div className="px-3.5 py-4 text-xs text-slate-400">{empty}</div>
      ) : (
        <div className="divide-y divide-slate-50">{children}</div>
      )}
    </div>
  );
}

function Row({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-left ${onClick ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {onClick && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
    </button>
  );
}
