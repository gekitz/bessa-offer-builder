// Workforce permissions / RBAC helpers.
//
// Per docs/workforce/CONTEXT.md section 1: "Approvers: Georg +
// Herbert. Either can approve, including from vacation. No deputy
// needed." We pin this to their employees.code values which are
// stable (the seed migration uses them as the natural key) — the
// UUID `id` would also work but rotates per environment.

const APPROVER_CODES = new Set(['gkitz', 'hkitz']);

export function isApprover(employee: { code?: string | null } | null | undefined): boolean {
  if (!employee?.code) return false;
  return APPROVER_CODES.has(employee.code);
}
