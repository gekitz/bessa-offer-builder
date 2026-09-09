import { describe, it, expect, vi, afterEach } from 'vitest';

// mesonicApi.js imports ./supabase at module load; stub it so the import graph
// resolves in the test environment. buildKontenImportXml itself is pure; the
// import/saveCustomer tests exercise proxyRequest, which needs a session.
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
  },
}));

import {
  buildKontenImportXml,
  buildKontaktImportXml,
  mesonicImport,
  saveCustomer,
  saveContact,
  TYPES,
  TEMPLATES,
} from '../mesonicApi';

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
  'IDNr',
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

  it('maps UID onto the IDNr import element, emitted last in the sequence', () => {
    const xml = buildKontenImportXml({ Name: 'Foo GmbH', UID: 'ATU12345678' });
    expect(xml).toContain('<IDNr>ATU12345678</IDNr>');
    expect(xml).not.toContain('<UID>');
    const emitted = tagsOf(xml);
    expect(emitted[emitted.length - 1]).toBe('IDNr');
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

// Ansprechpartner-Import (Type 7, Vorlage WEBKontakt). Feldnamen/Reihenfolge
// stammen 1:1 aus dem gelieferten XSD (xs:sequence → Reihenfolge erzwungen).
const KONTAKT_SCHEMA_ORDER = [
  'Kontaktnummer',
  'Name',
  'Vorname',
  'eMailadresse',
  'Abteilung',
  'MobiltelefonLand',
  'MobiltelefonVorwahl',
  'MobiltelefonNummer',
  'FibuKontonummer',
];

function kontaktTagsOf(xml: string): string[] {
  return [...xml.matchAll(/<([A-Za-z0-9-]+)>/g)]
    .map(m => m[1])
    .filter(t => t !== 'WEBKontakt');
}

describe('buildKontaktImportXml', () => {
  it('wraps records in <WEBKontakt>', () => {
    const xml = buildKontaktImportXml({ Name: 'Huber' });
    expect(xml.startsWith('<WEBKontakt>')).toBe(true);
    expect(xml.trimEnd().endsWith('</WEBKontakt>')).toBe(true);
  });

  it('defaults Kontaktnummer to "+" for a new (accountless) contact', () => {
    const xml = buildKontaktImportXml({ Name: 'Huber' });
    expect(xml).toContain('<Kontaktnummer>+</Kontaktnummer>');
  });

  it('carries an account-scoped Kontaktnummer "<Konto>-+" through unchanged', () => {
    const xml = buildKontaktImportXml({ Kontaktnummer: '29385-+', Name: 'Huber' });
    expect(xml).toContain('<Kontaktnummer>29385-+</Kontaktnummer>');
    expect(xml).not.toContain('<Kontaktnummer>+</Kontaktnummer>');
  });

  it('emits fields in XSD sequence order regardless of input order', () => {
    const xml = buildKontaktImportXml({
      FibuKontonummer: '29385',
      MobiltelefonNummer: '1234567',
      Name: 'Huber',
      eMailadresse: 'a@b.at',
      Vorname: 'Anna',
    });
    const emitted = kontaktTagsOf(xml);
    expect(emitted).toEqual(KONTAKT_SCHEMA_ORDER.filter(t => emitted.includes(t)));
  });

  it('carries the FibuKontonummer account link', () => {
    const xml = buildKontaktImportXml({ Kontaktnummer: '29385-+', Name: 'Huber', FibuKontonummer: '29385' });
    expect(xml).toContain('<FibuKontonummer>29385</FibuKontonummer>');
  });

  it('omits empty optional fields', () => {
    const xml = buildKontaktImportXml({ Name: 'Huber', eMailadresse: '', Abteilung: '   ' });
    expect(xml).not.toContain('<eMailadresse>');
    expect(xml).not.toContain('<Abteilung>');
  });

  it('maps aliases (E-Mail/Email/Nachname) onto canonical XSD tag names', () => {
    const xml = buildKontaktImportXml({ Nachname: 'Huber', 'E-Mail': 'a@b.at' });
    expect(xml).toContain('<Name>Huber</Name>');
    expect(xml).toContain('<eMailadresse>a@b.at</eMailadresse>');
    expect(xml).not.toContain('<Nachname>');
    expect(xml).not.toContain('<E-Mail>');
  });

  it('keeps the three mobile fields separate', () => {
    const xml = buildKontaktImportXml({
      Name: 'Huber', MobiltelefonLand: '43', MobiltelefonVorwahl: '664', MobiltelefonNummer: '1234567',
    });
    expect(xml).toContain('<MobiltelefonLand>43</MobiltelefonLand>');
    expect(xml).toContain('<MobiltelefonVorwahl>664</MobiltelefonVorwahl>');
    expect(xml).toContain('<MobiltelefonNummer>1234567</MobiltelefonNummer>');
  });

  it('escapes XML-special characters in values', () => {
    const xml = buildKontaktImportXml({ Name: 'Müller & <Co>' });
    expect(xml).toContain('<Name>Müller &amp; &lt;Co&gt;</Name>');
  });
});

describe('mesonicImport / saveContact — KeyValue parsing', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubProxyResult(result: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result }),
    })));
  }

  const wrap = (details: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><MESOWebServiceResult>` +
    `<OverallSuccess>true</OverallSuccess><ResultDetails>${details}</ResultDetails>` +
    `</MESOWebServiceResult>`;

  it('throws when the mandatory Name is missing', async () => {
    await expect(saveContact({ Vorname: 'Anna' })).rejects.toThrow(/Name/);
  });

  it('returns the assigned Kontaktnummer from <KeyValue> on create', async () => {
    stubProxyResult(wrap('<KeyValue>7</KeyValue><Success>true</Success>'));
    const res = await saveContact({ Vorname: 'Anna', Name: 'Huber' });
    expect(res.success).toBe(true);
    expect(res.kontaktnummer).toBe('7');
  });

  it('treats a "+" KeyValue (validate-only) as no assigned number', async () => {
    stubProxyResult(wrap('<KeyValue>+</KeyValue><Success>true</Success>'));
    const res = await saveContact({ Name: 'Huber' }, { actionCode: 0 });
    expect(res.success).toBe(true);
    expect(res.kontaktnummer).toBeNull();
  });

  it('surfaces WinLine errors from the import', async () => {
    stubProxyResult(
      `<MESOWebServiceResult><OverallSuccess>false</OverallSuccess><ResultDetails>` +
      `<ErrorCode>000161</ErrorCode><ErrorText>Kein Datensatz</ErrorText></ResultDetails></MESOWebServiceResult>`,
    );
    const res = await saveContact({ Name: 'Huber' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('000161');
  });
});

describe('mesonicImport / saveCustomer — KeyValue parsing', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubProxyResult(result: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result }),
    })));
  }

  const wrap = (details: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><MESOWebServiceResult>` +
    `<OverallSuccess>true</OverallSuccess><ResultDetails>${details}</ResultDetails>` +
    `</MESOWebServiceResult>`;

  it('extracts the assigned Kontonummer from <KeyValue> on create', async () => {
    stubProxyResult(wrap('<KeyValue>238584</KeyValue><ImportRecordID>+</ImportRecordID><Success>true</Success>'));
    const res = await saveCustomer({ Name: 'Foo GmbH' });
    expect(res.success).toBe(true);
    expect(res.keyValue).toBe('238584');
    expect(res.kundennummer).toBe('238584');
  });

  it('treats a "+" KeyValue (validate-only) as no assigned number', async () => {
    stubProxyResult(wrap('<KeyValue>+</KeyValue><Success>true</Success>'));
    const res = await saveCustomer({ Name: 'Foo GmbH' });
    expect(res.success).toBe(true);
    expect(res.kundennummer).toBeNull();
  });

  it('echoes the existing Kontonummer on an edit', async () => {
    stubProxyResult(wrap('<KeyValue>29385</KeyValue><Success>true</Success>'));
    const res = await saveCustomer({ Kontonummer: '29385', Name: 'Foo GmbH' });
    expect(res.kundennummer).toBe('29385');
  });

  it('surfaces WinLine errors without a KeyValue', async () => {
    stubProxyResult(
      `<MESOWebServiceResult><OverallSuccess>false</OverallSuccess><ResultDetails>` +
      `<ErrorCode>000161</ErrorCode><ErrorText>Kein Datensatz</ErrorText></ResultDetails></MESOWebServiceResult>`,
    );
    const res = await mesonicImport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_IMPORT, '<WebKontenImport><Name>x</Name></WebKontenImport>');
    expect(res.success).toBe(false);
    expect(res.error).toContain('000161');
    expect(res.keyValue).toBeUndefined();
  });
});
