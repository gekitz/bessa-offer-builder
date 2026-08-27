import { describe, it, expect } from 'vitest';
import { extractContact } from '../mesonicContact';

describe('extractContact', () => {
  it('reads plain-text Mesonic keys', () => {
    expect(extractContact({
      Email: 'wirt@example.at',
      Telefon: '04212 1234',
      Mobiltelefon: '0664 111',
      Ansprechpartner: 'Martina',
    })).toEqual({
      email: 'wirt@example.at',
      phone: '04212 1234',
      mobile: '0664 111',
      contact: 'Martina',
    });
  });

  it('falls back to column keys (T055_C0xx) when plain names are absent', () => {
    expect(extractContact({ T055_C013: 'a@b.at', T055_C011: '123' })).toMatchObject({
      email: 'a@b.at',
      phone: '123',
    });
  });

  it('treats empty/whitespace as missing and trims', () => {
    expect(extractContact({ Email: '  ', 'E-Mail': '  x@y.at ' }).email).toBe('x@y.at');
  });

  it('returns all-null for a missing record', () => {
    expect(extractContact(null)).toEqual({ email: null, phone: null, mobile: null, contact: null });
    expect(extractContact({})).toEqual({ email: null, phone: null, mobile: null, contact: null });
  });
});
