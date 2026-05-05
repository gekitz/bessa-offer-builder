export type CartLike = Record<string, unknown>;

export interface AutoTermRule {
  id: string;
  condition: (cart: CartLike) => boolean;
  text: string;
}

export const AUTO_TERM_RULES: readonly AutoTermRule[] = [
  {
    id: 'delivery-time',
    condition: () => true,
    text: 'Lieferzeit: 2 Wochen',
  },
  {
    id: 'payment-term',
    condition: () => true,
    text: 'Zahlungsziel: 10 Tage netto Kassa',
  },
  {
    id: 'network-cabling',
    condition: (cart) => Object.keys(cart).some((id) => id.startsWith('unify-')),
    text: 'Kabel müssen vom Kunden eigenständig verlegt werden',
  },
];

export function computeAutoTerms(cart: CartLike): string[] {
  return AUTO_TERM_RULES.filter((r) => r.condition(cart)).map((r) => r.text);
}
