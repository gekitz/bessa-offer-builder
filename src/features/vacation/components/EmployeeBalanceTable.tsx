import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  listLeaveBalances,
  listLeaveRequests,
  listLeaveTypes,
  type LeaveBalance,
  type LeaveType,
} from '../api/vacationApi';
import { summarizeBalance } from '../lib/balance';
import type { IsoDate, LeaveRequest, LeaveTypeCode } from '../types';

interface EmployeeBalanceTableProps {
  employeeId: string;
  // Defaults to the current calendar year. Overridable for tests.
  year?: number;
  // Defaults to today (local). Overridable for tests.
  today?: IsoDate;
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
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

// Standalone per-type breakdown (Anspruch / Genommen / Geplant / Rest)
// for one employee + year. Used inline in the team roster's
// expand-on-info row. Self-contained: fetches its own data, renders
// loading / error / table states.
export default function EmployeeBalanceTable({ employeeId, year, today }: EmployeeBalanceTableProps) {
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
  }, [employeeId, resolvedYear]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 px-3 py-2" style={{ fontSize: 12 }}>
        <Loader2 size={12} className="animate-spin" />
        Stand wird geladen…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-red-700 bg-red-50 rounded-lg px-3 py-2" style={{ fontSize: 12 }}>
        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

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

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white" data-testid="employee-balance-table">
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
            data-testid={`employee-balance-row-${s.code}`}
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
  );
}
