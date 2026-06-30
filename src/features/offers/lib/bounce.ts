// A bounced (undeliverable) email only needs action while the deal is still
// open. Once an offer is won (stage 'closed' / Abgeschlossen) or lost (stage
// 'lost' / Verloren), a stale bounce is noise — it must not be counted in the
// "X Angebote mit unzustellbarer E-Mail" warning or drive the loud row styling.
export interface BounceOffer {
  status?: string | null;
  stage?: string | null;
}

export function isActionableBounce(offer: BounceOffer): boolean {
  return offer.status === 'bounced' && offer.stage !== 'closed' && offer.stage !== 'lost';
}
