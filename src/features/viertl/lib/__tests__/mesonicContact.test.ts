import { describe, it, expect } from 'vitest';
import { extractContact } from '../mesonicContact';

describe('extractContact', () => {
  it('reads plain-text Mesonic keys', () => {
    expect(extractContact({
      Email: 'wirt@example.at',
      Telefon: '04212 1234',
      Mobiltelefon: '0664 111',
      Ansprechpartner: 'Martina',
      Strasse: 'Hauptstr. 1',
      Postleitzahl: '9020',
      Ort: 'Klagenfurt',
    })).toEqual({
      email: 'wirt@example.at',
      phone: '04212 1234',
      mobile: '0664 111',
      contact: 'Martina',
      street: 'Hauptstr. 1',
      plz: '9020',
      ort: 'Klagenfurt',
    });
  });

  it('falls back to column keys (T055_C0xx) when plain names are absent', () => {
    expect(extractContact({ T055_C013: 'a@b.at', T055_C011: '123', T055_C008: '9500', T055_C009: 'Villach' })).toMatchObject({
      email: 'a@b.at',
      phone: '123',
      plz: '9500',
      ort: 'Villach',
    });
  });

  it('reads the address (street/plz/ort) like the CRM view', () => {
    expect(extractContact({ Strasse: 'Dorf 7', PLZ: '9843', Stadt: 'Großkirchheim' })).toMatchObject({
      street: 'Dorf 7',
      plz: '9843',
      ort: 'Großkirchheim',
    });
  });

  it('treats empty/whitespace as missing and trims', () => {
    expect(extractContact({ Email: '  ', 'E-Mail': '  x@y.at ' }).email).toBe('x@y.at');
  });

  it('returns all-null for a missing record', () => {
    const empty = { email: null, phone: null, mobile: null, contact: null, street: null, plz: null, ort: null };
    expect(extractContact(null)).toEqual(empty);
    expect(extractContact({})).toEqual(empty);
  });
});
