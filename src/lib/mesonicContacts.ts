// Ansprechpartner (Kontakte) eines Kontos aus Mesonic — Type 7, Vorlage
// WEBKontakte, Tabelle T045, gefiltert über C039 = Kontonummer
// (White Paper §3.5.7). Feldzuordnung laut Vorlagen-Definition:
//   Kontaktnummer C063 · Name C001 · Vorname C002 · eMailadresse C025 ·
//   Abteilung C058 · Mobil Land/Vorwahl/Nummer C018/C019/C020
//
// Die Antwort-Elementnamen sind nicht 100 % sicher (Klartext vs. T045_Cxxx),
// daher greift jeder Zugriff über eine Alias-Kette — wie bei den Konten.

import { getCustomerContacts } from './mesonicApi';

export interface Contact {
  kontaktnummer: string;
  name: string;
  vorname: string;
  email: string;
  abteilung: string;
  mobil: string;
}

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export function mapContact(r: Record<string, unknown>): Contact {
  const land = pick(r, 'Mobiltelefon Land', 'MobiltelefonLand', 'T045_C018', 'T045.C018');
  const vorwahl = pick(r, 'Mobiltelefon Vorwahl', 'MobiltelefonVorwahl', 'T045_C019', 'T045.C019');
  const nummer = pick(r, 'Mobiltelefon Nummer', 'MobiltelefonNummer', 'T045_C020', 'T045.C020');
  return {
    kontaktnummer: pick(r, 'Kontaktnummer', 'T045_C063', 'T045.C063'),
    name: pick(r, 'Name', 'T045_C001', 'T045.C001'),
    vorname: pick(r, 'Vorname', 'T045_C002', 'T045.C002'),
    email: pick(r, 'eMailadresse', 'eMailAdresse', 'EMailadresse', 'Email', 'E-Mail', 'T045_C025', 'T045.C025'),
    abteilung: pick(r, 'Abteilung', 'T045_C058', 'T045.C058'),
    mobil: [land, vorwahl, nummer].filter(Boolean).join(' '),
  };
}

export function contactDisplayName(c: Contact): string {
  return [c.vorname, c.name].filter(Boolean).join(' ') || c.email || c.kontaktnummer || 'Kontakt';
}

export async function fetchContacts(kdnr: string): Promise<Contact[]> {
  const res = (await getCustomerContacts(kdnr)) as { records?: Record<string, unknown>[] } | null;
  return (res?.records ?? [])
    .map(mapContact)
    .filter((c) => c.name || c.vorname || c.email || c.mobil);
}
