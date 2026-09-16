import { describe, expect, it } from 'vitest';
import { loanToBelegPositions, buildLoanBelegXml, loanBelegKey } from './loanBeleg';

const loan = { customerKdnr: '24998', startedAt: '2026-09-16', expectedReturn: '2026-10-16' };
const devices = [
  { bezeichnung: 'Sunmi L3', serialNumber: 'SN-1' },
  { bezeichnung: 'Bondrucker', serialNumber: 'SN-2' },
];

describe('loanBelegKey', () => {
  it('is <konto>-<laufnummer>', () => {
    expect(loanBelegKey('24998', 26)).toBe('24998-26');
  });
});

describe('loanToBelegPositions', () => {
  it('emits one TEXT position per device, qty 1, price 0', () => {
    const pos = loanToBelegPositions(loan, devices);
    expect(pos).toHaveLength(2);
    for (const p of pos) {
      expect(p.artikelnummer).toBe('TEXT');
      expect(p.datentyp).toBe('3');
      expect(p.menge).toBe(1);
      expect(p.einzelpreis).toBe(0);
    }
    expect(pos[0].bezeichnung).toContain('Sunmi L3 SN SN-1');
    expect(pos[0].bezeichnung).toContain('Leihbeginn 2026-09-16');
    expect(pos[0].bezeichnung).toContain('Rückgabe geplant 2026-10-16');
  });

  it('omits the return note when no expected return is set', () => {
    const pos = loanToBelegPositions({ ...loan, expectedReturn: null }, [devices[0]]);
    expect(pos[0].bezeichnung).not.toContain('Rückgabe geplant');
    expect(pos[0].bezeichnung).toContain('Leihbeginn 2026-09-16');
  });
});

describe('buildLoanBelegXml', () => {
  it('builds a Belegart-19 WEBAngebot envelope with the konto, laufnummer and TEXT lines', () => {
    const xml = buildLoanBelegXml(loan, devices, 26);
    expect(xml).toContain('TemplateType="30"');
    expect(xml).toContain('<Belegart>19</Belegart>');
    expect(xml).toContain('<Kontonummer>24998</Kontonummer>');
    expect(xml).toContain('<Laufnummer>26</Laufnummer>');
    expect(xml).toContain('<DatumAngebot>2026-09-16</DatumAngebot>');
    // Two TEXT positions.
    expect(xml.match(/<Artikelnummer>TEXT<\/Artikelnummer>/g)).toHaveLength(2);
    expect(xml.match(/<Datentyp>3<\/Datentyp>/g)).toHaveLength(2);
  });
});
