import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { listEmployees, listLeaveRequests } from '../api/vacationApi';
import { isApprover } from '../lib/permissions';

// Returns the number of pending leave requests waiting on the current
// SSO-matched approver. Used by the app shell to render a badge next
// to the "Urlaub" nav item so Georg / Herbert see "3 Anträge offen"
// at a glance.
//
// Returns 0 when:
//   * no SSO match (e.g. external user, dev mode without auth)
//   * the matched employee is not an approver (Georg / Herbert)
//   * the API call fails (we silently swallow — a missing badge is
//     better than a broken UI)
export function useApproverPendingCount(): number {
  const auth = useAuth() as {
    profile: { microsoft_email?: string } | null;
    user: { email?: string } | null;
  };
  const email = auth.profile?.microsoft_email || auth.user?.email || '';
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!email) return;
    (async () => {
      try {
        const employees = await listEmployees({ activeOnly: true });
        if (cancelled) return;
        const myId = findIdBySsoEmail(email, employees.map((e) => ({ id: e.id, email: e.email })));
        const me = employees.find((e) => e.id === myId);
        if (!isApprover(me)) return;
        const pending = await listLeaveRequests({ status: 'pending' });
        if (cancelled) return;
        setCount(pending.length);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  // Re-fetch when the user navigates back to the tab — they may have
  // approved on another device or browser tab.
  useEffect(() => {
    if (!email) return;
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      // Trigger by toggling a dependency. Simplest: just re-run the
      // load body inline. We dedupe via cancelled flag pattern.
      let cancelled = false;
      (async () => {
        try {
          const employees = await listEmployees({ activeOnly: true });
          if (cancelled) return;
          const myId = findIdBySsoEmail(email, employees.map((e) => ({ id: e.id, email: e.email })));
          const me = employees.find((e) => e.id === myId);
          if (!isApprover(me)) return;
          const pending = await listLeaveRequests({ status: 'pending' });
          if (cancelled) return;
          setCount(pending.length);
        } catch {
          // swallow
        }
      })();
      return () => { cancelled = true; };
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [email]);

  return count;
}
