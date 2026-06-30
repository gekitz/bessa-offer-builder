import { describe, it, expect } from 'vitest';
import { buildCopierOffer, copierPersistTotals, GRENKE, VAT_RATE } from '../copierOffer';
import { computeTotals, type Cart } from '../totals';
import { ALL } from '../../features/offers/data/catalogs';

const BP51C26 = 'sharp-bp51c26';
// A real BESSA monthly item id, used to prove the empty-offer path.
const BESSA_ID = '3942f638-1abb-4be9-85a5-d3bf442aa3d8';

describe('buildCopierOffer — empty / non-copier carts', () => {
  it('reports isCopierOffer=false when no copier device is present', () => {
    const cart: Cart = { [BESSA_ID]: { qty: 1 } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.isCopierOffer).toBe(false);
    expect(offer.net).toBe(0);
    expect(offer.lines).toEqual([]);
  });
});

describe('buildCopierOffer — Kauf (reproduces sample Angebot FA26/70)', () => {
  // Sample sold the BP51C26 at a negotiated €3.180 (price list is €3.150),
  // so the device price is overridden. UHG €194,73 + Install €250 come from
  // the catalog; a €650 trade-in is credited.
  const cart: Cart = {
    [BP51C26]: {
      qty: 1,
      priceOverride: 3180,
      saleMode: 'kauf',
      tradeIn: { name: 'Eintauschgerät Sharp MX 2651', value: 650 },
    },
  };

  it('computes the itemised net / VAT / gross exactly as the sample', () => {
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.isCopierOffer).toBe(true);
    expect(offer.saleMode).toBe('kauf');
    // 3180 + 194,73 + 250 = 3624,73 assets, − 650 trade-in = 2974,73 net.
    expect(offer.assetBase).toBe(3624.73);
    expect(offer.tradeInTotal).toBe(650);
    expect(offer.net).toBe(2974.73);
    expect(offer.vat).toBe(594.95);
    expect(offer.gross).toBe(3569.68);
  });

  it('expands into device + included(@0) + UHG + install + trade-in lines, in order', () => {
    const offer = buildCopierOffer(cart, ALL);
    const kinds = offer.lines.map((l) => l.kind);
    expect(kinds).toEqual(['device', 'included', 'included', 'uhg', 'install', 'tradein']);

    const device = offer.lines[0]!;
    expect(device.unitPrice).toBe(3180);
    expect(device.lineTotal).toBe(3180);
    expect(device.description).toContain('BP51C26');

    // Bundled console + inner output are shown but cost nothing.
    expect(offer.lines[1]!.unitPrice).toBe(0);
    expect(offer.lines[2]!.unitPrice).toBe(0);

    expect(offer.lines[3]!.unitPrice).toBe(194.73); // UHG
    expect(offer.lines[4]!.unitPrice).toBe(250); // install

    const tradein = offer.lines[5]!;
    expect(tradein.unitPrice).toBe(-650);
    expect(tradein.lineTotal).toBe(-650);
    expect(tradein.name).toContain('MX 2651');
  });

  it('VAT is a clean 20%', () => {
    expect(VAT_RATE).toBe(0.2);
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.vat).toBe(Math.round(offer.net * 0.2 * 100) / 100);
  });
});

describe('buildCopierOffer — Leasing (Grenke factor)', () => {
  it('reproduces the Grenke calculator: base €3.594,73 → €71,18/mo (BP51C26 at list price)', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, saleMode: 'leasing' } };
    const offer = buildCopierOffer(cart, ALL);
    // 3150 + 194,73 + 250 = 3594,73 financed base.
    expect(offer.financedBase).toBe(3594.73);
    expect(offer.leasing.rate).toBe(71.18);
    expect(offer.leasing.rateOverridden).toBe(false);
    expect(offer.leasing.termMonths).toBe(60);
    // Restwert 5% — matches the calculator's €179,74.
    expect(offer.leasing.restwert).toBe(179.74);
    // Vertragsgebühr 1% of the financed base.
    expect(offer.leasing.vertragsgebuehr).toBe(35.95);
    expect(offer.leasing.bearbeitungsgebuehr).toBe(75);
  });

  it("reproduces the sample's trade-in lease rate: base €2.974,73 → €58,90/mo", () => {
    const cart: Cart = {
      [BP51C26]: {
        qty: 1,
        priceOverride: 3180,
        saleMode: 'leasing',
        tradeIn: { name: 'Eintausch', value: 650 },
      },
    };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.financedBase).toBe(2974.73);
    expect(offer.leasing.rate).toBe(58.9);
  });

  it('a Mietsonderzahlung reduces the financed base before the factor', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, saleMode: 'leasing', mietsonderzahlung: 594.73 } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.financedBase).toBe(3000); // 3594,73 − 594,73
    expect(offer.leasing.rate).toBe(Math.round(3000 * GRENKE.factor * 100) / 100);
    expect(offer.leasing.mietsonderzahlung).toBe(594.73);
  });

  it('honours a manual leasing-rate override (per-deal Grenke re-quote)', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, saleMode: 'leasing', leasingRateOverride: 64.9 } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.leasing.rate).toBe(64.9);
    expect(offer.leasing.rateOverridden).toBe(true);
  });

  it('uses the 36-month factor when the term is changed', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, saleMode: 'leasing', leasingTermMonths: 36 } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.leasing.termMonths).toBe(36);
    // 3.594,73 × 3,15% = 113,23 (matches the Grenke calculator's 36-month rate)
    expect(offer.leasing.rate).toBe(113.23);
  });

  it('honours an explicit factor override', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, saleMode: 'leasing', leasingFactorOverride: 0.025 } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.leasing.factor).toBe(0.025);
    expect(offer.leasing.rate).toBe(Math.round(3594.73 * 0.025 * 100) / 100);
  });

  it('honours Restwert % and Bearbeitungsgebühr overrides', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, saleMode: 'leasing', restwertPercentOverride: 10, bearbeitungsgebuehrOverride: 120 } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.leasing.restwert).toBe(359.47); // 3.594,73 × 10%
    expect(offer.leasing.bearbeitungsgebuehr).toBe(120);
  });
});

describe('buildCopierOffer — accessories', () => {
  it('adds Sharp accessories to the base and as one-time lines', () => {
    const cart: Cart = {
      [BP51C26]: { qty: 1, saleMode: 'kauf' },
      'sharp-zb-bpfn13': { qty: 1 }, // Heft-Finisher €1.445
    };
    const offer = buildCopierOffer(cart, ALL);
    // 3150 + 194,73 + 250 + 1445 = 5039,73
    expect(offer.assetBase).toBe(5039.73);
    expect(offer.net).toBe(5039.73);
    const accessory = offer.lines.find((l) => l.kind === 'accessory');
    expect(accessory?.lineTotal).toBe(1445);
  });
});

describe('buildCopierOffer — price overrides (edit dialog)', () => {
  it('device priceOverride replaces the VK in the net and the device line', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, priceOverride: 3180, saleMode: 'kauf' } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.net).toBe(3624.73); // 3180 + 194,73 + 250
    const device = offer.lines.find((l) => l.kind === 'device');
    expect(device?.unitPrice).toBe(3180);
    expect(device?.id).toBe(BP51C26);
  });

  it('accessory priceOverride replaces its unit price in the net and its line', () => {
    const cart: Cart = {
      [BP51C26]: { qty: 1, saleMode: 'kauf' },
      'sharp-zb-bpfn13': { qty: 1, priceOverride: 1200 }, // list 1445 → negotiated 1200
    };
    const offer = buildCopierOffer(cart, ALL);
    // 3150 + 194,73 + 250 + 1200 = 4794,73
    expect(offer.net).toBe(4794.73);
    const accessory = offer.lines.find((l) => l.kind === 'accessory');
    expect(accessory?.unitPrice).toBe(1200);
    expect(accessory?.id).toBe('sharp-zb-bpfn13');
  });

  it('included and UHG/install lines carry no editable id', () => {
    const offer = buildCopierOffer({ [BP51C26]: { qty: 1, saleMode: 'kauf' } }, ALL);
    for (const l of offer.lines) {
      if (l.kind === 'included' || l.kind === 'uhg' || l.kind === 'install') expect(l.id).toBeUndefined();
    }
  });
});

describe('buildCopierOffer — maintenance rates', () => {
  it('carries per-device page rates without folding them into any total', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, saleMode: 'kauf' } };
    const offer = buildCopierOffer(cart, ALL);
    expect(offer.maintenance).toHaveLength(1);
    expect(offer.maintenance[0]).toMatchObject({ pageBw: 0.0075, pageColor: 0.075, pageScan: 0.0019 });
    // Net is purely the device + UHG + install — rates are not summed in.
    expect(offer.net).toBe(3594.73);
  });
});

describe('copierPersistTotals — pipeline value stored on the offer row', () => {
  it('Kauf surfaces the net as a one-time amount', () => {
    const offer = buildCopierOffer({ [BP51C26]: { qty: 1, saleMode: 'kauf' } }, ALL);
    const t = copierPersistTotals(offer);
    expect(t.once).toBe(3594.73);
    expect(t.monthly).toBe(0);
    expect(t.periodTotal).toBe(3594.73);
  });

  it('Leasing surfaces the monthly rate and rate × term as the period value', () => {
    const offer = buildCopierOffer({ [BP51C26]: { qty: 1, saleMode: 'leasing' } }, ALL);
    const t = copierPersistTotals(offer);
    expect(t.monthly).toBe(71.18);
    expect(t.once).toBe(0);
    expect(t.maxMonths).toBe(60);
    expect(t.periodTotal).toBe(71.18 * 60);
  });
});

describe('PoS computeTotals ignores copier devices', () => {
  it('never folds a copier device into the PoS buckets', () => {
    const cart: Cart = { [BP51C26]: { qty: 1, priceOverride: 3180, saleMode: 'kauf' } };
    const totals = computeTotals(cart, ALL);
    expect(totals.once).toBe(0);
    expect(totals.monthly).toBe(0);
    expect(totals.periodTotal).toBe(0);
  });
});
