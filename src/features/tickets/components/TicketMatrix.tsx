import { useMemo } from 'react';
import { buildMatrix, MATRIX_STATUSES, type CountRow } from '../lib/ticketMatrix';
import type { TicketStatus } from '../types';

interface TicketMatrixProps {
  counts: CountRow[];
  pools: Array<{ id: number; name: string }>;
  // Drill-down: jump the list to a pool (+ optional status).
  onSelect: (poolId: number | 'none', status: TicketStatus | 'all') => void;
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  review: 'In Prüfung',
  closed: 'Geschlossen',
  cancelled: 'Abgesagt',
};

// A cell's emphasis: open tickets are the actionable signal, so a
// non-zero "Offen" count is highlighted; zeros fade back.
function cellClass(status: TicketStatus, n: number): string {
  if (n === 0) return 'text-slate-300';
  if (status === 'open') return 'text-red-600 font-semibold';
  return 'text-slate-700';
}

export default function TicketMatrix({ counts, pools, onSelect }: TicketMatrixProps) {
  const matrix = useMemo(() => buildMatrix(counts, pools), [counts, pools]);

  if (matrix.rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" data-testid="ticket-matrix">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="text-left font-medium px-3 py-2">Pool</th>
            {MATRIX_STATUSES.map((s) => (
              <th key={s} className="text-right font-medium px-3 py-2 whitespace-nowrap">
                {STATUS_LABEL[s]}
              </th>
            ))}
            <th className="text-right font-semibold px-3 py-2">Σ</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={String(row.poolId)} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(row.poolId, 'all')}
                  className="font-medium text-slate-700 hover:text-red-600"
                >
                  {row.poolName}
                </button>
              </td>
              {MATRIX_STATUSES.map((s) => (
                <td key={s} className="text-right px-3 py-2 tabular-nums">
                  <button
                    type="button"
                    onClick={() => onSelect(row.poolId, s)}
                    disabled={row.counts[s] === 0}
                    className={`${cellClass(s, row.counts[s])} ${
                      row.counts[s] > 0 ? 'hover:underline' : 'cursor-default'
                    }`}
                  >
                    {row.counts[s]}
                  </button>
                </td>
              ))}
              <td className="text-right px-3 py-2 font-semibold text-slate-700 tabular-nums">{row.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50/60 text-xs">
            <td className="px-3 py-2 font-semibold text-slate-600">Gesamt</td>
            {MATRIX_STATUSES.map((s) => (
              <td key={s} className="text-right px-3 py-2 font-semibold text-slate-600 tabular-nums">
                {matrix.totals[s]}
              </td>
            ))}
            <td className="text-right px-3 py-2 font-bold text-slate-700 tabular-nums">{matrix.grandTotal}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
