// Ansprechpartner (Kontakte) eines Kontos aus Mesonic — Type 7, Vorlage
// WEBKontakte, Tabelle T045, gefiltert über C039 = Kontonummer
// (White Paper §3.5.7). Feldzuordnung laut Vorlagen-Definition:
//   Kontaktnummer C063 · Name C001 · Vorname C002 · eMailadresse C025 ·
//   Abteilung C058 · Mobil Land/Vorwahl/Nummer C018/C019/C020
//
// Die Antwort-Elementnamen sind nicht 100 % sicher (Klartext vs. T045_Cxxx),
// daher greift jeder Zugriff über eine Alias-Kette — wie bei den Konten.

import { getCustomerContacts, saveContact } from './mesonicApi';

export interface Contact {
  kontaktnummer: string;
  name: string;
  vorname: string;
  email: string;
  abteilung: string;
  mobil: string;
}

export interface NewContactInput {
  vorname: string;
  name: string;
  email?: string;
  mobil?: string;
  abteilung?: string;
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

// Kombiniert einen bestehenden Firmen-/Namenswert mit einem Ansprechpartner,
// ohne Doppelungen — für Felder, die (anders als das Angebot) Firma UND Person
// in einer Zeile führen (z. B. das Ticket-Feld "Name / Firma").
export function combineCompanyContact(existing: string | null | undefined, person: string): string {
  const e = (existing ?? '').trim();
  const p = (person ?? '').trim();
  if (!p) return e;
  if (!e || e === p || e.includes(p)) return e || p;
  return `${e} · ${p}`;
}

export async function fetchContacts(kdnr: string): Promise<Contact[]> {
  const res = (await getCustomerContacts(kdnr)) as { records?: Record<string, unknown>[] } | null;
  return (res?.records ?? [])
    .map(mapContact)
    .filter((c) => c.name || c.vorname || c.email || c.mobil);
}

// UI-Feldnamen → XSD-Tag-Namen. Ein einzelnes Mobil-Feld der UI landet in
// MobiltelefonNummer (Land/Vorwahl bleiben leer — freier Text lässt sich nicht
// verlässlich zerlegen).
function contactFields(input: NewContactInput) {
  return {
    Name: input.name?.trim(),
    Vorname: input.vorname?.trim(),
    eMailadresse: input.email?.trim(),
    Abteilung: input.abteilung?.trim(),
    MobiltelefonNummer: input.mobil?.trim(),
  };
}

// Konto aus der Kontaktnummer "<Konto>-<Laufnummer>" (z. B. "232467-2" → "232467",
// "230A001-COMP" → "230A001"). Für die FibuKontonummer beim Bearbeiten.
function accountFromKontaktnummer(kontaktnummer: string): string {
  const k = String(kontaktnummer).trim();
  const i = k.lastIndexOf('-');
  return i > 0 ? k.slice(0, i) : k;
}

// Legt einen Ansprechpartner in Mesonic an (Type 7, Vorlage WEBKontakt). Die
// Verknüpfung zum Konto läuft über FibuKontonummer (Pflicht für Persistenz);
// die Kontaktnummer "<Kontonummer>-+" vergibt die nächste freie Laufnummer.
export async function createContact(kdnr: string, input: NewContactInput) {
  const konto = String(kdnr).trim();
  return saveContact({ Kontaktnummer: `${konto}-+`, FibuKontonummer: konto, ...contactFields(input) });
}

// Ändert einen bestehenden Ansprechpartner. Schlüssel ist die vorhandene
// Kontaktnummer (z. B. "230A001-7") — ein konkreter Wert statt "-+" bedeutet
// für WinLine "diesen Datensatz aktualisieren" (analog Konten/Belege).
//
// Es werden NUR tatsächlich geänderte optionale Felder mitgeschickt; unveränderte
// bleiben in WinLine unangetastet (leere Werte können via XML ohnehin nicht
// gelöscht werden). Name (Pflicht) wird immer gesetzt.
export async function updateContact(original: Contact, input: NewContactInput) {
  if (!original.kontaktnummer?.trim()) {
    throw new Error('updateContact: Kontaktnummer fehlt – Bearbeiten nicht möglich');
  }
  const fields: Record<string, string | undefined> = {
    Kontaktnummer: original.kontaktnummer.trim(),
    // Konto-Verknüpfung mitschicken, damit sie beim Update erhalten bleibt.
    FibuKontonummer: accountFromKontaktnummer(original.kontaktnummer),
    Name: (input.name ?? '').trim(),
  };
  const vorname = (input.vorname ?? '').trim();
  const email = (input.email ?? '').trim();
  const abteilung = (input.abteilung ?? '').trim();
  const mobil = (input.mobil ?? '').trim();
  if (vorname !== original.vorname) fields.Vorname = vorname;
  if (email !== original.email) fields.eMailadresse = email;
  if (abteilung !== original.abteilung) fields.Abteilung = abteilung;
  if (mobil !== original.mobil) fields.MobiltelefonNummer = mobil;
  return saveContact(fields);
}
