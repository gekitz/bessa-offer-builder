import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { listEmployees } from '../../vacation/api/vacationApi';
import { listTickets } from '../api/ticketApi';

// Returns the number of open/in_progress tickets assigned to the
// currently-signed-in employee. Drives the badge on the Tickets nav
// entry. Returns 0 when no SSO match or on any API error — a missing
// badge is always preferable to a broken UI.
export function useMyTicketCount(): number {
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
        const myId = findIdBySsoEmail(email, employees.map((e) => ({ id: e.id, email: e.email, name: e.name })));
        if (!myId) return;
        const me = employees.find((e) => e.id === myId);
        if (!me) return;
        const tickets = await listTickets({
          status: ['open', 'in_progress'],
          assignedTo: me.id,
        });
        if (cancelled) return;
        setCount(tickets.length);
      } catch {
        // swallow — see contract comment
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  return count;
}
