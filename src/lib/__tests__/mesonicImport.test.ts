import { describe, it, expect, vi } from 'vitest';

// mesonicApi.js imports ./supabase at module load; stub it so the import graph
// resolves in the test environment. buildKontenImportXml itself is pure.
vi.mock('../supabase', () => ({ supabase: {} }));

import { buildKontenImportXml } from '../mesonicApi';

// The WebKontenImport XSD declares its fields in an xs:sequence, so the order
// below is the contract the endpoint validates against.
const SCHEMA_ORDER = [
  'Kontonummer',
  'Kennzeichen',
  'Name',
  'BKZ1',
  'BKZ1Wechselkonto',
  'ZahlungskonditionFIBU',
  'Belegart',
  'Preisliste',
  'ZahlungskonditionFAKT',
  'E-Mail',
  'Vorname',
  'Nachname',
  'Telefon',
  'Strasse',
  'Postleitzahl',
  'Ort',
  'Land',
  'Mobiltelefonnummer',
];

/** Extract emitted tag names in document order. */
function tagsOf(xml: string): string[] {
  return [...xml.matchAll(/<([A-Za-z0-9-]+)>/g)]
    .map(m => m[1])
    .filter(t => t !== 'WebKontenImport');
}

describe('buildKontenImportXml', () => {
  it('wraps records in <WebKontenImport>', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH' });
    expect(xml.startsWith('<WebKontenImport>')).toBe(true);
    expect(xml.trimEnd().endsWith('</WebKontenImport>')).toBe(true);
  });

  it('defaults Kontonummer to "+" for a new customer', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH' });
    expect(xml).toContain('<Kontonummer>+</Kontonummer>');
  });

  it('lets an explicit Kontonummer override the "+" default (edit case)', () => {
    const xml = buildKontenImportXml({ Kontonummer: '29385', Name: 'Foo GmbH' });
    expect(xml).toContain('<Kontonummer>29385</Kontonummer>');
    expect(xml).not.toContain('<Kontonummer>+</Kontonummer>');
  });

  it('fills the mandatory ERP fields with defaults when omitted', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH' });
    expect(xml).toContain('<Kennzeichen>2</Kennzeichen>');
    expect(xml).toContain('<BKZ1>1230</BKZ1>');
    expect(xml).toContain('<BKZ1Wechselkonto>1230</BKZ1Wechselkonto>');
    expect(xml).toContain('<ZahlungskonditionFIBU>3</ZahlungskonditionFIBU>');
    expect(xml).toContain('<Belegart>8</Belegart>');
    expect(xml).toContain('<Preisliste>13</Preisliste>');
    expect(xml).toContain('<ZahlungskonditionFAKT>3</ZahlungskonditionFAKT>');
  });

  it('lets the caller override an ERP default', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH', Belegart: '10', Preisliste: '7' });
    expect(xml).toContain('<Belegart>10</Belegart>');
    expect(xml).toContain('<Preisliste>7</Preisliste>');
  });

  it('emits every element in XSD sequence order', () => {
    const xml = buildKontenImportXml({
      // deliberately scrambled input order
      Ort: 'Klagenfurt',
      Name: 'Foo GmbH',
      'E-Mail': 'x@y.at',
      Strasse: 'Testgasse 1',
      Postleitzahl: '9020',
    });
    const emitted = tagsOf(xml);
    const expectedOrder = SCHEMA_ORDER.filter(t => emitted.includes(t));
    expect(emitted).toEqual(expectedOrder);
  });

  it('omits optional fields that are empty', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH', Telefon: '', Ort: '   ' });
    expect(xml).not.toContain('<Telefon>');
    expect(xml).not.toContain('<Ort>');
  });

  it('coerces xs:integer fields to bare integers', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH', Kennzeichen: ' 2 ', Preisliste: '13.0' });
    expect(xml).toContain('<Kennzeichen>2</Kennzeichen>');
    expect(xml).toContain('<Preisliste>13</Preisliste>');
  });

  it('maps common aliases onto the canonical XSD tag names', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH', Email: 'x@y.at', Mobiltelefon: '0660 123' });
    expect(xml).toContain('<E-Mail>x@y.at</E-Mail>');
    expect(xml).toContain('<Mobiltelefonnummer>0660 123</Mobiltelefonnummer>');
    expect(xml).not.toContain('<Email>');
    expect(xml).not.toContain('<Mobiltelefon>');
  });

  it('escapes XML-special characters in values', () => {
    const xml = buildKontenImportXml({ Name: 'Müller & Co <GmbH>' });
    expect(xml).toContain('<Name>Müller &amp; Co &lt;GmbH&gt;</Name>');
  });

  it('round-trips an exported customer record back into valid import XML', () => {
    // A record shaped exactly like WebKontenExport returns it.
    const exported = {
      Kontonummer: '233692',
      Name: 'HUMANOMED ZENTRUM ALTHOFEN',
      Strasse: 'MOORWEG 30',
      Postleitzahl: '9330',
      Ort: 'ALTHOFEN',
      Land: 'Österreich',
      Telefon: '04262/2071-580',
      Kennzeichen: '2',
      BKZ1: '1230',
      BKZ1Wechselkonto: '1230',
      ZahlungskonditionFIBU: '2',
      Belegart: '10',
      Preisliste: '13',
      ZahlungskonditionFAKT: '2',
    };
    const xml = buildKontenImportXml(exported);

    // All 9 mandatory fields present, values preserved from the export.
    expect(xml).toContain('<Kontonummer>233692</Kontonummer>');
    expect(xml).toContain('<Name>HUMANOMED ZENTRUM ALTHOFEN</Name>');
    expect(xml).toContain('<ZahlungskonditionFIBU>2</ZahlungskonditionFIBU>');
    expect(xml).toContain('<Belegart>10</Belegart>');
    expect(xml).toContain('<ZahlungskonditionFAKT>2</ZahlungskonditionFAKT>');

    // Order is still schema-valid.
    const emitted = tagsOf(xml);
    expect(emitted).toEqual(SCHEMA_ORDER.filter(t => emitted.includes(t)));
  });
});
