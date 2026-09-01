import { describe, it, expect } from 'vitest';
import { parseBeleg, parseBelege, isEmptyBeleg, articlePositions, latestHardware, isLikelyHardware } from '../mesonicBelege';

// Echte Antwort (aus der Praxis) — Beleg mit Positionen.
const WITH_DATA = `<?xml version="1.0" encoding="UTF-8"?><MESOWebService TemplateType="30" Template="WEBBelege">
  <WEBBelegeT025>
    <BELEGKEY>1</BELEGKEY><Kontonummer>272765</Kontonummer><Laufnummer>2</Laufnummer>
    <DatumFaktura>2020-07-31</DatumFaktura><Belegart>4</Belegart>
  </WEBBelegeT025>
  <WEBBelegeT026><BELEGKEY>1</BELEGKEY><Datentyp>3</Datentyp><Artikelnummer>TEXT</Artikelnummer><Mengegeliefert>14.00</Mengegeliefert><Einzelpreis>0.00</Einzelpreis><Bezeichnung>Auflistung Stunden</Bezeichnung></WEBBelegeT026>
  <WEBBelegeT026><BELEGKEY>1</BELEGKEY><Datentyp>1</Datentyp><Artikelnummer>HW-KASSE</Artikelnummer><Mengegeliefert>1.00</Mengegeliefert><Einzelpreis>1400.00</Einzelpreis><Erloeskonto>8000</Erloeskonto><Bezeichnung>Kassenterminal</Bezeichnung></WEBBelegeT026>
  <WEBBelegeT026><BELEGKEY>1</BELEGKEY><Datentyp>1</Datentyp><Artikelnummer>30003046KL</Artikelnummer><Mengegeliefert>14.00</Mengegeliefert><Einzelpreis>100.00</Einzelpreis><Erloeskonto>8400</Erloeskonto><Bezeichnung>KASSEN-PROGRAMMIERUNG,INSTALLATION,EINSCHULUNG</Bezeichnung></WEBBelegeT026>
</MESOWebService>`;

// Leere Antwort — Platzhalter-Beleg (Belegart 12, ohne DatumFaktura, keine Positionen).
const EMPTY = `<?xml version="1.0" encoding="UTF-8"?><MESOWebService TemplateType="30" Template="WEBBelege">
  <WEBBelegeT025><BELEGKEY>1</BELEGKEY><Kontonummer>272765</Kontonummer><Laufnummer>5</Laufnummer><Belegart>12</Belegart></WEBBelegeT025>
</MESOWebService>`;

const ERROR = `<MESOWebServiceResult><OverallSuccess>false</OverallSuccess><ResultDetails><ErrorCode>000161</ErrorCode></ResultDetails></MESOWebServiceResult>`;

describe('parseBeleg', () => {
  it('parses head + positions', () => {
    const b = parseBeleg(WITH_DATA, 1)!;
    expect(b.kontonummer).toBe('272765');
    expect(b.belegart).toBe('4');
    expect(b.datumFaktura).toBe('2020-07-31');
    expect(b.positions).toHaveLength(3);
    expect(b.positions[1]).toMatchObject({ datentyp: '1', artikelnummer: 'HW-KASSE', einzelpreis: 1400, erloeskonto: '8000' });
  });

  it('returns a head with no positions for the empty placeholder', () => {
    const b = parseBeleg(EMPTY, 5)!;
    expect(b.belegart).toBe('12');
    expect(b.datumFaktura).toBeNull();
    expect(b.positions).toHaveLength(0);
  });

  it('returns null for an error envelope', () => {
    expect(parseBeleg(ERROR)).toBeNull();
    expect(parseBeleg('')).toBeNull();
  });
});

// Batch-Antwort: zwei Belege in einem Response, Positionen per BELEGKEY zugeordnet.
const BATCH = `<?xml version="1.0" encoding="UTF-8"?><MESOWebService TemplateType="30" Template="WEBBelege">
  <WEBBelegeT025><BELEGKEY>1</BELEGKEY><Kontonummer>272765</Kontonummer><Laufnummer>1</Laufnummer><DatumFaktura>2020-08-03</DatumFaktura><Belegart>8</Belegart></WEBBelegeT025>
  <WEBBelegeT026><BELEGKEY>1</BELEGKEY><Datentyp>1</Datentyp><Artikelnummer>38100500KL</Artikelnummer><Mengegeliefert>1.00</Mengegeliefert><Einzelpreis>3000.00</Einzelpreis><Erloeskonto>8050</Erloeskonto><Bezeichnung>ORDERMAN COLUMBUS 500</Bezeichnung></WEBBelegeT026>
  <WEBBelegeT026><BELEGKEY>2</BELEGKEY><Datentyp>3</Datentyp><Artikelnummer>TEXT</Artikelnummer><Mengegeliefert>14.00</Mengegeliefert><Einzelpreis>0.00</Einzelpreis><Bezeichnung>Stunden</Bezeichnung></WEBBelegeT026>
  <WEBBelegeT025><BELEGKEY>2</BELEGKEY><Kontonummer>272765</Kontonummer><Laufnummer>2</Laufnummer><DatumFaktura>2020-07-31</DatumFaktura><Belegart>4</Belegart></WEBBelegeT025>
</MESOWebService>`;

describe('parseBelege (batch)', () => {
  it('splits multiple belege and assigns T026 to the right head via BELEGKEY', () => {
    const belege = parseBelege(BATCH);
    expect(belege).toHaveLength(2);
    const b1 = belege.find((b) => b.laufnummer === '1')!;
    const b2 = belege.find((b) => b.laufnummer === '2')!;
    expect(b1.index).toBe(1);
    expect(b1.belegart).toBe('8');
    expect(b1.positions).toHaveLength(1);
    expect(b1.positions[0]).toMatchObject({ artikelnummer: '38100500KL', erloeskonto: '8050' });
    expect(b2.positions).toHaveLength(1);
    expect(b2.positions[0].datentyp).toBe('3');
  });

  it('returns [] on error/empty', () => {
    expect(parseBelege('<MESOWebServiceResult><OverallSuccess>false</OverallSuccess></MESOWebServiceResult>')).toEqual([]);
    expect(parseBelege('')).toEqual([]);
  });
});

describe('isEmptyBeleg', () => {
  it('treats no-position belege (and null) as empty', () => {
    expect(isEmptyBeleg(parseBeleg(EMPTY, 5))).toBe(true);
    expect(isEmptyBeleg(null)).toBe(true);
    expect(isEmptyBeleg(parseBeleg(WITH_DATA, 1))).toBe(false);
  });
});

describe('articlePositions', () => {
  it('keeps only real articles (Datentyp 1, not TEXT)', () => {
    const arts = articlePositions(parseBeleg(WITH_DATA, 1)!);
    expect(arts).toHaveLength(2);
    expect(arts.map((p) => p.artikelnummer)).toEqual(['HW-KASSE', '30003046KL']);
  });
});

describe('isLikelyHardware', () => {
  it('flags Datentyp-1 articles on Erlöskonto 8000, not services on other accounts', () => {
    const [hw, service] = articlePositions(parseBeleg(WITH_DATA, 1)!);
    expect(hw.erloeskonto).toBe('8000');
    expect(isLikelyHardware(hw)).toBe(true);
    expect(isLikelyHardware(service)).toBe(false); // Erlöskonto 8400
  });
});

describe('latestHardware', () => {
  it('picks the newest beleg that has real articles', () => {
    const older = parseBeleg(WITH_DATA, 1)!; // 2020-07-31
    const newer = { ...older, laufnummer: '9', datumFaktura: '2024-05-01' };
    const res = latestHardware([older, newer])!;
    expect(res.beleg.datumFaktura).toBe('2024-05-01');
    expect(res.articles).toHaveLength(2);
  });

  it('returns null when no beleg has articles', () => {
    expect(latestHardware([parseBeleg(EMPTY, 5)!])).toBeNull();
    expect(latestHardware([])).toBeNull();
  });
});
