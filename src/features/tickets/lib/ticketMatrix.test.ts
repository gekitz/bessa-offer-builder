import { describe, expect, it } from 'vitest';
import { buildMatrix, type CountRow } from './ticketMatrix';

const POOLS = [
  { id: 2, name: 'IT' },
  { id: 1, name: 'Kassen' },
];

describe('buildMatrix', () => {
  it('counts by pool and status, following pool order', () => {
    const rows: CountRow[] = [
      { status: 'open', poolAbteilungId: 2 },
      { status: 'open', poolAbteilungId: 2 },
      { status: 'closed', poolAbteilungId: 2 },
      { status: 'in_progress', poolAbteilungId: 1 },
    ];
    const m = buildMatrix(rows, POOLS);
    expect(m.rows.map((r) => r.poolName)).toEqual(['IT', 'Kassen']);
    expect(m.rows[0].counts.open).toBe(2);
    expect(m.rows[0].counts.closed).toBe(1);
    expect(m.rows[0].total).toBe(3);
    expect(m.rows[1].counts.in_progress).toBe(1);
    expect(m.totals.open).toBe(2);
    expect(m.grandTotal).toBe(4);
  });

  it('appends an Ohne Zuordnung row for unrouted tickets', () => {
    const rows: CountRow[] = [
      { status: 'open', poolAbteilungId: null },
      { status: 'open', poolAbteilungId: 2 },
    ];
    const m = buildMatrix(rows, POOLS);
    expect(m.rows.map((r) => r.poolName)).toEqual(['IT', 'Ohne Zuordnung']);
    expect(m.rows[1].poolId).toBe('none');
    expect(m.rows[1].counts.open).toBe(1);
  });

  it('omits pools with no tickets', () => {
    const rows: CountRow[] = [{ status: 'open', poolAbteilungId: 2 }];
    const m = buildMatrix(rows, POOLS);
    expect(m.rows.map((r) => r.poolName)).toEqual(['IT']); // no Kassen row
  });

  it('ignores cancelled tickets', () => {
    const rows: CountRow[] = [
      { status: 'cancelled', poolAbteilungId: 2 },
      { status: 'open', poolAbteilungId: 2 },
    ];
    const m = buildMatrix(rows, POOLS);
    expect(m.rows[0].total).toBe(1);
    expect(m.grandTotal).toBe(1);
  });

  it('returns no rows when there are no tickets', () => {
    const m = buildMatrix([], POOLS);
    expect(m.rows).toEqual([]);
    expect(m.grandTotal).toBe(0);
  });
});
