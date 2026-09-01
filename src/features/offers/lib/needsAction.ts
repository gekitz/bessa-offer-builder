// „Aktion nötig" — Angebote, bei denen der Ersteller etwas tun sollte.
// Zwei Fälle (Schwellen abgestimmt: Entwurf > 3 Tage, gesendet > 7 Tage):
//   • draft_unsent   — Entwurf, nie versendet, älter als DRAFT_STALE_DAYS
//   • sent_no_action — versendet, seit SENT_STALE_DAYS keine Aktivität und
//                      keine Entscheidung (weiterhin stage 'offer_sent')
//
// Rein & testbar; dieselbe Logik nutzt der In-App-Badge und (gespiegelt)
// der tägliche Ersteller-Digest in der Edge-Funktion.

export const DRAFT_STALE_DAYS = 3;
export const SENT_STALE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActionOffer {
  id: string;
  status?: string | null;   // 'draft' = nie versendet
  stage?: string | null;    // 'offer_sent' = versendet, offen
  created_at?: string | null;
  sent_at?: string | null;
  last_activity_at?: string | null;
  creator_id?: string | null;
}

export type ActionReason = 'draft_unsent' | 'sent_no_action';

// Entschiedene/erledigte Angebote — kein Handlungsbedarf, egal welcher
// stage. (accepted/rejected setzen zwar den status, aber nicht immer den
// stage weg von 'offer_sent'.)
const DECIDED_STATUSES = new Set(['accepted', 'rejected', 'expired']);

export function offerActionReason(o: ActionOffer, now: Date = new Date()): ActionReason | null {
  const nowMs = now.getTime();

  if (o.status && DECIDED_STATUSES.has(o.status)) return null;

  // Entwurf, nie versendet, zu lange liegengeblieben.
  if (o.status === 'draft' && o.created_at) {
    if (nowMs - new Date(o.created_at).getTime() >= DRAFT_STALE_DAYS * DAY_MS) {
      return 'draft_unsent';
    }
  }

  // Versendet, seit einer Woche nichts passiert (keine Aktivität geloggt).
  if (o.stage === 'offer_sent' && o.sent_at) {
    if (nowMs - new Date(o.sent_at).getTime() >= SENT_STALE_DAYS * DAY_MS) {
      const lastActMs = o.last_activity_at ? new Date(o.last_activity_at).getTime() : 0;
      if (nowMs - lastActMs >= SENT_STALE_DAYS * DAY_MS) {
        return 'sent_no_action';
      }
    }
  }

  return null;
}

export function offerNeedsAction(o: ActionOffer, now: Date = new Date()): boolean {
  return offerActionReason(o, now) !== null;
}

// Angebote mit Handlungsbedarf, optional auf einen Ersteller gefiltert.
export function needsActionOffers<T extends ActionOffer>(
  offers: T[],
  opts: { creatorId?: string | null; now?: Date } = {},
): T[] {
  const now = opts.now ?? new Date();
  return offers.filter((o) => {
    if (opts.creatorId && o.creator_id !== opts.creatorId) return false;
    return offerNeedsAction(o, now);
  });
}
