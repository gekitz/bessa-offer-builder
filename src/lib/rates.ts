// Single source of truth for the standard KM-Geld travel rate
// (service_rates code KM_PLUS_WEGZEIT, "Wegzeit separat").
//
// Everything rendered client-side (e.g. the offer-terms text) MUST derive its
// km figure from here — never hardcode the number again.
//
// Ticket billing reads the *live* rate from the service_rates DB table
// (src/features/tickets/lib/billing.ts) so it can be repriced without a deploy.
// This constant is the client-side mirror of that row and must move in lockstep
// with it. When the rate changes, update BOTH:
//   1. KM_RATE_EUR_PER_KM below
//   2. a service_rates migration: UPDATE service_rates SET rate = <new>
//        WHERE code = 'KM_PLUS_WEGZEIT';
export const KM_RATE_EUR_PER_KM = 0.75;

/** German-formatted rate, e.g. "0,75 €/km". */
export function formatKmRate(): string {
  return `${KM_RATE_EUR_PER_KM.toFixed(2).replace('.', ',')} €/km`;
}
