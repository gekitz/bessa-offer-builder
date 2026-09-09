import { describe, it, expect, vi, beforeEach } from 'vitest';

// saveContact ist die Schreibschiene (Netzwerk) — für createContact-Tests
// mocken wir sie und prüfen nur die Feld-Abbildung UI → Mesonic-Tags.
const { saveContactMock } = vi.hoisted(() => ({ saveContactMock: vi.fn() }));
vi.mock('../mesonicApi', () => ({
  getCustomerContacts: vi.fn(),
  saveContact: saveContactMock,
}));

import { mapContact, contactDisplayName, combineCompanyContact, createContact, updateContact } from '../mesonicContacts';

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

describe('combineCompanyContact', () => {
  it('appends the person to an existing company', () => {
    expect(combineCompanyContact('Wirt GmbH', 'Anna Huber')).toBe('Wirt GmbH · Anna Huber');
  });
  it('returns just the person when there is no existing value', () => {
    expect(combineCompanyContact('', 'Anna Huber')).toBe('Anna Huber');
    expect(combineCompanyContact(null, 'Anna Huber')).toBe('Anna Huber');
  });
  it('does not duplicate when the person is already present', () => {
    expect(combineCompanyContact('Anna Huber', 'Anna Huber')).toBe('Anna Huber');
    expect(combineCompanyContact('Wirt GmbH · Anna Huber', 'Anna Huber')).toBe('Wirt GmbH · Anna Huber');
  });
  it('keeps the existing value when no person is given', () => {
    expect(combineCompanyContact('Wirt GmbH', '')).toBe('Wirt GmbH');
  });
});

describe('createContact', () => {
  beforeEach(() => saveContactMock.mockReset().mockResolvedValue({ success: true, kontaktnummer: '7' }));

  it('links the contact to the account via Kontaktnummer "<kdnr>-+" and maps fields', async () => {
    await createContact('29385', {
      vorname: 'Anna', name: 'Huber', email: 'a@b.at', mobil: '0664 111', abteilung: 'Einkauf',
    });
    expect(saveContactMock).toHaveBeenCalledWith({
      Kontaktnummer: '29385-+',
      Name: 'Huber',
      Vorname: 'Anna',
      eMailadresse: 'a@b.at',
      Abteilung: 'Einkauf',
      MobiltelefonNummer: '0664 111',
    });
  });

  it('trims the account number and forwards the save result', async () => {
    const res = await createContact('  29385  ', { vorname: ' Anna ', name: ' Huber ' });
    expect(saveContactMock).toHaveBeenCalledWith(expect.objectContaining({
      Kontaktnummer: '29385-+', Vorname: 'Anna', Name: 'Huber',
    }));
    expect(res).toEqual({ success: true, kontaktnummer: '7' });
  });
});

describe('updateContact', () => {
  beforeEach(() => saveContactMock.mockReset().mockResolvedValue({ success: true, kontaktnummer: '29385-7' }));

  const original = mapContact({
    T045_C063: '29385-7', T045_C001: 'Huber', T045_C002: 'Anna',
    T045_C025: 'anna@wirt.at', T045_C058: 'Einkauf', T045_C020: '1234567',
  });

  it('keys the update on the existing Kontaktnummer and always sends Name', async () => {
    await updateContact(original, { vorname: 'Anna', name: 'Huber', email: 'neu@wirt.at' });
    const arg = saveContactMock.mock.calls[0][0];
    expect(arg.Kontaktnummer).toBe('29385-7');
    expect(arg.Name).toBe('Huber');
  });

  it('sends only the optional fields that actually changed', async () => {
    await updateContact(original, {
      vorname: 'Anna', name: 'Huber', email: 'neu@wirt.at', mobil: '1234567', abteilung: 'Einkauf',
    });
    const arg = saveContactMock.mock.calls[0][0];
    // email changed → included; vorname/abteilung/mobil unchanged → omitted
    expect(arg.eMailadresse).toBe('neu@wirt.at');
    expect(arg).not.toHaveProperty('Vorname');
    expect(arg).not.toHaveProperty('Abteilung');
    expect(arg).not.toHaveProperty('MobiltelefonNummer');
  });

  it('throws when the contact has no Kontaktnummer (no update key)', async () => {
    const keyless = mapContact({ Name: 'Huber' });
    await expect(updateContact(keyless, { name: 'Huber', vorname: '' })).rejects.toThrow(/Kontaktnummer/);
    expect(saveContactMock).not.toHaveBeenCalled();
  });
});
