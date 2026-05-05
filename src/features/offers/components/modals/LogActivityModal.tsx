import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Phone, X, XCircle } from 'lucide-react';
import DatePicker from '../../../../components/DatePicker';
import {
  ACTIVITY_KIND_CONFIG,
  ACTIVITY_OUTCOME_CONFIG,
  ACTIVITY_OUTCOME_ORDER,
} from '../Badges';

export interface ActivityDraft {
  kind: 'call' | 'email' | 'meeting' | 'note';
  outcome: string | null;
  note: string;
  // ISO timestamp string (UTC) or null when no follow-up scheduled.
  nextFollowupAt: string | null;
  // Optional stage transition triggered from the modal — set when
  // the user opts in via the "+ als gewonnen/verloren markieren"
  // checkbox suggested by the chosen outcome. Null/undefined means
  // "leave the stage as-is".
  stageChange?: 'closed' | 'lost' | null;
}

// Outcomes that suggest the deal moved to a terminal stage. The
// modal proposes (but never auto-applies) the matching transition.
const STAGE_SUGGESTION: Partial<Record<string, 'closed' | 'lost'>> = {
  interested: 'closed',
  not_interested: 'lost',
};

interface LogActivityModalProps {
  customerLabel: string;
  defaultKind?: ActivityDraft['kind'];
  onSubmit: (draft: ActivityDraft) => Promise<void> | void;
  onClose: () => void;
  saving?: boolean;
}

const KIND_ORDER: ActivityDraft['kind'][] = ['call', 'email', 'meeting', 'note'];

// Convert an ISO date (YYYY-MM-DD) and HH:mm time into an ISO UTC
// timestamp suitable for storage. Times are interpreted in the
// browser's local timezone.
function toIsoUtc(date: string, time: string): string | null {
  if (!date) return null;
  const [hh, mm] = (time || '09:00').split(':');
  const d = new Date(date);
  d.setHours(Number(hh) || 9, Number(mm) || 0, 0, 0);
  return d.toISOString();
}

function isoFromOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SHORTCUTS: { label: string; days: number }[] = [
  { label: 'Morgen', days: 1 },
  { label: '+3 Tage', days: 3 },
  { label: '+1 Woche', days: 7 },
  { label: '+2 Wochen', days: 14 },
];

export default function LogActivityModal({
  customerLabel,
  defaultKind = 'call',
  onSubmit,
  onClose,
  saving = false,
}: LogActivityModalProps) {
  const [kind, setKind] = useState<ActivityDraft['kind']>(defaultKind);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [followupTime, setFollowupTime] = useState('09:00');
  // The user must opt in to a stage change — never automatic. We
  // reset the opt-in whenever the outcome changes so a stale
  // checkbox doesn't carry over to a different outcome.
  const [stageOptIn, setStageOptIn] = useState(false);
  useEffect(() => { setStageOptIn(false); }, [outcome]);

  const suggestedStage = outcome ? STAGE_SUGGESTION[outcome] ?? null : null;

  function handleSave() {
    if (saving) return;
    const draft: ActivityDraft = {
      kind,
      outcome,
      note: note.trim(),
      nextFollowupAt: toIsoUtc(followupDate, followupTime),
      stageChange: stageOptIn && suggestedStage ? suggestedStage : null,
    };
    onSubmit(draft);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-600 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Phone size={18} />
            <span className="font-bold" style={{ fontSize: 16 }}>Kontakt protokollieren</span>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="text-slate-500" style={{ fontSize: 12 }}>
            <span className="text-slate-400">Angebot für</span>{' '}
            <span className="font-medium text-slate-700">{customerLabel}</span>
          </div>

          {/* Kind pills */}
          <div>
            <div className="font-medium text-slate-500 mb-1.5" style={{ fontSize: 11 }}>Art</div>
            <div className="flex flex-wrap gap-1.5">
              {KIND_ORDER.map((k) => {
                const cfg = ACTIVITY_KIND_CONFIG[k]!;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${active ? cfg.color + ' ring-2 ring-offset-1 ring-blue-500' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    style={{ fontSize: 11 }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Outcome pills */}
          <div>
            <div className="font-medium text-slate-500 mb-1.5" style={{ fontSize: 11 }}>Ergebnis</div>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_OUTCOME_ORDER.map((o) => {
                const cfg = ACTIVITY_OUTCOME_CONFIG[o]!;
                const active = outcome === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOutcome(active ? null : o)}
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${active ? cfg.color + ' ring-2 ring-offset-1 ring-blue-500' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    style={{ fontSize: 11 }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block font-medium text-slate-500 mb-1.5" style={{ fontSize: 11 }}>Notiz</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder='z. B. „bittet um Rückruf nächste Woche, ist diese Woche im Urlaub"'
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              style={{ fontSize: 13 }}
            />
          </div>

          {/* Next follow-up */}
          <div>
            <div className="font-medium text-slate-500 mb-1.5" style={{ fontSize: 11 }}>Nächster Follow-up</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SHORTCUTS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setFollowupDate(isoFromOffset(s.days))}
                  className="rounded-full px-3 py-1 font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  style={{ fontSize: 11 }}
                >
                  {s.label}
                </button>
              ))}
              {followupDate && (
                <button
                  type="button"
                  onClick={() => setFollowupDate('')}
                  className="rounded-full px-3 py-1 font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  style={{ fontSize: 11 }}
                >
                  Entfernen
                </button>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <DatePicker
                  value={followupDate}
                  onChange={setFollowupDate}
                  placeholder="Kein Follow-up"
                  size="sm"
                  ariaLabel="Follow-up Datum"
                />
              </div>
              <input
                type="time"
                value={followupTime}
                onChange={(e) => setFollowupTime(e.target.value)}
                disabled={!followupDate}
                className="border border-slate-200 rounded-lg px-2 py-1 disabled:bg-slate-50 disabled:text-slate-400"
                style={{ fontSize: 12 }}
                aria-label="Follow-up Uhrzeit"
              />
            </div>
          </div>

          {suggestedStage && (
            <label className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
              suggestedStage === 'closed'
                ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                : 'border-red-200 bg-red-50 hover:bg-red-100'
            }`}>
              <input
                type="checkbox"
                checked={stageOptIn}
                onChange={(e) => setStageOptIn(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
                aria-label={suggestedStage === 'closed' ? 'Als gewonnen markieren' : 'Als verloren markieren'}
              />
              <div className="flex-1 min-w-0">
                <div className={`flex items-center gap-1.5 font-semibold ${suggestedStage === 'closed' ? 'text-emerald-700' : 'text-red-700'}`} style={{ fontSize: 12 }}>
                  {suggestedStage === 'closed' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {suggestedStage === 'closed' ? 'Auch als gewonnen markieren' : 'Auch als verloren markieren'}
                </div>
                <div className="text-slate-600" style={{ fontSize: 11 }}>
                  {suggestedStage === 'closed'
                    ? 'Setzt das Angebot auf „Abgeschlossen" — verschwindet aus den Follow-ups.'
                    : 'Setzt das Angebot auf „Verloren" — verschwindet aus den Follow-ups.'}
                </div>
              </div>
            </label>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg bg-slate-100 text-slate-600 px-4 py-2 hover:bg-slate-200 transition-colors disabled:opacity-50"
            style={{ fontSize: 13 }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            style={{ fontSize: 13 }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
