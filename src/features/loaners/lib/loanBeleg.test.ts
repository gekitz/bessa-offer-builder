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
  it('emits a header line (loan period) + one bare device line per device, qty 1, price 0', () => {
    const pos = loanToBelegPositions(loan, devices);
    expect(pos).toHaveLength(3); // 1 header + 2 devices
    for (const p of pos) {
      expect(p.artikelnummer).toBe('TEXT');
      expect(p.datentyp).toBe('3');
      expect(p.menge).toBe(1);
      expect(p.einzelpreis).toBe(0);
    }
    // Header states the period ONCE.
    expect(pos[0].bezeichnung).toBe('Leihstellung: Von 2026-09-16 bis 2026-10-16');
    // Device lines carry only name + SN — no repeated "Leihstellung:" / date.
    expect(pos[1].bezeichnung).toBe('Sunmi L3 SN SN-1');
    expect(pos[2].bezeichnung).toBe('Bondrucker SN SN-2');
    expect(pos[1].bezeichnung).not.toContain('Leihbeginn');
  });

  it('header says "bis offen" when no expected return is set', () => {
    const pos = loanToBelegPositions({ ...loan, expectedReturn: null }, [devices[0]]);
    expect(pos[0].bezeichnung).toBe('Leihstellung: Von 2026-09-16 bis offen');
    expect(pos[1].bezeichnung).toBe('Sunmi L3 SN SN-1');
  });

  it('assigns internal line numbers 1..N+1 (header=1, devices=2..N+1) as edit anchors', () => {
    const pos = loanToBelegPositions(loan, devices);
    expect(pos.map((p) => p.zeilennummerintern)).toEqual([1, 2, 3]);
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
    // 1 header + 2 device TEXT positions.
    expect(xml.match(/<Artikelnummer>TEXT<\/Artikelnummer>/g)).toHaveLength(3);
    expect(xml.match(/<Datentyp>3<\/Datentyp>/g)).toHaveLength(3);
    // "Leihstellung:" appears ONCE (header), not per device.
    expect(xml.match(/Leihstellung:/g)).toHaveLength(1);
  });

  it('defaults to option="0" (neuen Beleg anlegen) and carries internal line numbers', () => {
    const xml = buildLoanBelegXml(loan, devices, 26);
    expect(xml).toContain('option="0"');
    expect(xml).toContain('<Zeilennummerintern>1</Zeilennummerintern>'); // header
    expect(xml).toContain('<Zeilennummerintern>3</Zeilennummerintern>'); // 2nd device
  });

  it('builds an edit envelope (option="3") under the same Laufnummer for appends', () => {
    const xml = buildLoanBelegXml(loan, devices, 26, { option: '3' });
    expect(xml).toContain('option="3"');
    expect(xml).toContain('<Laufnummer>26</Laufnummer>');
    // All lines are resent — WinLine matches the existing ones by Zeilennummerintern.
    expect(xml.match(/<Artikelnummer>TEXT<\/Artikelnummer>/g)).toHaveLength(3);
  });
});
