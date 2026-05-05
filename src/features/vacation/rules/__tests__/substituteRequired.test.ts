import { describe, it, expect } from 'vitest';
import { substituteRequired } from '../substituteRequired';
import type { Employee, LeaveRequest, RuleContext } from '../../types';

const stefan: Employee = {
  id: 'sbauer-id', code: 'sbauer', name: 'Stefan Bauer',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const mario: Employee = {
  id: 'mgraf-id', code: 'mgraf', name: 'Mario Graf',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    today: '2026-05-04',
    employees: [stefan, mario],
    roles: [],
    existingLeaves: [],
    coverageRules: [],
    blackouts: [],
    substitutes: [
      { employeeId: stefan.id, substituteEmployeeId: mario.id, priority: 1 },
    ],
    ...overrides,
  };
}

function urlaub(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    employeeId: stefan.id,
    leaveTypeCode: 'urlaub',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    ...overrides,
  };
}

describe('substituteRequired', () => {
  it('warns when an Urlaub request omits the substitute and the employee has one configured', () => {
    const result = substituteRequired(urlaub(), ctx());
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].rule).toBe('substituteRequired');
    expect(result.warnings[0].message).toMatch(/Vertretung/);
    // Always a soft warning — never blocks.
    expect(result.violations).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('passes when the request includes a substituteId', () => {
    const result = substituteRequired(urlaub({ substituteId: mario.id }), ctx());
    expect(result.warnings).toHaveLength(0);
  });

  it('passes silently when the employee has no substitutes configured', () => {
    const result = substituteRequired(urlaub(), ctx({ substitutes: [] }));
    expect(result.warnings).toHaveLength(0);
  });

  it('passes silently when ctx.substitutes is undefined (e.g. tests not loading it)', () => {
    const result = substituteRequired(urlaub(), ctx({ substitutes: undefined }));
    expect(result.warnings).toHaveLength(0);
  });

  it('exempts Krankenstand from the rule', () => {
    const result = substituteRequired(urlaub({ leaveTypeCode: 'krankenstand' }), ctx());
    expect(result.warnings).toHaveLength(0);
  });

  it('exempts Schule, Schulung, Pflege, Sonderurlaub from the rule', () => {
    for (const code of ['schule', 'schulung', 'pflege', 'sonderurlaub'] as const) {
      const result = substituteRequired(urlaub({ leaveTypeCode: code }), ctx());
      expect(result.warnings).toHaveLength(0);
    }
  });

  it('also fires for Zeitausgleich (planned absences need coverage too)', () => {
    const result = substituteRequired(urlaub({ leaveTypeCode: 'zeitausgleich' }), ctx());
    expect(result.warnings).toHaveLength(1);
  });

  it('only considers the requester’s own substitutes (not the team-wide list)', () => {
    // Mario has no substitutes configured; Stefan does. A Mario request
    // with no substitute should pass even though Stefan's mappings exist.
    const result = substituteRequired(
      urlaub({ employeeId: mario.id }),
      ctx(),
    );
    expect(result.warnings).toHaveLength(0);
  });
});
