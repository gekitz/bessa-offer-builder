// Brücke zwischen Viertl-Installationen und dem bestehenden Angebots-
// system. Ein Viertl-"Info-Mail mit Kosten" IST ein Angebot (ATrust-
// Signatur ± Hardware) — wir bauen/versenden es über den normalen
// Angebots-Builder (getrackt, PDF, Öffnungs-Tracking via Resend-Webhook)
// und verknüpfen es hier nur, um Sende-/Öffnungsstatus in der Viertl-
// Timeline zu spiegeln.

import { getOffer, listOffers } from '../../../lib/offerApi';
import type { ViertlLicense, ViertlStatus } from '../types';

export interface OfferSummary {
  id: string;
  status: string;                 // draft|sent|delivered|opened|accepted|rejected|…
  customerCompany: string | null;
  customerEmail: string | null;
  mesonicCustomerId: string | null;
  totalOnce: number | null;
  totalMonthly: number | null;
  sentAt: string | null;
  openedAt: string | null;
  createdAt: string;
}

export function toSummary(o: any): OfferSummary {
  return {
    id: o.id,
    status: o.status ?? 'draft',
    customerCompany: o.customer_company ?? null,
    customerEmail: o.customer_email ?? null,
    mesonicCustomerId: o.mesonic_customer_id != null ? String(o.mesonic_customer_id) : null,
    totalOnce: o.total_once != null ? Number(o.total_once) : null,
    totalMonthly: o.total_monthly != null ? Number(o.total_monthly) : null,
    sentAt: o.sent_at ?? null,
    openedAt: o.opened_at ?? null,
    createdAt: o.created_at,
  };
}

// Ist das Angebot schon draußen? → Viertl-Status mindestens 'mailed'.
const OUT_THE_DOOR = new Set(['sent', 'delivered', 'opened', 'accepted']);
export function offerImpliesStatus(offerStatus: string): Extract<ViertlStatus, 'offer_created' | 'mailed'> {
  return OUT_THE_DOOR.has(offerStatus) ? 'mailed' : 'offer_created';
}

// Reiner Matcher (unit-testbar): Angebote, die zu dieser Installation
// gehören — gleiche Mesonic-Kd.Nr. (starker Schlüssel) oder gleiche
// E-Mail (Fallback). Reihenfolge bleibt wie geliefert (updated_at desc).
export function matchOffers(offers: any[], license: Pick<ViertlLicense, 'mesonicKdnr' | 'email'>): OfferSummary[] {
  const kd = (license.mesonicKdnr ?? '').trim();
  const email = (license.email ?? '').trim().toLowerCase();
  return offers
    .filter((o) => {
      const byKd = kd && String(o.mesonic_customer_id ?? '').trim() === kd;
      const byEmail = email && String(o.customer_email ?? '').trim().toLowerCase() === email;
      return byKd || byEmail;
    })
    .map(toSummary);
}

export async function suggestOffersForLicense(
  license: Pick<ViertlLicense, 'mesonicKdnr' | 'email'>,
): Promise<OfferSummary[]> {
  const all = (await listOffers()) as any[];
  return matchOffers(all, license);
}

export async function getOfferSummary(offerId: string): Promise<OfferSummary | null> {
  try {
    return toSummary(await getOffer(offerId));
  } catch {
    return null;
  }
}
