import { useEffect, useState } from 'react';
import { Loader2, X, XCircle } from 'lucide-react';

import { LOST_REASONS, type LostReasonId } from '../../data/lostReasons';

// Required reason picker shown when the rep clicks Verloren. Chips
// are mandatory so the analytics aren't poisoned by skips; "Sonstiges"
// is the explicit-unknown escape hatch. The note is optional —
// useful for the "other" path or when there's color worth recording.

export interface LostReasonDraft {
  reason: LostReasonId;
  note: string;
}

export interface LostReasonModalProps {
  customerLabel: string;
  onSubmit: (draft: LostReasonDraft) => Promise<void> | void;
  onClose: () => void;
  saving?: boolean;
}

export default function LostReasonModal({ customerLabel, onSubmit, onClose, saving = false }: LostReasonModalProps) {
  const [reason, setReason] = useState<LostReasonId | null>(null);
  const [note, setNote] = useState('');

  // Esc closes the modal unless we're mid-save (avoid the rep
  // dismissing while the network call is in flight and getting
  // confused about whether it landed).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  function handleSubmit() {
    if (!reason || saving) return;
    onSubmit({ reason, note });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 md:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200">
          <div className="rounded-lg bg-red-50 text-red-600 p-2">
            <XCircle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 truncate" style={{ fontSize: 14 }}>
              Als verloren markieren
            </div>
            <div className="text-slate-500 truncate" style={{ fontSize: 12 }}>{customerLabel}</div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 transition-colors disabled:opacity-50"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <div className="text-slate-600 mb-2" style={{ fontSize: 11 }}>
              Grund <span className="text-red-500">*</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LOST_REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  disabled={saving}
                  title={r.hint}
                  className={`rounded-full px-3 py-1.5 font-medium border transition-colors ${
                    reason === r.id
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  } disabled:opacity-50`}
                  style={{ fontSize: 11 }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="lost-note" className="block text-slate-600 mb-1" style={{ fontSize: 11 }}>
              Notiz <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="lost-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Weitere Details — wer, was, warum genau."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 disabled:bg-slate-50"
              style={{ fontSize: 12, lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/50">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white text-slate-600 px-3 py-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
            style={{ fontSize: 12 }}
          >
            Abbrechen
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSubmit}
            disabled={!reason || saving}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-4 py-2 font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontSize: 12 }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            {saving ? 'Wird gespeichert...' : 'Verloren markieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
