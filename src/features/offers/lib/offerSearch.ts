// Free-text search over offers for the offer list. Pure function so
// the page stays a thin shell and the matcher stays unit-testable.
//
// Matches on the fields a rep is most likely to remember after the
// fact: customer name/company/email, the internal briefing, the
// creator's name, and the Mesonic customer id. Case- and
// whitespace-insensitive substring match.
//
// Why a single string blob instead of per-field equality? Because
// reps remember messy hints — "the dental practice in Klagenfurt"
// hits a company word + an address tail; ANDing the tokens lets
// both lines of context narrow it down without forcing the rep to
// pick a column.

export interface SearchableOffer {
  id?: string | null;
  customer_name?: string | null;
  customer_company?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  creator_name?: string | null;
  briefing?: string | null;
  mesonic_customer_id?: string | number | null;
}

function haystack(o: SearchableOffer): string {
  return [
    o.customer_name,
    o.customer_company,
    o.customer_email,
    o.customer_phone,
    o.customer_address,
    o.creator_name,
    o.briefing,
    o.mesonic_customer_id != null ? String(o.mesonic_customer_id) : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// Tokenize the query on whitespace so multi-word searches act as AND
// rather than as a literal phrase. Keeps short-circuit on the empty
// case so an unfiltered list path is fast.
function tokenize(q: string): string[] {
  return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

export function offerMatchesSearch<T extends SearchableOffer>(o: T, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const hay = haystack(o);
  return tokens.every((t) => hay.includes(t));
}

export function filterOffersBySearch<T extends SearchableOffer>(offers: T[], query: string): T[] {
  if (!query.trim()) return offers;
  const tokens = tokenize(query);
  return offers.filter((o) => {
    const hay = haystack(o);
    return tokens.every((t) => hay.includes(t));
  });
}
