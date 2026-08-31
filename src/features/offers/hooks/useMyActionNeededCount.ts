import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import { listOffers, listOfferCreators } from '../../../lib/offerApi';
import { needsActionOffers } from '../lib/needsAction';

// Anzahl der Angebote DES eingeloggten Erstellers mit Handlungsbedarf
// (liegengebliebene Entwürfe + versendete ohne Aktivität). Speist den
// Badge auf der Angebote-Navigation. 0 bei fehlendem SSO-Match / Fehler —
// ein fehlender Badge ist besser als eine kaputte UI (wie useMyTicketCount).
export function useMyActionNeededCount(): number {
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
        const [offers, creators] = await Promise.all([listOffers(), listOfferCreators()]);
        if (cancelled) return;
        const myId = findIdBySsoEmail(email, creators);
        if (!myId) return;
        setCount(needsActionOffers(offers as any[], { creatorId: myId }).length);
      } catch {
        // swallow — see contract comment
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  return count;
}
