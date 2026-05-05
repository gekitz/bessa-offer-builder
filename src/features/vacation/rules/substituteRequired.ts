import type { LeaveRequest, RuleContext, RuleResult } from '../types';

// Soft warning when an employee has substitutes configured but the
// request leaves the substitute field empty. Per Konzept v4: every
// planned absence (Urlaub, Zeitausgleich) should name a Vertreter so
// the team knows who to ask while the requester is out. Krankenstand
// is exempt — you don't choose to be sick — and Schule / Schulung
// rarely need a substitute (they're trainings, not coverage gaps).
//
// Rule passes silently when:
//   * leave type is not Urlaub or Zeitausgleich
//   * a substitute was already chosen
//   * the employee has no substitutes configured (nothing to suggest)
//   * substitutes are not loaded in the context (e.g. tests)
export function substituteRequired(request: LeaveRequest, ctx: RuleContext): RuleResult {
  if (request.leaveTypeCode !== 'urlaub' && request.leaveTypeCode !== 'zeitausgleich') {
    return { ok: true, violations: [], warnings: [] };
  }
  if (request.substituteId) {
    return { ok: true, violations: [], warnings: [] };
  }
  const subs = ctx.substitutes ?? [];
  const ownSubs = subs.filter((s) => s.employeeId === request.employeeId);
  if (ownSubs.length === 0) {
    return { ok: true, violations: [], warnings: [] };
  }
  return {
    ok: true,
    violations: [],
    warnings: [
      {
        rule: 'substituteRequired',
        message:
          'Keine Vertretung gewählt. Du kannst weiter abschicken — bitte wähle die Vertretung idealerweise vorher aus.',
      },
    ],
  };
}
