import { describe, it, expect } from 'vitest';
import { fenstertage50pct } from '../fenstertage50pct';
import type { Employee, EmployeeRole, LeaveRequest, RuleContext } from '../../types';

function emp(id: string, name: string, standortId: number, active = true): Employee {
  return {
    id,
    code: id,
    name,
    standortId,
    weeklyHours: 38.5,
    employmentType: 'fulltime',
    active,
  };
}

function role(employeeId: string, abteilungId: number, standortId: number, kind: 'primary' | 'secondary' = 'primary'): EmployeeRole {
  return {
    id: `r-${employeeId}-${abteilungId}-${kind}`,
    employeeId,
    abteilungId,
    standortId,
    kind,
  };
}

// Wolfsberg Büro group of four — Waltraud (W), Sabine (Sa), Daniela (D), Birgit (B).
const w = emp('w', 'Waltraud', 2);
const sa = emp('sa', 'Sabine', 2);
const d = emp('d', 'Daniela', 2);
const b = emp('b', 'Birgit', 2);
// A different group: Klagenfurt Büro (Gudrun alone) — single-person group.
const g = emp('g', 'Gudrun', 1);

const baseCtx: RuleContext = {
  today: '2026-04-01',
  employees: [w, sa, d, b, g],
  roles: [
    role('w', 4, 2),
    role('sa', 4, 2),
    role('d', 4, 2),
    role('b', 4, 2),
    role('g', 4, 1),
  ],
  existingLeaves: [],
  coverageRules: [],
  blackouts: [],
  fenstertage: ['2026-05-15', '2026-06-05'],
};

function urlaub(employeeId: string, startDate: string, endDate: string, status: 'approved' | 'pending' = 'approved'): LeaveRequest {
  return {
    id: `lr-${employeeId}-${startDate}`,
    employeeId,
    leaveTypeCode: 'urlaub',
    startDate,
    endDate,
    status,
  };
}

describe('fenstertage50pct', () => {
  it('passes when the request range contains no Fenstertag', () => {
    const result = fenstertage50pct(
      urlaub(w.id, '2026-07-01', '2026-07-05'),
      baseCtx,
    );
    expect(result.warnings).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('passes silently when fenstertage list is empty', () => {
    const result = fenstertage50pct(
      urlaub(w.id, '2026-05-14', '2026-05-15'),
      { ...baseCtx, fenstertage: [] },
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('passes when the requester is the only one on leave on the Fenstertag', () => {
    // Group of 4, max = ceil(4*0.5) = 2. Just the requester = 1, fine.
    const result = fenstertage50pct(
      urlaub(w.id, '2026-05-14', '2026-05-15'),
      baseCtx,
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('passes when exactly 50% of the group are on leave (2 of 4)', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [urlaub(sa.id, '2026-05-15', '2026-05-15')],
    };
    // Now the requester (W) plus Sabine = 2 of 4. ceil(2) = 2, total <= max.
    const result = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-05-15'), ctx);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when more than 50% of the group are on leave (3 of 4)', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        urlaub(sa.id, '2026-05-15', '2026-05-15'),
        urlaub(d.id, '2026-05-15', '2026-05-15'),
      ],
    };
    const result = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-05-15'), ctx);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('2026-05-15');
    expect(result.warnings[0].message).toContain('3/4');
    // Always a warning, never a violation.
    expect(result.violations).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('mentions all triggered Fenstertage in one message', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        urlaub(sa.id, '2026-05-15', '2026-06-05'),
        urlaub(d.id, '2026-05-15', '2026-06-05'),
      ],
    };
    // Request covers both fenstertage at once.
    const result = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-06-06'), ctx);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('2026-05-15');
    expect(result.warnings[0].message).toContain('2026-06-05');
  });

  it('exempts Krankenstand from the rule', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        urlaub(sa.id, '2026-05-15', '2026-05-15'),
        urlaub(d.id, '2026-05-15', '2026-05-15'),
      ],
    };
    const result = fenstertage50pct(
      { ...urlaub(w.id, '2026-05-14', '2026-05-15'), leaveTypeCode: 'krankenstand' },
      ctx,
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('exempts single-person groups (50% of 1 ≠ no leave at all)', () => {
    // Gudrun alone in Klagenfurt Büro.
    const result = fenstertage50pct(urlaub(g.id, '2026-05-15', '2026-05-15'), baseCtx);
    expect(result.warnings).toHaveLength(0);
  });

  it('skips employees with no primary role', () => {
    // Strip W's primary role.
    const ctx = { ...baseCtx, roles: baseCtx.roles.filter((r) => r.employeeId !== 'w') };
    const result = fenstertage50pct(urlaub(w.id, '2026-05-15', '2026-05-15'), ctx);
    expect(result.warnings).toHaveLength(0);
  });

  it('only counts members of the same Standort+Abteilung group', () => {
    // Gudrun is in Standort 1 (Klagenfurt). Even with same Abteilung id (4),
    // her leave on the Fenstertag does not count toward Wolfsberg Büro.
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        urlaub(g.id, '2026-05-15', '2026-05-15'),
        urlaub(sa.id, '2026-05-15', '2026-05-15'),
        urlaub(d.id, '2026-05-15', '2026-05-15'),
      ],
    };
    // For a Klagenfurt request: Gudrun is alone (single-person group, exempt).
    const klagenfurtResult = fenstertage50pct(urlaub(g.id, '2026-05-15', '2026-05-15'), ctx);
    expect(klagenfurtResult.warnings).toHaveLength(0);

    // For W (Wolfsberg): only Sabine + Daniela count (not Gudrun). 3 of 4 → warn.
    const wolfsbergResult = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-05-15'), ctx);
    expect(wolfsbergResult.warnings).toHaveLength(1);
    expect(wolfsbergResult.warnings[0].message).toContain('3/4');
  });

  it('ignores rejected and cancelled leaves', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        { ...urlaub(sa.id, '2026-05-15', '2026-05-15'), status: 'rejected' as const },
        { ...urlaub(d.id, '2026-05-15', '2026-05-15'), status: 'cancelled' as const },
      ],
    };
    const result = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-05-15'), ctx);
    expect(result.warnings).toHaveLength(0);
  });

  it('counts pending leaves alongside approved ones', () => {
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        urlaub(sa.id, '2026-05-15', '2026-05-15', 'pending'),
        urlaub(d.id, '2026-05-15', '2026-05-15', 'approved'),
      ],
    };
    const result = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-05-15'), ctx);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('3/4');
  });

  it('does not double-count the request itself when editing an existing leave', () => {
    const existingId = 'lr-w-2026-05-15';
    const editing: LeaveRequest = {
      id: existingId,
      employeeId: w.id,
      leaveTypeCode: 'urlaub',
      startDate: '2026-05-14',
      endDate: '2026-05-15',
      status: 'approved',
    };
    const ctx = {
      ...baseCtx,
      existingLeaves: [
        { ...editing },
        urlaub(sa.id, '2026-05-15', '2026-05-15'),
      ],
    };
    // 2 of 4 (W editing + Sabine) — exactly 50%, no warn.
    const result = fenstertage50pct(editing, ctx);
    expect(result.warnings).toHaveLength(0);
  });

  it('excludes inactive employees from the group size denominator', () => {
    // Mark Birgit inactive — group shrinks to 3, ceil(1.5) = 2 max.
    const ctx = {
      ...baseCtx,
      employees: baseCtx.employees.map((e) => e.id === 'b' ? { ...e, active: false } : e),
      existingLeaves: [urlaub(sa.id, '2026-05-15', '2026-05-15')],
    };
    // Requester (W) + Sabine = 2, max = 2. No warn.
    const noWarn = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-05-15'), ctx);
    expect(noWarn.warnings).toHaveLength(0);

    // Add Daniela: 3 of 3 → warn.
    const ctxFull = {
      ...ctx,
      existingLeaves: [...ctx.existingLeaves, urlaub(d.id, '2026-05-15', '2026-05-15')],
    };
    const warn = fenstertage50pct(urlaub(w.id, '2026-05-14', '2026-05-15'), ctxFull);
    expect(warn.warnings).toHaveLength(1);
    expect(warn.warnings[0].message).toContain('3/3');
  });
});
