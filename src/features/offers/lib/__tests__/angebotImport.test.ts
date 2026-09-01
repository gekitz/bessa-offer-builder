import { describe, it, expect } from 'vitest';
import { buildAngebotImportXml, laborArtikelnummer, REPARATUR_BELEGART } from '../angebotImport';

describe('laborArtikelnummer (Reparaturschein Arbeitszeit)', () => {
  it('builds 300000 + 2-digit Vertreternummer (leading zero) + WO/KL', () => {
    expect(laborArtikelnummer(9, 'wolfsberg')).toBe('30000009WO');
    expect(laborArtikelnummer(26, 'klagenfurt')).toBe('30000026KL');
    expect(laborArtikelnummer('7', 'klagenfurt')).toBe('30000007KL');
  });
  it('Reparatur Belegart: KL 16 / WO 12', () => {
    expect(REPARATUR_BELEGART.klagenfurt).toBe('16');
    expect(REPARATUR_BELEGART.wolfsberg).toBe('12');
  });
});

describe('buildAngebotImportXml', () => {
  const xml = buildAngebotImportXml(
    { kontonummer: '272765', laufnummer: 7, datumAngebot: '2026-09-01', belegart: '8', vertreternummer: 42 },
    [
      { artikelnummer: '99991234KL', datentyp: '1', menge: 1, einzelpreis: 1400, bezeichnung: 'Kassa-Paket', zeilenrabatt1: -10 },
      { artikelnummer: 'TEXT', datentyp: '3', menge: 1, bezeichnung: 'inkl. Fiskalisierung' },
    ],
  );

  it('wraps in envelope with option="0" + printVoucher="0" and NO <?xml?> prolog', () => {
    expect(xml).toContain('<MESOWebService TemplateType="30" Template="WEBAngebot" option="0" printVoucher="0">');
    expect(xml.trim().startsWith('<MESOWebService')).toBe(true); // WinLine rejects the xml declaration
    expect(xml).not.toContain('<?xml');
    expect(xml.trim().endsWith('</MESOWebService>')).toBe(true);
  });

  it('emits Kopf fields in XSD order', () => {
    const kopf = xml.slice(xml.indexOf('<WEBAngebotT025>'), xml.indexOf('</WEBAngebotT025>'));
    const order = ['BELEGKEY', 'Kontonummer', 'Laufnummer', 'DatumAngebot', 'Belegart', 'Vertreternummer'];
    const positions = order.map((t) => kopf.indexOf(`<${t}>`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(kopf).toContain('<Kontonummer>272765</Kontonummer>');
    expect(kopf).toContain('<Laufnummer>7</Laufnummer>');
    expect(kopf).toContain('<Belegart>8</Belegart>');
  });

  it('emits a priced article position (Datentyp 1) with net price + percent discount', () => {
    expect(xml).toContain('<Artikelnummer>99991234KL</Artikelnummer>');
    expect(xml).toContain('<Datentyp>1</Datentyp>');
    expect(xml).toContain('<Einzelpreis>1400</Einzelpreis>');
    expect(xml).toContain('<Zeilenrabatt1>-10</Zeilenrabatt1>');
  });

  it('emits a text position (Datentyp 3, Artikelnummer TEXT) without price', () => {
    const textPos = xml.slice(xml.lastIndexOf('<WEBAngebotT026>'));
    expect(textPos).toContain('<Artikelnummer>TEXT</Artikelnummer>');
    expect(textPos).toContain('<Datentyp>3</Datentyp>');
    expect(textPos).not.toContain('<Einzelpreis>');
    expect(textPos).not.toContain('<Zeilenrabatt1>');
  });

  it('shares one BELEGKEY across Kopf and all positions', () => {
    expect((xml.match(/<BELEGKEY>1<\/BELEGKEY>/g) || [])).toHaveLength(3); // 1 Kopf + 2 Positionen
  });

  it('escapes special chars in Bezeichnung', () => {
    const x = buildAngebotImportXml({ kontonummer: '1', laufnummer: 1 }, [
      { artikelnummer: 'TEXT', datentyp: '3', menge: 1, bezeichnung: 'A & B < C' },
    ]);
    expect(x).toContain('A &amp; B &lt; C');
  });
});
