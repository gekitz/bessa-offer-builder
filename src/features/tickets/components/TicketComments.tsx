import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, MessageSquare, Send, User, X } from 'lucide-react';
import { addComment, listComments, listWatchers, removeWatcher, type TicketWatcher } from '../api/ticketApi';
import { listEmployees } from '../../vacation/api/vacationApi';
import type { Employee } from '../../vacation/types';
import type { TicketComment } from '../types';

interface TicketCommentsProps {
  ticketId: string;
  currentEmployeeId?: string | null;
  /** Active staff for @-mentions. If omitted, the list is fetched here. */
  employees?: Employee[];
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Render a comment body with @Name mentions highlighted. `names` is the set
// of known employee names, matched longest-first so "Anna Maria" wins over
// "Anna".
function renderBody(body: string, names: string[]): React.ReactNode {
  if (!names.length) return body;
  const alt = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const re = new RegExp(`@(${alt})`, 'g');
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span key={i++} className="rounded bg-red-50 px-1 font-medium text-red-700">
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export default function TicketComments({ ticketId, currentEmployeeId = null, employees: employeesProp }: TicketCommentsProps) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [posting, setPosting] = useState(false);
  const [watchers, setWatchers] = useState<TicketWatcher[]>([]);

  // Employee directory for @-mentions. Prefer the parent's list; fall back
  // to a self-contained fetch so the component also works standalone.
  const [fetchedEmployees, setFetchedEmployees] = useState<Employee[]>([]);
  const employees = employeesProp ?? fetchedEmployees;
  useEffect(() => {
    if (employeesProp) return;
    listEmployees({ activeOnly: true })
      .then(setFetchedEmployees)
      .catch(() => {});
  }, [employeesProp]);

  // @-mention autocomplete state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<Set<string>>(new Set());
  const [activeIdx, setActiveIdx] = useState(0);

  const employeeNames = useMemo(() => employees.map((e) => e.name), [employees]);

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 6);
  }, [employees, mentionQuery]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, w] = await Promise.all([listComments(ticketId), listWatchers(ticketId).catch(() => [])]);
      setComments(data);
      setWatchers(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Detect the @-token the caret is sitting in (from the last "@" to the
  // caret, no intervening whitespace). Drives the suggestion popover.
  function syncMentionQuery(value: string, caret: number) {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf('@');
    if (at === -1) {
      setMentionQuery(null);
      return;
    }
    const frag = upto.slice(at + 1);
    // Token ends at whitespace — once the user types a space the popover closes.
    if (/\s/.test(frag)) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(frag);
    setActiveIdx(0);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    syncMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function pickMention(emp: Employee) {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const upto = draft.slice(0, caret);
    const at = upto.lastIndexOf('@');
    if (at === -1) return;
    const before = draft.slice(0, at);
    const after = draft.slice(caret);
    const inserted = `@${emp.name} `;
    const next = before + inserted + after;
    setDraft(next);
    setMentionIds((prev) => new Set(prev).add(emp.id));
    setMentionQuery(null);
    // Restore caret just after the inserted mention.
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery != null && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(suggestions[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    // Only keep mentions whose @Name token still survives in the text — the
    // user may have deleted one after selecting it.
    const mentions = employees
      .filter((emp) => mentionIds.has(emp.id) && draft.includes(`@${emp.name}`))
      .map((emp) => emp.id);
    try {
      const c = await addComment(ticketId, draft.trim(), {
        createdBy: currentEmployeeId ?? undefined,
        isInternal,
        mentions,
      });
      setComments((prev) => [...prev, c]);
      setDraft('');
      setIsInternal(true);
      setMentionIds(new Set());
      setMentionQuery(null);
      // New mentions become watchers — refresh the list.
      if (mentions.length) listWatchers(ticketId).then(setWatchers).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  async function handleUnwatch(employeeId: string) {
    const prev = watchers;
    setWatchers((w) => w.filter((x) => x.employeeId !== employeeId));
    try {
      await removeWatcher(ticketId, employeeId);
    } catch {
      setWatchers(prev); // rollback on failure
    }
  }

  return (
    <div className="space-y-3">
      {/* Watchers */}
      {watchers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Beobachter:</span>
          {watchers.map((w) => (
            <span
              key={w.employeeId}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700"
            >
              {w.name ?? 'Unbekannt'}
              <button
                type="button"
                onClick={() => handleUnwatch(w.employeeId)}
                className="text-slate-400 hover:text-red-600"
                aria-label={`${w.name ?? 'Beobachter'} entfernen`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

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
              {c.body && <div className="text-slate-700 whitespace-pre-wrap">{renderBody(c.body, employeeNames)}</div>}
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
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Kommentar hinzufügen… @ erwähnt Kolleg:innen"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-y"
              disabled={posting}
            />
            {/* @-mention suggestions */}
            {mentionQuery != null && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {suggestions.map((emp, i) => (
                  <li key={emp.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep textarea focus
                        pickMention(emp);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                        i === activeIdx ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <User size={12} className="text-slate-400" />
                      {emp.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
