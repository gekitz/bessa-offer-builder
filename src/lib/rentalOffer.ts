import { ALL } from '../features/offers/data/catalogs';
import { price } from './pricing';
import type { TierKey } from '../data/tiers';

// POS Leihstellung (rental) calculator.
//
// A Leihstellung is priced from a single chosen timespan plus per-line
// quantities, mirroring the "Leihstellung" spreadsheet. Three cost buckets
// each behave differently:
//
//   1. Hardware    — pooled cost basis (Einstand), then divided by a
//                    per-timespan break-even factor. The break-even is how
//                    many rentals recoup the hardware, so each rental charges
//                    Σ(qty·Einstand) / breakEven.
//   2. Dienstleistung — fixed per-unit prices, independent of the timespan.
//   3. Software    — the bessa Kassa packages. We DON'T hard-code these
//                    prices: each timespan maps onto an existing bessa tier
//                    and the monthly tier price is multiplied by the number
//                    of months (the 1–3 Tage case uses the flat event price,
//                    i.e. months = 1). When a bessa price changes, the rental
//                    price follows automatically.
//
//   Netto  = hardwareRental + servicesSum + softwareSum
//   Brutto = Netto × 1.2 (20 % USt)

export const RENTAL_VAT = 0.2;

export type RentalTermKey = '1-3d' | '2mo' | '6mo';

export interface RentalTerm {
  key: RentalTermKey;
  label: string;
  /** bessa tier used to price the software packages for this timespan. */
  tier: TierKey;
  /** Multiplier applied to the monthly tier price (1 for the flat event tier). */
  months: number;
  /** Pooled hardware cost is divided by this to get the rental charge. */
  breakEven: number;
}

export const RENTAL_TERMS: readonly RentalTerm[] = [
  { key: '1-3d', label: '1–3 Tage', tier: 'event', months: 1, breakEven: 5 },
  { key: '2mo', label: '2 Monate', tier: '2mo', months: 2, breakEven: 2 },
  { key: '6mo', label: '6 Monate', tier: '6mo', months: 6, breakEven: 1 },
] as const;

export function rentalTerm(key: RentalTermKey): RentalTerm {
  return RENTAL_TERMS.find((t) => t.key === key) ?? RENTAL_TERMS[0]!;
}

export interface RentalHardware {
  id: string;
  name: string;
  /** Cost basis (Einstand) per unit; pooled across the whole rental. */
  einstand: number;
}

export const RENTAL_HARDWARE: readonly RentalHardware[] = [
  { id: 'hauptkasse', name: 'Hauptkasse', einstand: 470 },
  { id: 'nebenkassen', name: 'Nebenkassen', einstand: 470 },
  { id: 'standalone-mobile', name: 'Standalone Mobile Kasse', einstand: 259 },
  { id: 'mobile-geraete', name: 'Mobile Geräte', einstand: 216 },
  { id: 'bondrucker', name: 'Bondrucker', einstand: 138 },
  { id: 'guerteldrucker', name: 'Gürteldrucker', einstand: 250 },
  { id: 'udr', name: 'UDR', einstand: 182 },
  { id: 'u6', name: 'U6', einstand: 164 },
  { id: 'kuechenmonitor', name: 'Küchenmonitor', einstand: 1190 },
] as const;

export interface RentalService {
  id: string;
  name: string;
  /** Fixed net price per unit, independent of the timespan. */
  price: number;
}

export const RENTAL_SERVICES: readonly RentalService[] = [
  { id: 'fiskalisierung', name: 'Fiskalisierung pro Hauptkasse', price: 190 },
  { id: 'arbeitszeit', name: 'Arbeitszeit', price: 120 },
] as const;

// The rental software list is the bessa Kassa catalog, referenced by id so the
// prices (and names) stay in sync with the source catalog. Order matches the
// spreadsheet. Comments show code + spreadsheet label.
export const RENTAL_SOFTWARE_IDS: readonly string[] = [
  'a4e9ba39-ee22-41b9-8f94-936ee3ce3de3', // 120 Kleiner Gastrobetrieb  (Gastro)
  '3942f638-1abb-4be9-85a5-d3bf442aa3d8', // 100 Mobile Kassa           (Mobile Kasse)
  'eceb4278-06cc-4fe5-9413-d41ae999166c', // 042 Nebenterminal          (Funkterminal)
  '65e7e1a8-23b3-444f-8b18-c5ca7312cf28', // 040 Anbindung Kartenzahlungsterminal (Kreditkartemodul)
  '0824405f-8780-4371-919b-5cee2c6efb07', // 043 Bestellmonitor         (Bestellmonitor)
] as const;

export interface RentalState {
  term: RentalTermKey;
  /** hardware id → quantity */
  hardware: Record<string, number>;
  /** service id → quantity */
  services: Record<string, number>;
  /** bessa item id → quantity */
  software: Record<string, number>;
}

export function emptyRentalState(): RentalState {
  return { term: '6mo', hardware: {}, services: {}, software: {} };
}

export interface RentalLine {
  id: string;
  name: string;
  qty: number;
  /** Per-unit contribution for this timespan (Einstand for hardware). */
  unitPrice: number;
  lineTotal: number;
  group: 'hardware' | 'service' | 'software';
}

export interface RentalResult {
  term: RentalTerm;
  hardwareLines: RentalLine[];
  serviceLines: RentalLine[];
  softwareLines: RentalLine[];
  /** Σ(qty · Einstand) — pooled hardware cost basis. */
  hardwareSum: number;
  /** hardwareSum / breakEven — the charged hardware rental. */
  hardwareRental: number;
  servicesSum: number;
  softwareSum: number;
  netto: number;
  brutto: number;
}

// Stable id for the single synthetic cart line a Leihstellung produces. It is
// deliberately NOT a catalog id, so the offer pipeline treats it as a custom
// once-item (persisted via customItems) and the whole Save/Send/Print/PDF path
// works unchanged. The stable id means re-editing the calculator upserts the
// same line instead of adding duplicates.
export const RENTAL_LINE_ID = 'leihstellung-pos';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The software unit rental price for one bessa item at a given timespan. */
export function softwareUnitPrice(itemId: string, term: RentalTerm): number {
  const item = ALL[itemId];
  const monthly = price(item, term.tier, undefined);
  if (monthly == null) return 0;
  return round2(monthly * term.months);
}

export function buildRentalOffer(state: RentalState): RentalResult {
  const term = rentalTerm(state.term);

  const hardwareLines: RentalLine[] = RENTAL_HARDWARE.map((hw) => {
    const qty = state.hardware[hw.id] || 0;
    return {
      id: hw.id,
      name: hw.name,
      qty,
      unitPrice: hw.einstand,
      lineTotal: round2(qty * hw.einstand),
      group: 'hardware' as const,
    };
  }).filter((l) => l.qty > 0);

  const serviceLines: RentalLine[] = RENTAL_SERVICES.map((sv) => {
    const qty = state.services[sv.id] || 0;
    return {
      id: sv.id,
      name: sv.name,
      qty,
      unitPrice: sv.price,
      lineTotal: round2(qty * sv.price),
      group: 'service' as const,
    };
  }).filter((l) => l.qty > 0);

  const softwareLines: RentalLine[] = RENTAL_SOFTWARE_IDS.map((id) => {
    const item = ALL[id];
    const qty = state.software[id] || 0;
    const unit = softwareUnitPrice(id, term);
    return {
      id,
      name: item?.name ?? id,
      qty,
      unitPrice: unit,
      lineTotal: round2(qty * unit),
      group: 'software' as const,
    };
  }).filter((l) => l.qty > 0);

  const hardwareSum = round2(hardwareLines.reduce((s, l) => s + l.lineTotal, 0));
  const hardwareRental = round2(hardwareSum / term.breakEven);
  const servicesSum = round2(serviceLines.reduce((s, l) => s + l.lineTotal, 0));
  const softwareSum = round2(softwareLines.reduce((s, l) => s + l.lineTotal, 0));

  const netto = round2(hardwareRental + servicesSum + softwareSum);
  const brutto = round2(netto * (1 + RENTAL_VAT));

  return {
    term,
    hardwareLines,
    serviceLines,
    softwareLines,
    hardwareSum,
    hardwareRental,
    servicesSum,
    softwareSum,
    netto,
    brutto,
  };
}

export interface RentalLineFields {
  id: string;
  name: string;
  /** Net price for the whole rental period — the once-off charge. */
  price: number;
  /** Multi-line article description enumerating everything the customer gets. */
  description: string;
}

/**
 * Collapse a rental into the single custom cart line shown on the offer/PDF:
 * "Leihstellung POS, Laufzeit X" priced at the net total, with the description
 * enumerating every item and quantity grouped by bucket. Returns null when the
 * rental is empty (nothing selected).
 */
export function rentalLineFields(state: RentalState): RentalLineFields | null {
  const r = buildRentalOffer(state);
  const allLines = [...r.hardwareLines, ...r.serviceLines, ...r.softwareLines];
  if (allLines.length === 0) return null;

  const section = (title: string, lines: RentalLine[]): string[] =>
    lines.length ? [`${title}:`, ...lines.map((l) => `${l.qty}× ${l.name}`)] : [];

  const description = [
    ...section('Hardware', r.hardwareLines),
    ...section('Dienstleistung', r.serviceLines),
    ...section('Software', r.softwareLines),
  ].join('\n');

  return {
    id: RENTAL_LINE_ID,
    name: `Leihstellung POS, Laufzeit ${r.term.label}`,
    price: r.netto,
    description,
  };
}
