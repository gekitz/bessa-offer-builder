import { describe, it, expect } from 'vitest';
import { buildPulsaOrderXml, formatPulsaDate } from './pulsaOrderXml';
import type { ShippingAddress } from './shipping';

const KLU: ShippingAddress = {
  countryCode: 'AT', companyName: 'KITZ Computer + Office GmbH',
  street: 'Rosentaler Straße 1', zip: '9020', city: 'Klagenfurt',
};

function baseInput() {
  return {
    firmenname: 'KITZ Computer + Office GmbH',
    kundennummer: '11720',
    auftragsnummer: 'KITZ-123',
    auftragsdatum: '25.08.2026',
    lieferadresse: KLU,
    rechnungsadresse: KLU,
    positionen: [
      { bestellnummer: '7201-080.02', bezeichnung: 'Bonrollen', einkaufspreis: 1.15, anzahl: 40 },
    ],
  };
}

describe('buildPulsaOrderXml', () => {
  it('produces the expected Bestellung structure', () => {
    const xml = buildPulsaOrderXml(baseInput());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Kundennummer>11720</Kundennummer>');
    expect(xml).toContain('<Auftragsnummer>KITZ-123</Auftragsnummer>');
    expect(xml).toContain('<Auftragsdatum>25.08.2026</Auftragsdatum>');
    expect(xml).toContain('<Währung>EUR</Währung>');
    expect(xml).toContain('<Bestellnummer>7201-080.02</Bestellnummer>');
    expect(xml).toContain('<Bezeichnung>Bonrollen</Bezeichnung>');
  });

  it('formats price + quantity with a dot and two decimals', () => {
    const xml = buildPulsaOrderXml(baseInput());
    expect(xml).toContain('<Einkaufspreis>1.15</Einkaufspreis>');
    expect(xml).toContain('<Anzahl>40.00</Anzahl>');
  });

  it('omits Einkaufspreis when the price is unknown', () => {
    const xml = buildPulsaOrderXml({
      ...baseInput(),
      positionen: [{ bestellnummer: 'X', bezeichnung: 'Y', einkaufspreis: null, anzahl: 3 }],
    });
    expect(xml).not.toContain('<Einkaufspreis>');
    expect(xml).toContain('<Anzahl>3.00</Anzahl>');
  });

  it('renders both addresses with Firma/Straße/PLZ/Ort/Land', () => {
    const xml = buildPulsaOrderXml(baseInput());
    expect(xml).toContain('<Lieferadresse>');
    expect(xml).toContain('<Rechnungsadresse>');
    expect(xml).toContain('<Firma>KITZ Computer + Office GmbH</Firma>');
    expect(xml).toContain('<Straße>Rosentaler Straße 1</Straße>');
    expect(xml).toContain('<PLZ>9020</PLZ>');
    expect(xml).toContain('<Ort>Klagenfurt</Ort>');
    expect(xml).toContain('<Land>AT</Land>');
  });

  it('escapes XML special characters', () => {
    const xml = buildPulsaOrderXml({
      ...baseInput(),
      positionen: [{ bestellnummer: 'A&B', bezeichnung: 'Kabel <2m> "kurz"', einkaufspreis: 5, anzahl: 1 }],
    });
    expect(xml).toContain('<Bestellnummer>A&amp;B</Bestellnummer>');
    expect(xml).toContain('<Bezeichnung>Kabel &lt;2m&gt; &quot;kurz&quot;</Bezeichnung>');
  });

  it('emits one <Position> per line', () => {
    const xml = buildPulsaOrderXml({
      ...baseInput(),
      positionen: [
        { bestellnummer: 'A', bezeichnung: 'a', einkaufspreis: 1, anzahl: 1 },
        { bestellnummer: 'B', bezeichnung: 'b', einkaufspreis: 2, anzahl: 2 },
      ],
    });
    expect(xml.match(/<Position>/g)).toHaveLength(2);
  });
});

describe('formatPulsaDate', () => {
  it('formats as DD.MM.YYYY', () => {
    expect(formatPulsaDate(new Date(2026, 7, 5))).toBe('05.08.2026');
    expect(formatPulsaDate(new Date(1999, 0, 1))).toBe('01.01.1999');
  });
});
