// Copier / MFP offer engine (Sharp today, Brother later). A copier offer is
// structurally unlike a PoS offer — it's a hardware-financing + managed-print
// deal — so it gets its own pure builder instead of being squeezed through the
// PoS computeTotals/buildLineItems paths (those skip t='copier' items).
//
// One copier *device* cart entry expands into several lines (device, the
// accessories bundled in its list price as €0 lines, UHG, install) plus an
// optional trade-in credit. Plain t='o' Sharp accessories in the same cart are
// added as ordinary one-time lines. The result carries BOTH a Kauf breakdown
// (itemised net/VAT/gross, like the sample Angebot) and a Leasing computation
// (Grenke rate via factor on the financed base), so the PDF can render whichever
// the rep picked. Per-page maintenance rates ride along as informational data —
// they're never summed into any total (usage is unknown until metered).
//
// Leasing factor — validated against two real Grenke outputs (60 mo, 5%
// Restwert, 2% Provision): base €3.594,73 → €71,18 and base €2.974,73 → €58,90,
// both ≈ 1,98%. The price-list "Leasing 60 Monate" columns are Sharp's
// indicative numbers (~2,2%) and are deliberately NOT used.

import type { Catalog } from './pricing';
import type { Cart, CartItem } from './totals';

export const VAT_RATE = 0.2;

export type SaleMode = 'kauf' | 'leasing';

// Grenke leasing parameters. Edit here if Grenke's conditions change; the rate
// is also overridable per deal (trade-in re-quotes) via leasingRateOverride.
export const GRENKE = {
  termMonths: 60,
  factor: 0.0198,
  // Leasing factor per term, validated against the Grenke calculator at the
  // standard Restwert 5% / Provision 2% (60mo €71,18 and 36mo €113,23 on a base
  // of €3.594,73). We only have factors for these two terms; other conditions
  // require the rep to set the factor or the absolute rate explicitly.
  factorByTerm: { 36: 0.0315, 60: 0.0198 },
  restwertPercent: 5,
  provisionPercent: 2,
  bearbeitungsgebuehr: 75,
  vertragsgebuehrPercent: 1, // % of Auftragssumme (the financed base)
} as const;

export type CopierLineKind = 'device' | 'included' | 'accessory' | 'uhg' | 'install' | 'tradein';

export interface CopierLine {
  kind: CopierLineKind;
  /** Cart-item id for editable lines (device, accessory); undefined otherwise. */
  id?: string;
  name: string;
  code?: string;
  qty: number;
  /** Net unit price. 0 for included options; negative for a trade-in credit. */
  unitPrice: number;
  /** Net line total (unitPrice × qty). */
  lineTotal: number;
  /** Multi-line spec block (device lines only). */
  description?: string;
}

export interface MaintenanceRates {
  deviceName: string;
  pageBw: number;
  pageColor: number;
  pageScan: number;
}

export interface LeasingTerms {
  /** Monthly net rate — computed (base × factor) or the manual override. */
  rate: number;
  rateOverridden: boolean;
  termMonths: number;
  factor: number;
  restwert: number;
  bearbeitungsgebuehr: number;
  vertragsgebuehr: number;
  mietsonderzahlung: number;
}

export interface CopierOffer {
  /** False when the cart contains no copier device — callers fall back to the PoS path. */
  isCopierOffer: boolean;
  saleMode: SaleMode;
  lines: CopierLine[];
  /** Net base for assets before trade-in/down-payment (Σ vk + uhg + install + accessories). */
  assetBase: number;
  /** Total trade-in credit deducted (positive number). */
  tradeInTotal: number;
  // Kauf totals (the itemised Angebotssumme).
  net: number;
  vat: number;
  gross: number;
  /** Financed amount for leasing = assetBase − trade-in − Mietsonderzahlung. */
  financedBase: number;
  leasing: LeasingTerms;
  /** Per-device managed-print rates (informational; never summed). */
  maintenance: MaintenanceRates[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Build the full copier/MFP offer breakdown from a cart. Pure — no I/O. Reads
 * sale mode, trade-in, Mietsonderzahlung and the leasing-rate override off the
 * copier device cart entries (whole-offer settings are taken from the first
 * device). Entries that aren't copier devices or one-time accessories are
 * ignored.
 */
export function buildCopierOffer(cart: Cart, catalog: Catalog): CopierOffer {
  const entries = Object.entries(cart);

  type Device = { id: string; item: NonNullable<Catalog[string]>; c: CartItem; qty: number; vk: number };
  type Accessory = { id: string; item: NonNullable<Catalog[string]>; c: CartItem; qty: number; unit: number };
  const devices: Device[] = [];
  const accessories: Accessory[] = [];

  // A per-line priceOverride (set via the edit dialog) replaces the catalog
  // price for both the device VK and accessory unit prices.
  const overrideOr = (c: CartItem, fallback: number): number =>
    c.priceOverride != null && Number.isFinite(c.priceOverride) ? c.priceOverride : fallback;

  for (const [id, c] of entries) {
    const item = catalog[id];
    if (!item) continue;
    if (item.t === 'copier') {
      const qty = c.qty ?? 1;
      if (qty <= 0) continue;
      devices.push({ id, item, c, qty, vk: overrideOr(c, item.vk ?? 0) });
    } else if (item.t === 'o') {
      const qty = c.qty ?? 0;
      if (qty <= 0) continue;
      accessories.push({ id, item, c, qty, unit: overrideOr(c, numOr0(item.price)) });
    }
  }

  if (devices.length === 0) {
    return emptyOffer();
  }

  // Whole-offer settings come off the first device entry.
  const primary = devices[0]!.c;
  const saleMode: SaleMode = primary.saleMode === 'leasing' ? 'leasing' : 'kauf';
  const mietsonderzahlung = numOr0(primary.mietsonderzahlung);

  // --- Asset base (everything financed/sold, before credits) ---
  let assetBase = 0;
  for (const d of devices) assetBase += d.vk * d.qty + numOr0(d.item.uhg) * d.qty + numOr0(d.item.install) * d.qty;
  for (const a of accessories) assetBase += a.unit * a.qty;
  assetBase = round2(assetBase);

  let tradeInTotal = 0;
  for (const d of devices) tradeInTotal += numOr0(d.c.tradeIn?.value);
  tradeInTotal = round2(tradeInTotal);

  // --- Lines, in the sample's order: per device (device + included), then
  //     accessories, then UHG, install, and trade-in credits last. ---
  const lines: CopierLine[] = [];
  for (const d of devices) {
    lines.push({
      kind: 'device',
      id: d.id,
      name: d.item.name,
      code: d.item.code,
      qty: d.qty,
      unitPrice: d.vk,
      lineTotal: round2(d.vk * d.qty),
      description: d.item.description,
    });
    for (const opt of d.item.includedOptions ?? []) {
      lines.push({ kind: 'included', name: opt.name, qty: d.qty, unitPrice: 0, lineTotal: 0 });
    }
  }
  for (const a of accessories) {
    lines.push({ kind: 'accessory', id: a.id, name: a.item.name, code: a.item.code, qty: a.qty, unitPrice: a.unit, lineTotal: round2(a.unit * a.qty) });
  }
  for (const d of devices) {
    const uhg = numOr0(d.item.uhg);
    if (uhg > 0) lines.push({ kind: 'uhg', name: 'Reprographievergütung (UHG)', qty: d.qty, unitPrice: uhg, lineTotal: round2(uhg * d.qty) });
  }
  for (const d of devices) {
    const install = numOr0(d.item.install);
    if (install > 0) lines.push({ kind: 'install', name: 'Lieferung, Installation und Einschulung', qty: d.qty, unitPrice: install, lineTotal: round2(install * d.qty) });
  }
  for (const d of devices) {
    if (d.c.tradeIn && numOr0(d.c.tradeIn.value) > 0) {
      const credit = numOr0(d.c.tradeIn.value);
      lines.push({ kind: 'tradein', name: d.c.tradeIn.name || 'Eintauschgerät', qty: 1, unitPrice: -credit, lineTotal: -credit });
    }
  }

  // --- Kauf totals ---
  const net = round2(assetBase - tradeInTotal);
  const vat = round2(net * VAT_RATE);
  const gross = round2(net + vat);

  // --- Leasing ---
  // Conditions default to the GRENKE config but are overridable per offer (read
  // off the primary device): term → its known factor; the factor itself; the
  // Restwert % and Bearbeitungsgebühr (printed terms); the Mietsonderzahlung;
  // and finally the absolute rate, which wins over the factor computation.
  const financedBase = round2(assetBase - tradeInTotal - mietsonderzahlung);
  const termMonths = numOr0(primary.leasingTermMonths) || GRENKE.termMonths;
  const factorForTerm = (GRENKE.factorByTerm as Record<number, number>)[termMonths] ?? GRENKE.factor;
  const factor = primary.leasingFactorOverride != null && Number.isFinite(primary.leasingFactorOverride)
    ? primary.leasingFactorOverride
    : factorForTerm;
  const restwertPercent = primary.restwertPercentOverride != null && Number.isFinite(primary.restwertPercentOverride)
    ? primary.restwertPercentOverride
    : GRENKE.restwertPercent;
  const bearbeitungsgebuehr = primary.bearbeitungsgebuehrOverride != null && Number.isFinite(primary.bearbeitungsgebuehrOverride)
    ? primary.bearbeitungsgebuehrOverride
    : GRENKE.bearbeitungsgebuehr;
  const computedRate = round2(financedBase * factor);
  const override = primary.leasingRateOverride;
  const rateOverridden = override != null && Number.isFinite(override);
  const leasing: LeasingTerms = {
    rate: rateOverridden ? round2(override as number) : computedRate,
    rateOverridden,
    termMonths,
    factor,
    restwert: round2((financedBase * restwertPercent) / 100),
    bearbeitungsgebuehr,
    vertragsgebuehr: round2((financedBase * GRENKE.vertragsgebuehrPercent) / 100),
    mietsonderzahlung,
  };

  const maintenance: MaintenanceRates[] = devices.map((d) => ({
    deviceName: d.item.name,
    pageBw: numOr0(d.item.pageBw),
    pageColor: numOr0(d.item.pageColor),
    pageScan: numOr0(d.item.pageScan),
  }));

  return { isCopierOffer: true, saleMode, lines, assetBase, tradeInTotal, net, vat, gross, financedBase, leasing, maintenance };
}

// Totals to persist on the offers row for a copier offer, so the list, CRM and
// accept page show real pipeline value (computeTotals is 0 for copier carts).
// Kauf → net as a one-time amount; Leasing → the monthly rate, with rate × term
// as the period value. Merge over the PoS OfferTotals to keep its other fields.
export function copierPersistTotals(offer: CopierOffer): {
  monthly: number;
  once: number;
  periodMonthly: number;
  periodTotal: number;
  maxMonths: number;
} {
  if (offer.saleMode === 'leasing') {
    const monthly = offer.leasing.rate;
    const months = offer.leasing.termMonths;
    return { monthly, once: 0, periodMonthly: monthly * months, periodTotal: monthly * months, maxMonths: months };
  }
  return { monthly: 0, once: offer.net, periodMonthly: 0, periodTotal: offer.net, maxMonths: 12 };
}

function numOr0(n: number | undefined | null): number {
  return n != null && Number.isFinite(n) ? n : 0;
}

function emptyOffer(): CopierOffer {
  return {
    isCopierOffer: false,
    saleMode: 'kauf',
    lines: [],
    assetBase: 0,
    tradeInTotal: 0,
    net: 0,
    vat: 0,
    gross: 0,
    financedBase: 0,
    leasing: {
      rate: 0,
      rateOverridden: false,
      termMonths: GRENKE.termMonths,
      factor: GRENKE.factor,
      restwert: 0,
      bearbeitungsgebuehr: GRENKE.bearbeitungsgebuehr,
      vertragsgebuehr: 0,
      mietsonderzahlung: 0,
    },
    maintenance: [],
  };
}
