import { describe, it, expect } from 'vitest';
import { buildDeliveryItemsFromOffer, ARBEITSZEIT_PRODUCT_ID, type OfferDataForSeed } from '../deliveryNoteSeed';
import type { Catalog, Item } from '../../../../lib/pricing';

// Minimal hydrated catalog for the transform.
const catalog: Catalog = {
  hw1: { id: 'hw1', name: 'Sunmi L3', t: 'h', price: 599, code: 'ART-L3' } as Item,
  hw2: { id: 'hw2', name: 'Bondrucker', t: 'h', p: { o: 199 }, code: 'ART-BON' } as Item,
  mod1: { id: 'mod1', name: 'Lagerverwaltung', t: 'm', p: { y: 15, s: 18, m: 20, e: 30 }, code: '022' } as Item,
  [ARBEITSZEIT_PRODUCT_ID]: { id: ARBEITSZEIT_PRODUCT_ID, name: 'Arbeitszeit', t: 'h', price: 118 } as Item,
  cop1: { id: 'cop1', name: 'Sharp BP-51C26', t: 'copier', vk: 4200, code: 'ART-SHARP' } as Item,
};

describe('buildDeliveryItemsFromOffer', () => {
  it('returns [] for empty/missing offer data', () => {
    expect(buildDeliveryItemsFromOffer(null, catalog)).toEqual([]);
    expect(buildDeliveryItemsFromOffer({}, catalog)).toEqual([]);
    expect(buildDeliveryItemsFromOffer({ cart: {} }, catalog)).toEqual([]);
  });

  it('maps a hardware line: code snapshot, name, qty, net unit price', () => {
    const offer: OfferDataForSeed = { cart: { hw1: { qty: 2 } } };
    const [line] = buildDeliveryItemsFromOffer(offer, catalog);
    expect(line).toMatchObject({
      productId: 'hw1',
      mesonicArtikelNr: 'ART-L3',
      bezeichnung: 'Sunmi L3',
      quantity: 2,
      unitPrice: 599,
      isFreetext: false,
      serialNumbers: [],
    });
  });

  it('excludes the Arbeitszeit product (tracked via Reparaturschein)', () => {
    const offer: OfferDataForSeed = { cart: { hw1: { qty: 1 }, [ARBEITSZEIT_PRODUCT_ID]: { qty: 10 } } };
    const out = buildDeliveryItemsFromOffer(offer, catalog);
    expect(out.map((l) => l.bezeichnung)).toEqual(['Sunmi L3']);
  });

  it('counts discounted units as delivered (qty + discountQty)', () => {
    const offer: OfferDataForSeed = { cart: { hw1: { qty: 3, discountQty: 2 } } };
    const [line] = buildDeliveryItemsFromOffer(offer, catalog);
    expect(line.quantity).toBe(5);
  });

  it('honours a per-line price override', () => {
    const offer: OfferDataForSeed = { cart: { hw1: { qty: 1, priceOverride: 500 } } };
    const [line] = buildDeliveryItemsFromOffer(offer, catalog);
    expect(line.unitPrice).toBe(500);
  });

  it('prices a monthly module at the selected tier', () => {
    const offer: OfferDataForSeed = { cart: { mod1: { qty: 1, tier: '6mo' } } };
    const [line] = buildDeliveryItemsFromOffer(offer, catalog);
    // 6mo → PriceKey 's' → 18
    expect(line.unitPrice).toBe(18);
    expect(line.mesonicArtikelNr).toBe('022');
  });

  it('prices a copier at its net VK', () => {
    const offer: OfferDataForSeed = { cart: { cop1: { qty: 1 } } };
    const [line] = buildDeliveryItemsFromOffer(offer, catalog);
    expect(line.unitPrice).toBe(4200);
    expect(line.bezeichnung).toBe('Sharp BP-51C26');
  });

  it('treats customItems as freetext (no product id / artikelnummer)', () => {
    const offer: OfferDataForSeed = {
      cart: { custom_1: { qty: 1, priceOverride: 42 } },
      customItems: { custom_1: { id: 'custom_1', name: 'Sonderposition', t: 'o', price: 42 } as Item },
    };
    const [line] = buildDeliveryItemsFromOffer(offer, catalog);
    expect(line).toMatchObject({
      productId: null,
      mesonicArtikelNr: null,
      bezeichnung: 'Sonderposition',
      isFreetext: true,
      unitPrice: 42,
    });
  });

  it('skips stale ids no longer in the catalog', () => {
    const offer: OfferDataForSeed = { cart: { gone: { qty: 1 }, hw1: { qty: 1 } } };
    const out = buildDeliveryItemsFromOffer(offer, catalog);
    expect(out.map((l) => l.productId)).toEqual(['hw1']);
  });

  it('skips zero-quantity lines', () => {
    const offer: OfferDataForSeed = { cart: { hw1: { qty: 0, discountQty: 0 } } };
    expect(buildDeliveryItemsFromOffer(offer, catalog)).toEqual([]);
  });

  it('respects cartOrder and assigns incrementing sort', () => {
    const offer: OfferDataForSeed = {
      cart: { hw1: { qty: 1 }, hw2: { qty: 1 } },
      cartOrder: ['hw2', 'hw1'],
    };
    const out = buildDeliveryItemsFromOffer(offer, catalog);
    expect(out.map((l) => l.productId)).toEqual(['hw2', 'hw1']);
    expect(out.map((l) => l.sort)).toEqual([0, 1]);
  });
});
