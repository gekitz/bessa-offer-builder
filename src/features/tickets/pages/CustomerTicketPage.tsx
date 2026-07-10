import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Send,
  Wrench,
} from 'lucide-react';
import {
  addPublicComment,
  getPublicTicketView,
  type PublicAppointment,
  type PublicTicket,
  type PublicTicketView,
  type PublicTimelineEntry,
} from '../api/publicTicketApi';
import PublicSignedRepairOrderModal from '../components/PublicSignedRepairOrderModal';

interface CustomerTicketPageProps {
  shareCode: string;
}

const STATUS_LABEL: Record<PublicTicket['status'], string> = {
  open: 'Auftrag eingelangt',
  in_progress: 'In Bearbeitung',
  waiting: 'Wartet auf Rückmeldung',
  closed: 'Abgeschlossen',
  cancelled: 'Storniert',
};

const STATUS_CLS: Record<PublicTicket['status'], string> = {
  open:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  waiting:     'bg-slate-100 text-slate-600 border-slate-200',
  closed:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:   'bg-rose-50 text-rose-700 border-rose-200',
};

const APPT_STATUS_LABEL_DE: Record<string, string> = {
  geplant: 'Geplant',
  bestaetigt: 'Bestätigt',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
  abgesagt: 'Abgesagt',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTimeShort(iso: string): string {
  return new Date(iso).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface TimelineItem {
  kind: 'created' | 'status' | 'comment' | 'appointment' | 'closed' | 'milestone';
  ts: string;
  payload: PublicTimelineEntry | PublicAppointment | PublicTicket;
}

function buildTimeline(view: PublicTicketView): TimelineItem[] {
  const items: TimelineItem[] = [
    { kind: 'created', ts: view.ticket.createdAt, payload: view.ticket },
    ...view.appointments.map<TimelineItem>((a) => ({
      kind: 'appointment',
      ts: a.startsAt,
      payload: a,
    })),
    ...view.timeline.map<TimelineItem>((c) => ({
      kind: c.kind === 'status_change' ? 'status' : c.kind === 'milestone' ? 'milestone' : 'comment',
      ts: c.createdAt,
      payload: c,
    })),
  ];
  if (view.ticket.closedAt) {
    items.push({ kind: 'closed', ts: view.ticket.closedAt, payload: view.ticket });
  }
  return items.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

export default function CustomerTicketPage({ shareCode }: CustomerTicketPageProps) {
  const [view, setView] = useState<PublicTicketView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // repair order id whose signed document is open in the viewer modal.
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicTicketView(shareCode);
      if (!data) {
        setError('Auftrag nicht gefunden. Bitte den Link überprüfen.');
        setView(null);
        return;
      }
      setView(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [shareCode]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !view) return;
    setPosting(true);
    setPostError(null);
    try {
      const created = await addPublicComment(shareCode, draft);
      setView({ ...view, timeline: [...view.timeline, created] });
      setDraft('');
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-red-500" />
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-6 text-center">
          <AlertCircle size={28} className="mx-auto mb-3 text-red-500" />
          <h1 className="font-bold text-slate-800 mb-1" style={{ fontSize: 18 }}>
            Auftrag nicht verfügbar
          </h1>
          <p className="text-sm text-slate-600">
            {error ?? 'Der Link ist möglicherweise abgelaufen oder nicht korrekt.'}
          </p>
          <a
            href="https://www.kitz.co.at"
            className="inline-block mt-4 text-sm text-red-600 hover:underline"
          >
            Zur KITZ-Website
          </a>
        </div>
      </div>
    );
  }

  const { ticket } = view;
  const timeline = buildTimeline(view);
  const closed = ticket.status === 'closed' || ticket.status === 'cancelled';

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div
            className="flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 text-white font-bold rounded-lg flex-shrink-0"
            style={{ width: 40, height: 40, fontSize: 13 }}
          >
            KITZ
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-800" style={{ fontSize: 15 }}>
              KITZ Computer + Office
            </div>
            <div className="text-xs text-slate-500">Auftragsverfolgung</div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Ticket summary */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs text-slate-400">{ticket.ticketNumber}</span>
            <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_CLS[ticket.status]}`}>
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>
          <h1 className="font-bold text-slate-800 leading-tight mb-2" style={{ fontSize: 18 }}>
            {ticket.title}
          </h1>
          {ticket.description && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap mb-2">{ticket.description}</p>
          )}
          {ticket.customerName && (
            <div className="text-xs text-slate-500">Kunde: {ticket.customerName}</div>
          )}
        </section>

        {/* Resolution note when closed */}
        {ticket.resolutionNote && (
          <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-emerald-800 mb-1">
                  Auftrag abgeschlossen
                </div>
                <p className="text-sm text-emerald-900 whitespace-pre-wrap">{ticket.resolutionNote}</p>
              </div>
            </div>
          </section>
        )}

        {/* Timeline */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Verlauf</span>
          </div>
          <ol className="space-y-3">
            {timeline.map((item, i) => (
              <TimelineRow
                key={`${item.kind}-${i}-${item.ts}`}
                item={item}
                onViewDoc={setViewDocId}
              />
            ))}
          </ol>
        </section>

        {/* Customer comment box */}
        {!closed && (
          <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={14} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">Rückmeldung</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Etwas Wichtiges für uns? Hinterlassen Sie eine Notiz — wir melden uns zurück.
            </p>
            <form onSubmit={handlePost} className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="z.B. Bitte morgen vormittags anrufen, ab Mittag bin ich nicht erreichbar."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-y"
                disabled={posting}
              />
              {postError && (
                <div className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {postError}
                </div>
              )}
              <button
                type="submit"
                disabled={posting || !draft.trim()}
                className="self-end inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Senden
              </button>
            </form>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 pt-2 pb-6">
          <div>KITZ Computer + Office GmbH</div>
          <div className="mt-1">
            <a href="tel:043524176" className="hover:underline">04352/4176</a>
            <span className="mx-1">·</span>
            <a href="mailto:office@kitz.co.at" className="hover:underline">office@kitz.co.at</a>
            <span className="mx-1">·</span>
            <a href="https://www.kitz.co.at" className="hover:underline">kitz.co.at</a>
          </div>
        </footer>
      </main>

      {viewDocId && (
        <PublicSignedRepairOrderModal
          shareCode={shareCode}
          repairOrderId={viewDocId}
          onClose={() => setViewDocId(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function TimelineRow({
  item,
  onViewDoc,
}: {
  item: TimelineItem;
  onViewDoc: (repairOrderId: string) => void;
}) {
  if (item.kind === 'created') {
    const t = item.payload as PublicTicket;
    return (
      <li className="flex items-start gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center mt-0.5">
          <Wrench size={12} className="text-slate-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800">Auftrag erstellt</div>
          <div className="text-xs text-slate-400">{fmtDateTimeShort(t.createdAt)}</div>
        </div>
      </li>
    );
  }
  if (item.kind === 'closed') {
    const t = item.payload as PublicTicket;
    return (
      <li className="flex items-start gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5">
          <CheckCircle2 size={12} className="text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800 font-medium">Auftrag abgeschlossen</div>
          <div className="text-xs text-slate-400">{t.closedAt ? fmtDateTimeShort(t.closedAt) : ''}</div>
        </div>
      </li>
    );
  }
  if (item.kind === 'appointment') {
    const a = item.payload as PublicAppointment;
    return (
      <li className="flex items-start gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center mt-0.5">
          <Calendar size={12} className="text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800">
            Termin: <span className="font-medium">{a.title}</span>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
            <span>{fmtDate(a.startsAt)} {fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}</span>
            {a.location && (
              <span className="flex items-center gap-1">
                <MapPin size={10} className="text-slate-400" />
                {a.location}
              </span>
            )}
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{APPT_STATUS_LABEL_DE[a.status] ?? a.status}</span>
          </div>
        </div>
      </li>
    );
  }
  if (item.kind === 'milestone') {
    const c = item.payload as PublicTimelineEntry;
    const meta = (c.metadata ?? {}) as { repairOrderId?: string; signed?: boolean };
    const canView = !!meta.signed && !!meta.repairOrderId;
    return (
      <li className="flex items-start gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 flex items-center justify-center mt-0.5">
          <FileText size={12} className="text-red-600" />
        </div>
        <div className="min-w-0 flex-1">
          {c.body && <div className="text-sm text-slate-800">{c.body}</div>}
          <div className="text-xs text-slate-400 mt-0.5">{fmtDateTimeShort(c.createdAt)}</div>
          {canView && (
            <button
              type="button"
              onClick={() => onViewDoc(meta.repairOrderId!)}
              className="mt-1 text-xs font-medium text-red-600 hover:underline"
            >
              Beleg ansehen ›
            </button>
          )}
        </div>
      </li>
    );
  }
  // 'status' / 'comment'
  const c = item.payload as PublicTimelineEntry;
  const isComment = item.kind === 'comment';
  return (
    <li className="flex items-start gap-2.5">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center mt-0.5">
        {isComment ? (
          <MessageSquare size={12} className="text-slate-500" />
        ) : (
          <Clock size={12} className="text-slate-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {isComment && c.isExternal && (
          <div className="text-xs text-slate-500 font-medium mb-0.5">
            Ihre Rückmeldung
          </div>
        )}
        {isComment && !c.isExternal && (
          <div className="text-xs text-slate-500 font-medium mb-0.5">
            Anmerkung KITZ
          </div>
        )}
        {!isComment && (
          <div className="text-xs text-slate-500 font-medium mb-0.5">
            Status-Änderung
          </div>
        )}
        {c.body && (
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</div>
        )}
        <div className="text-xs text-slate-400 mt-0.5">{fmtDateTimeShort(c.createdAt)}</div>
      </div>
    </li>
  );
}
