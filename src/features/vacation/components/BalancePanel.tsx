import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Sun } from 'lucide-react';
import { listLeaveBalances, listLeaveRequests, type LeaveBalance } from '../api/vacationApi';
import { summarizeBalance, type BalanceSummary } from '../lib/balance';
import type { IsoDate, LeaveRequest } from '../types';

interface BalancePanelProps {
  employeeId: string;
  // Defaults to the current calendar year. Overridable for tests.
  year?: number;
  // Defaults to today (local). Overridable for tests.
  today?: IsoDate;
  // Bump to force a re-fetch (e.g. after a new leave is approved).
  reloadKey?: number;
}

function todayIso(): IsoDate {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDays(n: number): string {
  // Austrian half-day convention: render with a single decimal only
  // when it actually matters.
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

export default function BalancePanel({
  employeeId,
  year,
  today,
  reloadKey = 0,
}: BalancePanelProps) {
  const resolvedYear = year ?? new Date().getFullYear();
  const resolvedToday = today ?? todayIso();

  const [balanceRow, setBalanceRow] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listLeaveBalances(employeeId, resolvedYear),
      listLeaveRequests({
        employeeId,
        rangeStart: `${resolvedYear}-01-01`,
        rangeEnd: `${resolvedYear}-12-31`,
      }),
    ])
      .then(([balances, leaveRows]) => {
        if (cancelled) return;
        const urlaub = balances.find((b) => b.leaveTypeCode === 'urlaub') ?? null;
        setBalanceRow(urlaub);
        setLeaves(leaveRows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [employeeId, resolvedYear, reloadKey]);

  const summary: BalanceSummary | null = balanceRow
    ? summarizeBalance({
      leaveTypeCode: 'urlaub',
      entitled: balanceRow.entitled,
      carriedOver: balanceRow.carriedOver,
      leaves,
      today: resolvedToday,
    })
    : null;

  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <Sun size={14} className="text-amber-500" />
        <span className="font-bold text-slate-600" style={{ fontSize: 12 }}>
          Urlaubsstand {resolvedYear}
        </span>
      </div>

      {loading && (
        <div className="px-4 py-5 flex items-center gap-2 text-slate-400" style={{ fontSize: 12 }}>
          <Loader2 size={14} className="animate-spin" />
          Wird berechnet…
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-3 flex items-start gap-2 text-red-700 bg-red-50" style={{ fontSize: 12 }}>
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && !summary && (
        <div className="px-4 py-5 text-slate-400" style={{ fontSize: 12 }}>
          Kein Urlaubsanspruch hinterlegt. Bitte HR kontaktieren.
        </div>
      )}

      {!loading && !error && summary && (
        <div className="p-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-bold text-slate-800" style={{ fontSize: 28 }}>
              {formatDays(summary.remaining)}
            </span>
            <span className="text-slate-500" style={{ fontSize: 13 }}>
              von {formatDays(summary.entitled + summary.carriedOver)} Tagen verbleibend
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Anspruch" value={summary.entitled} />
            <Stat label="Übertrag" value={summary.carriedOver} />
            <Stat label="Genommen" value={summary.used} />
            <Stat label="Geplant" value={summary.planned} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="text-slate-400 uppercase tracking-wider" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div className="font-bold text-slate-700" style={{ fontSize: 16 }}>
        {formatDays(value)}
      </div>
    </div>
  );
}
