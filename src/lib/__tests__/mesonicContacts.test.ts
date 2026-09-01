import { describe, it, expect } from 'vitest';
import { mapContact, contactDisplayName } from '../mesonicContacts';

describe('mapContact', () => {
  it('maps T045 column keys', () => {
    const c = mapContact({
      T045_C063: '5', T045_C001: 'Huber', T045_C002: 'Anna',
      T045_C025: 'anna@wirt.at', T045_C058: 'Einkauf',
      T045_C018: '43', T045_C019: '664', T045_C020: '1234567',
    });
    expect(c).toEqual({
      kontaktnummer: '5', name: 'Huber', vorname: 'Anna',
      email: 'anna@wirt.at', abteilung: 'Einkauf', mobil: '43 664 1234567',
    });
  });

  it('falls back to plain field labels and trims', () => {
    const c = mapContact({ Name: ' Karner ', Vorname: 'Josef', eMailadresse: 'j@k.at' });
    expect(c).toMatchObject({ name: 'Karner', vorname: 'Josef', email: 'j@k.at' });
  });

  it('joins only the mobile parts that are present', () => {
    expect(mapContact({ T045_C019: '664', T045_C020: '999' }).mobil).toBe('664 999');
    expect(mapContact({ Name: 'X' }).mobil).toBe('');
  });
});

describe('contactDisplayName', () => {
  it('prefers "Vorname Name", else email/number', () => {
    expect(contactDisplayName(mapContact({ Vorname: 'Anna', Name: 'Huber' }))).toBe('Anna Huber');
    expect(contactDisplayName(mapContact({ eMailadresse: 'a@b.at' }))).toBe('a@b.at');
  });
});
