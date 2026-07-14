// Microsoft-SSO -> employee/team matching. Internal @kitz.co.at logins
// don't follow a single convention, and we can't be sure which form
// Azure/Microsoft emits as the token's email claim:
//   * short form   <last_initial><first_initial>@   e.g. "kg"  (Georg Kitz)
//   * f.lastname   <first_initial>.<lastname>@       e.g. "g.kitz"
//   * firstname.lastname@                            e.g. "georg.kitz"
//   * irregular real mailboxes                       e.g. "kma" (Marcel Klein)
//
// Rather than depend on the stored email being in one particular form,
// findIdBySsoEmail() derives *every* legitimate local-part for a
// candidate from BOTH their stored email and their display name, then
// matches the SSO email's local-part against any of them (within the
// same domain). So whichever form MS sends — and whatever single form we
// happen to store in employees.email — the signed-in user still resolves.
//
// Candidates carry an id + email (+ optional name). Passing the name is
// what unlocks matching when the stored email is a short/irregular form.

export interface IdEmailLike {
  id: string;
  email?: string | null;
  name?: string | null;
}

// All local-parts (before the @) that could legitimately identify this
// candidate, given their stored email local-part and display name.
function candidateLocals(emailLocal: string, name: string | null | undefined): string[] {
  const out = new Set<string>();

  // The stored address itself (covers irregular real mailboxes like 'kma').
  out.add(emailLocal);
  // f.lastname stored -> derive the short SSO form (g.kitz -> kg).
  if (emailLocal.includes('.')) {
    const [a, b] = emailLocal.split('.');
    if (a && b) out.add(`${b[0]}${a[0]}`);
  }

  // Forms derivable from the display name ("Georg Kitz").
  const parts = (name ?? '').trim().toLowerCase().split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first && last) {
      out.add(`${first[0]}.${last}`); // g.kitz
      out.add(`${first}.${last}`);    // georg.kitz
      out.add(`${last[0]}${first[0]}`); // kg
    }
  }

  return [...out];
}

export function findIdBySsoEmail<T extends IdEmailLike>(
  ssoEmail: string | null | undefined,
  candidates: readonly T[],
): string | null {
  if (!ssoEmail) return null;
  const sso = ssoEmail.trim().toLowerCase();
  const [ssoLocal, ssoDomain] = sso.split('@');
  if (!ssoLocal || !ssoDomain) return null;

  for (const c of candidates) {
    const email = c.email?.trim().toLowerCase();
    if (!email) continue;
    const [emailLocal, emailDomain] = email.split('@');
    // Only ever match within the same domain — 'kg@example.com' must not
    // resolve to a kitz.co.at employee.
    if (!emailLocal || emailDomain !== ssoDomain) continue;
    if (candidateLocals(emailLocal, c.name).includes(ssoLocal)) return c.id;
  }
  return null;
}
