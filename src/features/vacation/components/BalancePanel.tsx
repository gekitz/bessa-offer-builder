import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Sun } from 'lucide-react';
import { listLeaveBalances, listLeaveRequests, listLeaveTypes, type LeaveBalance, type LeaveType } from '../api/vacationApi';
import { summarizeBalance } from '../lib/balance';
import type { IsoDate, LeaveRequest, LeaveTypeCode } from '../types';

interface BalancePanelProps {
  employeeId: string;
  // Defaults to the current calendar year. Overridable for tests.
  year?: number;
  // Defaults to today (local). Overridable for tests.
  today?: IsoDate;
  // Bump to force a re-fetch (e.g. after a new leave is approved).
  reloadKey?: number;
}

interface TypeSummary {
  code: LeaveTypeCode;
  label: string;
  deductsFromBalance: boolean;
  entitled: number;
  carriedOver: number;
  used: number;
  planned: number;
  remaining: number;
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

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
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
      listLeaveTypes(),
    ])
      .then(([bals, leaveRows, types]) => {
        if (cancelled) return;
        setBalances(bals);
        setLeaves(leaveRows);
        setLeaveTypes(types);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [employeeId, resolvedYear, reloadKey]);

  // Build a summary row per type. Types without a balance row default
  // entitled / carriedOver to 0 — used / planned still come from leaves.
  const summaries: TypeSummary[] = leaveTypes.map((type) => {
    const bal = balances.find((b) => b.leaveTypeCode === type.code);
    const s = summarizeBalance({
      leaveTypeCode: type.code,
      entitled: bal?.entitled ?? 0,
      carriedOver: bal?.carriedOver ?? 0,
      leaves,
      today: resolvedToday,
    });
    return {
      code: type.code,
      label: type.label,
      deductsFromBalance: type.deductsFromBalance,
      entitled: s.entitled,
      carriedOver: s.carriedOver,
      used: s.used,
      planned: s.planned,
      remaining: s.remaining,
    };
  });

  // Hero number: Urlaub remaining (the "how many days do I have left"
  // question). Falls back to "no entitlement" when the balance row
  // doesn't exist for this employee.
  const urlaub = summaries.find((s) => s.code === 'urlaub');
  const urlaubBalance = balances.find((b) => b.leaveTypeCode === 'urlaub');

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

      {!loading && !error && (
        <div className="p-4 space-y-3">
          {/* Urlaub hero — entitlement number on top, key number bigger. */}
          {urlaubBalance && urlaub ? (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-slate-800" style={{ fontSize: 28 }}>
                {formatDays(urlaub.remaining)}
              </span>
              <span className="text-slate-500" style={{ fontSize: 13 }}>
                von {formatDays(urlaub.entitled + urlaub.carriedOver)} Tagen Urlaub verbleibend
              </span>
            </div>
          ) : (
            <div className="text-slate-400" style={{ fontSize: 12 }}>
              Kein Urlaubsanspruch hinterlegt.
            </div>
          )}

          {/* Per-type breakdown — every leave type, used / planned. */}
          <div className="border border-slate-100 rounded-lg overflow-hidden" data-testid="balance-type-table">
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-slate-50 text-slate-400 uppercase tracking-wider" style={{ fontSize: 10 }}>
              <div className="col-span-5">Art</div>
              <div className="col-span-2 text-right">Anspruch</div>
              <div className="col-span-2 text-right">Genommen</div>
              <div className="col-span-2 text-right">Geplant</div>
              <div className="col-span-1 text-right">Rest</div>
            </div>
            {summaries.map((s) => {
              const total = s.entitled + s.carriedOver;
              const dim = !s.deductsFromBalance && s.used === 0 && s.planned === 0;
              return (
                <div
                  key={s.code}
                  data-testid={`balance-type-${s.code}`}
                  className={`grid grid-cols-12 gap-2 px-3 py-1.5 border-t border-slate-100 ${
                    dim ? 'text-slate-400' : 'text-slate-700'
                  }`}
                  style={{ fontSize: 12 }}
                >
                  <div className="col-span-5 truncate">{s.label}</div>
                  <div className="col-span-2 text-right">
                    {s.deductsFromBalance ? formatDays(total) : '–'}
                  </div>
                  <div className="col-span-2 text-right font-medium">
                    {formatDays(s.used)}
                  </div>
                  <div className="col-span-2 text-right">
                    {formatDays(s.planned)}
                  </div>
                  <div className="col-span-1 text-right font-bold">
                    {s.deductsFromBalance ? formatDays(s.remaining) : '–'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
