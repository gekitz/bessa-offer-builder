// Pure aggregation for the pool × status overview matrix. Keeps the
// counting out of the render so it stays unit-testable.

import type { TicketStatus } from '../types';

// The four active statuses the board + matrix show (cancelled is omitted).
export const MATRIX_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting', 'closed'];

export interface CountRow {
  status: TicketStatus;
  poolAbteilungId: number | null;
}

export interface MatrixRow {
  poolId: number | 'none';
  poolName: string;
  counts: Record<TicketStatus, number>;
  total: number;
}

export interface Matrix {
  rows: MatrixRow[];
  totals: Record<TicketStatus, number>;
  grandTotal: number;
}

function emptyCounts(): Record<TicketStatus, number> {
  return { open: 0, in_progress: 0, waiting: 0, closed: 0, cancelled: 0 };
}

// Build the matrix from raw (status, pool) rows. Only pools with at
// least one ticket in the four matrix statuses get a row; a lane for
// unrouted tickets ('none') is appended when present. Pool order follows
// the given `pools` list.
export function buildMatrix(
  rows: CountRow[],
  pools: Array<{ id: number; name: string }>,
): Matrix {
  const byPool = new Map<number | 'none', Record<TicketStatus, number>>();
  const totals = emptyCounts();
  let grandTotal = 0;

  for (const r of rows) {
    if (!MATRIX_STATUSES.includes(r.status)) continue; // skip cancelled etc.
    const key = r.poolAbteilungId ?? 'none';
    const c = byPool.get(key) ?? emptyCounts();
    c[r.status] += 1;
    byPool.set(key, c);
    totals[r.status] += 1;
    grandTotal += 1;
  }

  const order: Array<{ id: number | 'none'; name: string }> = [
    ...pools.map((p) => ({ id: p.id as number | 'none', name: p.name })),
    { id: 'none', name: 'Ohne Zuordnung' },
  ];

  const matrixRows: MatrixRow[] = [];
  for (const p of order) {
    const counts = byPool.get(p.id);
    if (!counts) continue; // no tickets for this pool → no row
    const total = MATRIX_STATUSES.reduce((s, st) => s + counts[st], 0);
    if (total === 0) continue;
    matrixRows.push({ poolId: p.id, poolName: p.name, counts, total });
  }

  return { rows: matrixRows, totals, grandTotal };
}
