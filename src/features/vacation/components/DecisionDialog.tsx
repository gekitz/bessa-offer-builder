import { useEffect, useState } from 'react';
import { Check, Loader2, Sun, User, X } from 'lucide-react';
import { listLeaveBalances, listLeaveRequests } from '../api/vacationApi';
import { summarizeBalance } from '../lib/balance';
import type { LeaveTypeCode } from '../types';

interface DecisionDialogProps {
  decision: 'approved' | 'rejected';
  // Plain-text summary shown above the note field — typically
  // "Stefan Bauer · Urlaub · 10.08.2026 – 15.08.2026".
  summary: string;
  // Approver context — when set, the dialog loads the requester's
  // Urlaub balance for the request's year and renders it inline.
  // Skipped silently when the leave type has no balance bucket.
  contextEmployeeId?: string;
  contextYear?: number;
  contextLeaveTypeCode?: LeaveTypeCode;
  // Already-resolved substitute name. The list has the employee map
  // anyway; passing the name here avoids duplicating the lookup.
  contextSubstituteName?: string | null;
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

interface BalanceContext {
  entitled: number;
  carriedOver: number;
  used: number;
  planned: number;
  remaining: number;
}

function fmtDays(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

// Modal that captures an optional decision note when an approver
// genehmigt or ablehnt a request. Replaces window.confirm() so the
// approver can attach a reason — important for rejections, useful
// audit trail for approvals.
export default function DecisionDialog({
  decision,
  summary,
  contextEmployeeId,
  contextYear,
  contextLeaveTypeCode,
  contextSubstituteName,
  onConfirm,
  onClose,
}: DecisionDialogProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cfg = COPY[decision];
  const Icon = cfg.icon;

  const showBalance = !!contextEmployeeId
    && !!contextYear
    && contextLeaveTypeCode === 'urlaub';
  const [balance, setBalance] = useState<BalanceContext | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(showBalance);

  useEffect(() => {
    if (!showBalance) return;
    let cancelled = false;
    setBalanceLoading(true);
    Promise.all([
      listLeaveBalances(contextEmployeeId!, contextYear!),
      listLeaveRequests({
        employeeId: contextEmployeeId!,
        rangeStart: `${contextYear}-01-01`,
        rangeEnd: `${contextYear}-12-31`,
      }),
    ])
      .then(([balances, leaves]) => {
        if (cancelled) return;
        const row = balances.find((b) => b.leaveTypeCode === 'urlaub');
        if (!row) {
          setBalance(null);
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const summary = summarizeBalance({
          leaveTypeCode: 'urlaub',
          entitled: row.entitled,
          carriedOver: row.carriedOver,
          leaves,
          today,
        });
        setBalance({
          entitled: summary.entitled,
          carriedOver: summary.carriedOver,
          used: summary.used,
          planned: summary.planned,
          remaining: summary.remaining,
        });
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [showBalance, contextEmployeeId, contextYear]);

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

          {(showBalance || contextSubstituteName) && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2" data-testid="approver-context">
              {showBalance && (
                <div className="flex items-start gap-2">
                  <Sun size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1" style={{ fontSize: 12 }}>
                    {balanceLoading && (
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> Urlaubsstand wird geladen…
                      </span>
                    )}
                    {!balanceLoading && balance && (
                      <>
                        <div className="text-slate-700">
                          <span className="font-semibold">{fmtDays(balance.remaining)}</span>
                          <span className="text-slate-500"> von {fmtDays(balance.entitled + balance.carriedOver)} Tagen verbleibend</span>
                        </div>
                        <div className="text-slate-400 mt-0.5" style={{ fontSize: 11 }}>
                          Genommen: {fmtDays(balance.used)} · Geplant (inkl. Antrag): {fmtDays(balance.planned)}
                        </div>
                      </>
                    )}
                    {!balanceLoading && !balance && (
                      <span className="text-slate-400">Kein Urlaubsanspruch hinterlegt.</span>
                    )}
                  </div>
                </div>
              )}
              {contextSubstituteName && (
                <div className="flex items-start gap-2">
                  <User size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                  <div className="text-slate-700" style={{ fontSize: 12 }}>
                    Vertretung: <span className="font-semibold">{contextSubstituteName}</span>
                  </div>
                </div>
              )}
            </div>
          )}

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
