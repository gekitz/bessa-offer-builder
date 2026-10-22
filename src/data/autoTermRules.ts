import { formatKmRate } from '../lib/rates';
import { RENTAL_LINE_ID } from '../lib/rentalOffer';

export type CartLike = Record<string, unknown>;

export interface AutoTermRule {
  id: string;
  condition: (cart: CartLike) => boolean;
  text: string;
}

// Standard (PoS install) defaults for the two rep-editable Bedingungen lines.
// Brother is a stock item, so it defaults to different values (see below).
export const STANDARD_LIEFERZEIT = '2 Wochen';
export const STANDARD_ZAHLUNGSZIEL = '10 Tage netto Kassa';

export const AUTO_TERM_RULES: readonly AutoTermRule[] = [
  {
    id: 'delivery-time',
    condition: () => true,
    text: `Lieferzeit: ${STANDARD_LIEFERZEIT}`,
  },
  {
    id: 'payment-term',
    condition: () => true,
    text: `Zahlungsziel: ${STANDARD_ZAHLUNGSZIEL}`,
  },
  {
    id: 'travel-billing',
    condition: () => true,
    text: `Arbeitszeit, Wegzeit und KM-Geld (à ${formatKmRate()}) werden nach tatsächlichem Aufwand verrechnet.`,
  },
  {
    id: 'network-cabling',
    condition: (cart) => Object.keys(cart).some((id) => id.startsWith('unify-')),
    text: 'Kabel müssen vom Kunden eigenständig verlegt werden',
  },
  {
    id: 'rental-cleaning',
    condition: (cart) => RENTAL_LINE_ID in cart,
    text:
      'Die Geräte sind vollständig inkl Netzteilen gesäubert zu retounieren. ' +
      'Sollten wir nachträglich eine Reinigung durchführen müssen wird die Reinigungspauschale verrechnet.',
  },
];

// Brother printers are stock items, so their delivery/payment terms default
// differently than a PoS install. The old pill values ('lagernd' /
// 'ruecksprache') still map to their labels; any other string is free text.
export type Lieferung = 'lagernd' | 'ruecksprache';

export const LIEFERUNG_OPTIONS: ReadonlyArray<{ value: Lieferung; label: string }> = [
  { value: 'lagernd', label: 'lagernd' },
  { value: 'ruecksprache', label: 'nach Rücksprache' },
];

export const DEFAULT_LIEFERUNG: Lieferung = 'lagernd';
export const DEFAULT_ZAHLUNGSZIEL = 'netto Kassa';

// Resolves a stored Lieferzeit to its display text: the two legacy Brother enum
// values map to their labels, everything else (free text like "2 Wochen") is
// passed through verbatim.
export function lieferungLabel(lieferung: string | undefined): string {
  const value = lieferung || DEFAULT_LIEFERUNG;
  const match = LIEFERUNG_OPTIONS.find((o) => o.value === value);
  return match ? match.label : value;
}

export interface AutoTermOptions {
  offerType?: string;
  lieferung?: string;
  zahlungsziel?: string;
}

export function computeAutoTerms(cart: CartLike, opts: AutoTermOptions = {}): string[] {
  const active = AUTO_TERM_RULES.filter((r) => r.condition(cart));
  const isBrother = opts.offerType === 'brother';
  // Lieferzeit and Zahlungsziel are rep-editable on every offer. A blank value
  // falls back to the offer-type default: Brother → "lagernd" / "netto Kassa",
  // every other offer → "2 Wochen" / "10 Tage netto Kassa".
  const lieferung = opts.lieferung?.toString().trim()
    ? lieferungLabel(opts.lieferung)
    : (isBrother ? lieferungLabel(DEFAULT_LIEFERUNG) : STANDARD_LIEFERZEIT);
  const zahlungsziel = opts.zahlungsziel?.trim()
    || (isBrother ? DEFAULT_ZAHLUNGSZIEL : STANDARD_ZAHLUNGSZIEL);
  return active.map((r) => {
    if (r.id === 'delivery-time') return `Lieferzeit: ${lieferung}`;
    if (r.id === 'payment-term') return `Zahlungsziel: ${zahlungsziel}`;
    return r.text;
  });
}
