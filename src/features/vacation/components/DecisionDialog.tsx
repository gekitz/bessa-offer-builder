import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

interface DecisionDialogProps {
  decision: 'approved' | 'rejected';
  // Plain-text summary shown above the note field — typically
  // "Stefan Bauer · Urlaub · 10.08.2026 – 15.08.2026".
  summary: string;
  onConfirm: (note: string | undefined) => Promise<void> | void;
  onClose: () => void;
}

const COPY = {
  approved: {
    title: 'Antrag genehmigen',
    cta: 'Genehmigen',
    accent: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
    icon: Check,
  },
  rejected: {
    title: 'Antrag ablehnen',
    cta: 'Ablehnen',
    accent: 'bg-red-600 hover:bg-red-700 shadow-red-200',
    icon: X,
  },
} as const;

// Modal that captures an optional decision note when an approver
// genehmigt or ablehnt a request. Replaces window.confirm() so the
// approver can attach a reason — important for rejections, useful
// audit trail for approvals.
export default function DecisionDialog({ decision, summary, onConfirm, onClose }: DecisionDialogProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cfg = COPY[decision];
  const Icon = cfg.icon;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(note.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold" style={{ fontSize: 16 }}>{cfg.title}</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-slate-700" style={{ fontSize: 13 }}>
            {summary}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Anmerkung (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={decision === 'rejected'
                ? 'z.B. Konflikt mit Kollegen-Abwesenheit'
                : 'z.B. Bestätigt mit Vertretung Mario Graf'
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700" style={{ fontSize: 12 }}>
              Fehler beim Speichern: {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3 hover:bg-slate-200 active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ fontSize: 14 }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-white font-semibold py-3 active:scale-[0.98] transition-all shadow-lg disabled:opacity-70 ${cfg.accent}`}
            style={{ fontSize: 14 }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
            {submitting ? 'Wird gespeichert…' : cfg.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
