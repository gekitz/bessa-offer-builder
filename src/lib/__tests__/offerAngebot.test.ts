import { describe, it, expect } from 'vitest';
import {
  lineToBelegPositions,
  offerToBelegPositions,
  buildOfferAngebotImport,
  buildOfferAngebotXml,
  offerBelegKey,
  OFFER_BELEGART,
  type OfferLineSnapshot,
  type OfferBelegSummary,
} from '../offerAngebot';

const line = (o: Partial<OfferLineSnapshot>): OfferLineSnapshot => ({
  name: 'Item', code: '', qty: 1, discountQty: 0, unitPrice: 0, discountPrice: 0, monthly: false, ...o,
});

const summary = (o: Partial<OfferBelegSummary> = {}): OfferBelegSummary => ({
  periodTotal: 0, monthly: 0, once: 0, maxMonths: 12, takeBack: 0, rabattActive: false, ...o,
});

describe('lineToBelegPositions', () => {
  it('one-time line → single Pseudoartikel position (Datentyp 1) at unit price', () => {
    const pos = lineToBelegPositions(line({ name: 'Kassenlade', code: 'HW1', qty: 2, unitPrice: 150 }));
    expect(pos).toEqual([
      { artikelnummer: '99991234KL', datentyp: '1', menge: 2, einzelpreis: 150, bezeichnung: 'HW1 Kassenlade' },
    ]);
  });

  it('uses the Wolfsberg pseudo-article when the standort is wolfsberg', () => {
    const pos = lineToBelegPositions(line({ name: 'Kassenlade', qty: 1, unitPrice: 150 }), 'wolfsberg');
    expect(pos[0].artikelnummer).toBe('99991234WO');
    expect(pos[0].datentyp).toBe('1');
  });

  it('monthly line carries the tier + monthly hint in the Bezeichnung', () => {
    const pos = lineToBelegPositions(line({ name: 'Kassa-Abo', qty: 1, unitPrice: 39, monthly: true, tier: '12mo' }));
    expect(pos[0].bezeichnung).toBe('Kassa-Abo (12 Monate, monatlich)');
    expect(pos[0].einzelpreis).toBe(39);
  });

  it('monthly line without a tier still marks (monatlich)', () => {
    const pos = lineToBelegPositions(line({ name: 'Modul', qty: 1, unitPrice: 10, monthly: true }));
    expect(pos[0].bezeichnung).toBe('Modul (monatlich)');
  });

  it('discount split → two positions (full price + Aktionspreis)', () => {
    const pos = lineToBelegPositions(line({ name: 'Bon', qty: 3, discountQty: 2, unitPrice: 100, discountPrice: 60 }));
    expect(pos).toHaveLength(2);
    expect(pos[0]).toMatchObject({ menge: 3, einzelpreis: 100, bezeichnung: 'Bon' });
    expect(pos[1]).toMatchObject({ menge: 2, einzelpreis: 60, bezeichnung: 'Bon (Aktionspreis)' });
  });

  it('skips zero-qty and zero-price fragments (no empty lines)', () => {
    expect(lineToBelegPositions(line({ qty: 0, unitPrice: 100 }))).toEqual([]);
    expect(lineToBelegPositions(line({ qty: 1, unitPrice: 0 }))).toEqual([]);
    // full-price part free, discount part priced → only the discount position
    const pos = lineToBelegPositions(line({ name: 'X', qty: 1, unitPrice: 0, discountQty: 1, discountPrice: 20 }));
    expect(pos).toEqual([
      { artikelnummer: '99991234KL', datentyp: '1', menge: 1, einzelpreis: 20, bezeichnung: 'X (Aktionspreis)' },
    ]);
  });

  it('rounds prices to 2 decimals', () => {
    const pos = lineToBelegPositions(line({ name: 'Y', qty: 1, unitPrice: 10.005 }));
    expect(pos[0].einzelpreis).toBe(10.01);
  });
});

describe('offerToBelegPositions', () => {
  it('emits line positions then a Rabatt line then a takeBack line', () => {
    const lines = [
      line({ name: 'Kassa', qty: 1, unitPrice: 39, monthly: true, tier: '12mo' }),
      line({ name: 'Drucker', qty: 1, unitPrice: 300 }),
    ];
    const pos = offerToBelegPositions(lines, summary({ periodTotal: 768, takeBack: 100, rabattActive: true }));
    expect(pos.map((p) => p.bezeichnung)).toEqual([
      'Kassa (12 Monate, monatlich)',
      'Drucker',
      'Rabatt 2 % auf Laufzeitsumme',
      'Hardware-Rücknahme (Gutschrift)',
    ]);
    // Rabatt = 2% of 768 = 15.36, negative
    expect(pos[2].einzelpreis).toBe(-15.36);
    expect(pos[3].einzelpreis).toBe(-100);
  });

  it('omits the Rabatt line when rabattActive is false', () => {
    const pos = offerToBelegPositions([line({ name: 'A', qty: 1, unitPrice: 10 })], summary({ periodTotal: 500 }));
    expect(pos.some((p) => p.bezeichnung.startsWith('Rabatt'))).toBe(false);
  });

  it('omits the takeBack line when takeBack is 0', () => {
    const pos = offerToBelegPositions([line({ name: 'A', qty: 1, unitPrice: 10 })], summary());
    expect(pos.some((p) => p.bezeichnung.startsWith('Hardware-Rücknahme'))).toBe(false);
  });

  it('falls back to summary lines when there is no lineSnapshot (old offers)', () => {
    const pos = offerToBelegPositions([], summary({ monthly: 39, once: 300, maxMonths: 6, periodTotal: 534 }));
    expect(pos.map((p) => p.bezeichnung)).toEqual([
      'Monatliche Positionen (6 Monate)',
      'Einmalige Positionen',
    ]);
    expect(pos[0].einzelpreis).toBe(39);
    expect(pos[1].einzelpreis).toBe(300);
    // Fallback lines must also ride the priced Pseudoartikel (Datentyp 1) so
    // WinLine actually prints their amounts — this was the ZUM DRAGO bug.
    expect(pos.every((p) => p.datentyp === '1' && p.artikelnummer === '99991234KL')).toBe(true);
  });

  it('honours the standort for every position (lines + Rabatt + takeBack)', () => {
    const pos = offerToBelegPositions(
      [line({ name: 'A', qty: 1, unitPrice: 10 })],
      summary({ periodTotal: 500, rabattActive: true, takeBack: 50 }),
      'wolfsberg',
    );
    expect(pos.every((p) => p.artikelnummer === '99991234WO' && p.datentyp === '1')).toBe(true);
  });

  it('fallback still appends Rabatt + takeBack lines', () => {
    const pos = offerToBelegPositions([], summary({ once: 1000, periodTotal: 1000, rabattActive: true, takeBack: 50 }));
    expect(pos.map((p) => p.bezeichnung)).toEqual([
      'Einmalige Positionen',
      'Rabatt 2 % auf Laufzeitsumme',
      'Hardware-Rücknahme (Gutschrift)',
    ]);
  });
});

describe('buildOfferAngebotXml', () => {
  it('wraps the MESOWebService envelope with Belegart 17 and no xml prolog', () => {
    const xml = buildOfferAngebotXml(
      { kontonummer: '272765', laufnummer: 26, datumAngebot: '2026-09-21', vertreternummer: 9 },
      [{ artikelnummer: '99991234KL', datentyp: '1', menge: 1, einzelpreis: 39, bezeichnung: 'Kassa' }],
    );
    expect(xml.startsWith('<MESOWebService TemplateType="30" Template="WEBAngebot"')).toBe(true);
    expect(xml).not.toMatch(/<\?xml/);
    expect(xml).toContain('<Belegart>17</Belegart>');
    expect(xml).toContain('<Kontonummer>272765</Kontonummer>');
    expect(xml).toContain('<Laufnummer>26</Laufnummer>');
    expect(xml).toContain('<DatumAngebot>2026-09-21</DatumAngebot>');
    expect(xml).toContain('<Vertreternummer>9</Vertreternummer>');
    expect(xml).toContain('<Artikelnummer>99991234KL</Artikelnummer>');
    expect(xml).toContain('<Datentyp>1</Datentyp>');
    expect(xml).toContain('<Mengegeliefert>1</Mengegeliefert>');
    expect(xml).toContain('<Einzelpreis>39</Einzelpreis>');
    expect(xml).toContain('<Bezeichnung>Kassa</Bezeichnung>');
    // Kopf-BELEGKEY == Positions-BELEGKEY (verknüpft Kopf ↔ Mitte)
    expect(xml.match(/<BELEGKEY>1<\/BELEGKEY>/g)).toHaveLength(2);
  });

  it('escapes XML metacharacters in the Bezeichnung', () => {
    const xml = buildOfferAngebotXml(
      { kontonummer: '1', laufnummer: 1 },
      [{ artikelnummer: '99991234KL', datentyp: '1', menge: 1, einzelpreis: 1, bezeichnung: 'A & B <GmbH>' }],
    );
    expect(xml).toContain('<Bezeichnung>A &amp; B &lt;GmbH&gt;</Bezeichnung>');
  });

  it('omits empty Kopf fields (datumAngebot/vertreternummer)', () => {
    const xml = buildOfferAngebotXml({ kontonummer: '1', laufnummer: 1 }, []);
    expect(xml).not.toContain('<DatumAngebot>');
    expect(xml).not.toContain('<Vertreternummer>');
  });

  it('OFFER_BELEGART is 17', () => {
    expect(OFFER_BELEGART).toBe('17');
  });
});

describe('buildOfferAngebotImport (end-to-end) + offerBelegKey', () => {
  it('produces a full import for a normal offer', () => {
    const xml = buildOfferAngebotImport(
      { kontonummer: '272765', laufnummer: 26, datumAngebot: '2026-09-21' },
      [line({ name: 'Kassa', qty: 1, unitPrice: 39, monthly: true, tier: '12mo' })],
      summary({ periodTotal: 468, rabattActive: true }),
    );
    expect(xml).toContain('<Bezeichnung>Kassa (12 Monate, monatlich)</Bezeichnung>');
    expect(xml).toContain('<Bezeichnung>Rabatt 2 % auf Laufzeitsumme</Bezeichnung>');
    expect(xml).toContain('<Einzelpreis>-9.36</Einzelpreis>'); // 468 * 0.02
    // Default standort → Klagenfurt pseudo-article, priced Datentyp 1.
    expect(xml).toContain('<Artikelnummer>99991234KL</Artikelnummer>');
    expect(xml).toContain('<Datentyp>1</Datentyp>');
  });

  it('threads the standort into the built positions', () => {
    const xml = buildOfferAngebotImport(
      { kontonummer: '272765', laufnummer: 26 },
      [line({ name: 'Kassa', qty: 1, unitPrice: 39 })],
      summary(),
      'wolfsberg',
    );
    expect(xml).toContain('<Artikelnummer>99991234WO</Artikelnummer>');
    expect(xml).not.toContain('99991234KL');
  });

  it('offerBelegKey formats <konto>-<laufnummer>', () => {
    expect(offerBelegKey('272765', 26)).toBe('272765-26');
  });
});
