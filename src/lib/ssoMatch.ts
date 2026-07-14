// Microsoft-SSO -> employee/team matching. Internal email conventions
// at @kitz.co.at use two formats:
//   * Authoritative records (employees.email):
//       <first_initial>.<lastname>@kitz.co.at      e.g. "g.kitz"
//   * SSO logins:
//       <last_initial><first_initial>@kitz.co.at   e.g. "kg"
//
// findIdBySsoEmail() takes the SSO email and a list of candidate
// records (each with an id + email) and returns the matching id, or
// null when nothing fits. Candidates can be team members, employee
// rows, or anything else with the right shape — this keeps the
// helper agnostic of the domain entity.

export interface IdEmailLike {
  id: string;
  email?: string | null;
}

export function findIdBySsoEmail<T extends IdEmailLike>(
  ssoEmail: string | null | undefined,
  candidates: readonly T[],
): string | null {
  if (!ssoEmail) return null;
  const sso = ssoEmail.toLowerCase();

  // 1. Exact match.
  const exact = candidates.find((c) => c.email?.toLowerCase() === sso);
  if (exact) return exact.id;

  // 2. Heuristic: derive the SSO variant from each candidate's
  // canonical "f.lastname" email and compare to the SSO local part.
  const [ssoLocal, ssoDomain] = sso.split('@');
  if (!ssoLocal || !ssoDomain) return null;

  const derived = candidates.find((c) => {
    if (!c.email) return false;
    const [local, domain] = c.email.toLowerCase().split('@');
    if (!local || domain !== ssoDomain) return false;
    const dotIdx = local.indexOf('.');
    if (dotIdx < 1) return false;
    const firstInitial = local.charAt(0);             // 'g'
    const lastName = local.substring(dotIdx + 1);     // 'kitz'
    const ssoVariant = lastName.charAt(0) + firstInitial; // 'kg'
    return ssoLocal === ssoVariant;
  });
  return derived?.id ?? null;
}
