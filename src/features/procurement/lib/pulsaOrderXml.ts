// Pure builder for the Pulsa order XML (muster.xml). Kept separate + tested
// because a wrong Bestellnummer/quantity means a wrong binding order.
//
// Pulsa's format: <Bestellung> with Besteller (Firmenname + Kundennummer),
// Auftrag (Nummer/Datum/Währung), Liefer- + Rechnungsadresse, and Positionen
// (Bestellnummer, Bezeichnung, Einkaufspreis, Anzahl). Prices/quantities use
// a DOT decimal with 2 places ("1.15", "40.00").

import type { ShippingAddress } from './shipping';

export interface PulsaPosition {
  bestellnummer: string;
  bezeichnung: string;
  einkaufspreis: number | null; // omitted from the XML when null
  anzahl: number;
}

export interface PulsaOrderInput {
  firmenname: string;
  kundennummer: string;
  auftragsnummer: string;
  auftragsdatum: string; // DD.MM.YYYY
  waehrung?: string; // default EUR
  lieferadresse: ShippingAddress;
  rechnungsadresse: ShippingAddress;
  positionen: PulsaPosition[];
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Dot decimal, exactly 2 places (Pulsa's format), e.g. 1.15 / 40.00.
function dec(n: number): string {
  return n.toFixed(2);
}

function addressBlock(tag: string, a: ShippingAddress): string {
  return [
    `    <${tag}>`,
    `        <Firma>${esc(a.companyName)}</Firma>`,
    `        <Straße>${esc(a.street)}</Straße>`,
    `        <PLZ>${esc(a.zip ?? '')}</PLZ>`,
    `        <Ort>${esc(a.city ?? '')}</Ort>`,
    `        <Land>${esc(a.countryCode)}</Land>`,
    `    </${tag}>`,
  ].join('\n');
}

export function buildPulsaOrderXml(input: PulsaOrderInput): string {
  const positionen = input.positionen
    .map((p) => {
      const lines = [
        '        <Position>',
        `            <Bestellnummer>${esc(p.bestellnummer)}</Bestellnummer>`,
        `            <Bezeichnung>${esc(p.bezeichnung)}</Bezeichnung>`,
      ];
      if (p.einkaufspreis != null) {
        lines.push(`            <Einkaufspreis>${dec(p.einkaufspreis)}</Einkaufspreis>`);
      }
      lines.push(`            <Anzahl>${dec(p.anzahl)}</Anzahl>`);
      lines.push('        </Position>');
      return lines.join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Bestellung>',
    '    <Besteller>',
    `        <Firmenname>${esc(input.firmenname)}</Firmenname>`,
    `        <Kundennummer>${esc(input.kundennummer)}</Kundennummer>`,
    '    </Besteller>',
    '    <Auftrag>',
    `        <Auftragsnummer>${esc(input.auftragsnummer)}</Auftragsnummer>`,
    `        <Auftragsdatum>${esc(input.auftragsdatum)}</Auftragsdatum>`,
    `        <Währung>${esc(input.waehrung ?? 'EUR')}</Währung>`,
    '    </Auftrag>',
    addressBlock('Lieferadresse', input.lieferadresse),
    addressBlock('Rechnungsadresse', input.rechnungsadresse),
    '    <Positionen>',
    positionen,
    '    </Positionen>',
    '</Bestellung>',
  ].join('\n');
}

// Format a Date as DD.MM.YYYY (Pulsa's Auftragsdatum format).
export function formatPulsaDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}
