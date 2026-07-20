import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, MessageSquare, Send, User } from 'lucide-react';
import { addComment, listComments } from '../api/ticketApi';
import type { TicketComment } from '../types';

interface TicketCommentsProps {
  ticketId: string;
  currentEmployeeId?: string | null;
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return 'gerade eben';
  const min = Math.round(sec / 60);
  if (min < 60) return `vor ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `vor ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `vor ${day} Tag${day === 1 ? '' : 'en'}`;
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const SYSTEM_KIND_LABEL: Record<TicketComment['kind'], string> = {
  comment: '',
  status_change: 'Status geändert',
  assignment: 'Zuweisung geändert',
  system: 'System',
  milestone: 'Meilenstein',
};

export default function TicketComments({ ticketId, currentEmployeeId = null }: TicketCommentsProps) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [posting, setPosting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listComments(ticketId);
      setComments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const c = await addComment(ticketId, draft.trim(), {
        createdBy: currentEmployeeId ?? undefined,
        isInternal,
      });
      setComments((prev) => [...prev, c]);
      setDraft('');
      setIsInternal(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Existing comments */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={12} className="animate-spin" />
          Lade Kommentare…
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
          <MessageSquare size={20} className="mx-auto mb-1 text-slate-300" />
          Noch keine Kommentare. Schreibe den ersten Eintrag.
        </div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                c.isExternal
                  ? 'bg-violet-50 border-violet-200'
                  : c.kind === 'comment'
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
              data-testid="ticket-comment"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <User size={12} className="text-slate-400" />
                <span className="font-medium text-slate-700">
                  {c.isExternal
                    ? 'Kunde'
                    : c._authorName ?? (c.kind === 'comment' ? 'Unbekannt' : SYSTEM_KIND_LABEL[c.kind])}
                </span>
                {c.isExternal && (
                  <span className="rounded bg-violet-200 text-violet-800 px-1.5 py-0.5 text-[10px] font-medium">
                    via Portal
                  </span>
                )}
                {!c.isExternal && c.kind !== 'comment' && (
                  <span className="rounded bg-slate-200 text-slate-600 px-1.5 py-0.5 text-[10px]">
                    {SYSTEM_KIND_LABEL[c.kind]}
                  </span>
                )}
                {!c.isExternal && c.kind === 'comment' && (
                  c.isInternal ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">
                      <EyeOff size={10} />
                      Intern
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-medium">
                      <Eye size={10} />
                      Kunde sieht
                    </span>
                  )
                )}
                <span className="text-slate-400">{relTime(c.createdAt)}</span>
              </div>
              {c.body && <div className="text-slate-700 whitespace-pre-wrap">{c.body}</div>}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={handlePost} className="space-y-2">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Kommentar hinzufügen…"
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-y"
            disabled={posting}
          />
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50 self-start"
          >
            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Senden
          </button>
        </div>
        {/* Visibility toggle — Intern (default) hides the comment from the
            customer portal; Extern makes it visible as "Anmerkung KITZ". */}
        <div
          className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium"
          role="group"
          aria-label="Sichtbarkeit"
        >
          <button
            type="button"
            onClick={() => setIsInternal(true)}
            aria-pressed={isInternal}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
              isInternal ? 'bg-amber-100 text-amber-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <EyeOff size={12} />
            Intern
          </button>
          <button
            type="button"
            onClick={() => setIsInternal(false)}
            aria-pressed={!isInternal}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
              !isInternal ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Eye size={12} />
            Extern · Kunde sieht
          </button>
        </div>
      </form>
    </div>
  );
}
