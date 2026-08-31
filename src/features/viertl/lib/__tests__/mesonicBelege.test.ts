import { describe, it, expect } from 'vitest';
import { parseBeleg, isEmptyBeleg, articlePositions, latestHardware } from '../mesonicBelege';

// Echte Antwort (aus der Praxis) — Beleg mit Positionen.
const WITH_DATA = `<?xml version="1.0" encoding="UTF-8"?><MESOWebService TemplateType="30" Template="WEBBelege">
  <WEBBelegeT025>
    <BELEGKEY>1</BELEGKEY><Kontonummer>272765</Kontonummer><Laufnummer>2</Laufnummer>
    <DatumFaktura>2020-07-31</DatumFaktura><Belegart>4</Belegart>
  </WEBBelegeT025>
  <WEBBelegeT026><BELEGKEY>1</BELEGKEY><Datentyp>3</Datentyp><Artikelnummer>TEXT</Artikelnummer><Mengegeliefert>14.00</Mengegeliefert><Einzelpreis>0.00</Einzelpreis><Bezeichnung>Auflistung Stunden</Bezeichnung></WEBBelegeT026>
  <WEBBelegeT026><BELEGKEY>1</BELEGKEY><Datentyp>1</Datentyp><Artikelnummer>30003046KL</Artikelnummer><Mengegeliefert>-1.00</Mengegeliefert><Einzelpreis>1400.00</Einzelpreis><Bezeichnung>KASSEN-PROGRAMMIERUNG,INSTALLATION,EINSCHULUNG</Bezeichnung></WEBBelegeT026>
  <WEBBelegeT026><BELEGKEY>1</BELEGKEY><Datentyp>1</Datentyp><Artikelnummer>30003046KL</Artikelnummer><Mengegeliefert>14.00</Mengegeliefert><Einzelpreis>100.00</Einzelpreis><Bezeichnung>KASSEN-PROGRAMMIERUNG,INSTALLATION,EINSCHULUNG</Bezeichnung></WEBBelegeT026>
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
    expect(b.positions[1]).toMatchObject({ datentyp: '1', artikelnummer: '30003046KL', einzelpreis: 1400 });
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
    expect(arts.every((p) => p.artikelnummer === '30003046KL')).toBe(true);
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
