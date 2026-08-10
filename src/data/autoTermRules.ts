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
    id: 'travel-billing',
    condition: () => true,
    text: 'Arbeitszeit, Wegzeit und KM-Geld (à 0,79 €/km) werden nach tatsächlichem Aufwand verrechnet.',
  },
  {
    id: 'network-cabling',
    condition: (cart) => Object.keys(cart).some((id) => id.startsWith('unify-')),
    text: 'Kabel müssen vom Kunden eigenständig verlegt werden',
  },
];

// Brother printers are stock items, not a PoS install, so their delivery and
// payment terms are rep-chosen rather than the fixed PoS defaults above.
export type Lieferung = 'lagernd' | 'ruecksprache';

export const LIEFERUNG_OPTIONS: ReadonlyArray<{ value: Lieferung; label: string }> = [
  { value: 'lagernd', label: 'lagernd' },
  { value: 'ruecksprache', label: 'nach Rücksprache' },
];

export const DEFAULT_LIEFERUNG: Lieferung = 'lagernd';
export const DEFAULT_ZAHLUNGSZIEL = 'netto Kassa';

export function lieferungLabel(lieferung: Lieferung | undefined): string {
  return (LIEFERUNG_OPTIONS.find((o) => o.value === lieferung) ?? LIEFERUNG_OPTIONS[0]).label;
}

export interface AutoTermOptions {
  offerType?: string;
  lieferung?: Lieferung;
  zahlungsziel?: string;
}

export function computeAutoTerms(cart: CartLike, opts: AutoTermOptions = {}): string[] {
  const active = AUTO_TERM_RULES.filter((r) => r.condition(cart));
  // Brother offers override the two fixed lines with the rep's picks; every
  // other offer type keeps the PoS defaults verbatim.
  if (opts.offerType !== 'brother') return active.map((r) => r.text);
  const zahlungsziel = opts.zahlungsziel?.trim() || DEFAULT_ZAHLUNGSZIEL;
  return active.map((r) => {
    if (r.id === 'delivery-time') return `Lieferzeit: ${lieferungLabel(opts.lieferung)}`;
    if (r.id === 'payment-term') return `Zahlungsziel: ${zahlungsziel}`;
    return r.text;
  });
}
