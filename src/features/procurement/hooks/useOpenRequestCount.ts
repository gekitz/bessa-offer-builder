import { useEffect, useState } from 'react';
import { countOpenRequests } from '../api/procurementApi';

// Returns the number of open (not-yet-ordered) hardware requests. Drives
// the badge on the Bestellungen nav entry so the purchaser sees pending
// demand at a glance. Returns 0 on any API error — a missing badge beats
// a broken shell. `enabled` lets callers skip the query (e.g. non-admins).
export function useOpenRequestCount(enabled = true): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const n = await countOpenRequests();
        if (!cancelled) setCount(n);
      } catch {
        // swallow — see contract comment
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return count;
}
