// WEBAngebot-Import (Type 30, Belegstufe 1 = Angebot) — schreibt ein
// Angebot als WinLine-Beleg. Feldreihenfolge folgt der XSD
// (MESOBelegeWEBAngebot.xsd, xs:sequence) — Reihenfolge ist Pflicht.
//
// Kopf  WEBAngebotT025: BELEGKEY, Kontonummer, Laufnummer, DatumAngebot,
//                       Belegart, Vertreternummer, KontoRechnungsadresse
// Mitte WEBAngebotT026: BELEGKEY, Artikelnummer, Datentyp, Mengegeliefert,
//                       Einzelpreis, Bezeichnung, Zeilenrabatt1
//
// Der Proxy (mesonicImport) legt den <MESOWebService …>-Envelope drum —
// hier NUR die nackten Zeilen erzeugen.
//
// Belegart (seit Heri 2026-09: eigene Import-Belegarten, standortübergreifend):
//   17 = Import Angebot, 18 = Import Reparaturauftrag.
// Der Pseudoartikel-Suffix (KL/WO) hängt weiterhin am Ersteller-/Ticket-
// Standort: Klagenfurt → 99991234KL, Wolfsberg → 99991234WO. Einzelpreis =
// NETTO, Zeilenrabatt1 = Prozent negativ (z. B. -10 für 10 %). Datentyp 1 =
// Artikel folgt, 3 = Text (dann Artikelnummer = 'TEXT').

export const PSEUDO_ARTIKEL = { klagenfurt: '99991234KL', wolfsberg: '99991234WO' } as const;

// KM-Geld hat eine EIGENE Artikelnummer (31100000{KL/WO}), bei der in Mesonic
// die Einheit "km" hinterlegt ist. Der Mitarbeiter-Artikel (30000XX) trägt die
// Einheit STD und würde die km-Menge fälschlich als Stunden ausweisen — daher
// bekommen travel_km-Positionen diesen Artikel statt des Arbeitszeit-Artikels
// (fixiert mit Heri 2026-09).
export const KM_GELD_ARTIKEL = { klagenfurt: '31100000KL', wolfsberg: '31100000WO' } as const;

// Angebot-Import → Belegart 17 (beide Standorte). Map-Form beibehalten, falls
// Mesonic künftig wieder pro Standort splittet.
export const BELEGART = { klagenfurt: '17', wolfsberg: '17' } as const;

// Reparaturauftrag-Import → Belegart 18 (beide Standorte).
export const REPARATUR_BELEGART = { klagenfurt: '18', wolfsberg: '18' } as const;

// Lieferschein-Import → Belegart 19 (beide Standorte, fixiert mit Georg
// 2026-09-09). Gelieferte Ware; landet neben den Reparaturschein-Belegen
// (17/18) auf der Sammel-Faktura des Kontos.
export const LIEFERSCHEIN_BELEGART = { klagenfurt: '19', wolfsberg: '19' } as const;

// Arbeitszeit-Artikelnummer je Mitarbeiter: 300000 + 2-stellige
// Vertreternummer (führende Null) + WO/KL. z. B. Vertreter 9 in Wolfsberg
// → 30000009WO, Vertreter 26 in Klagenfurt → 30000026KL. Zum Buchen der
// Arbeitszeit pro Reparaturschein.
export function laborArtikelnummer(vertreternummer: string | number, standort: 'klagenfurt' | 'wolfsberg'): string {
  const num = String(vertreternummer).replace(/\D/g, '').padStart(2, '0');
  return `300000${num}${standort === 'wolfsberg' ? 'WO' : 'KL'}`;
}

// Stocked articles exist per Standort as KL/WO variants of one base number
// (16030051KL / 16030051WO). Products store the BASE (see products
// .mesonic_artikel_nr); the delivered/repaired line resolves the concrete
// variant from the ticket/delivery Standort so Mesonic decrements the right
// Lager. Strip-then-append is idempotent — a base or an already-suffixed number
// both map to the correct variant. Mirrors baseArticleNumber() in mesonicApi.
export function mesonicArtikelForStandort(artikelNr: string, standort: 'klagenfurt' | 'wolfsberg'): string {
  const base = String(artikelNr).trim().replace(/(KL|WO)$/i, '');
  return `${base}${standort === 'wolfsberg' ? 'WO' : 'KL'}`;
}

export interface AngebotKopf {
  kontonummer: string;
  laufnummer: string | number;    // eindeutig pro Konto (wir vergeben max+1)
  datumAngebot?: string;          // YYYY-MM-DD
  belegart?: string;              // '17' Angebot / '18' Reparaturauftrag
  vertreternummer?: string | number;
  // Abweichender Rechnungsempfänger — ein ANDERES Konto, an das Faktura + OP
  // gehen (WinLine „Konto Rechnungsadresse“, WEBAngebotT025.KontoRechnungsadresse,
  // XSD seit Heri 2026-09). Nur setzen, wenn abweichend vom Konto; leer → WinLine
  // nimmt die Stammdaten-Rechnungsadresse des Kontos. Wert = Kundennummer des
  // Rechnungs-Kontos (aus dem WebKontenExport-Feld Rechnungsempfaenger).
  kontoRechnungsadresse?: string;
  belegkey?: number;              // default 1 (verbindet Kopf ↔ Mitte)
}

// Normalisiert den Rechnungsempfänger fürs Beleg-Feld KontoRechnungsadresse:
// liefert das abweichende Rechnungs-Konto oder undefined, wenn keins gesetzt ist,
// es '0' ist oder dem eigenen Konto entspricht (dann nimmt WinLine ohnehin die
// Stammdaten-Adresse). Spiegelt invoiceRecipientAccount in CrmPage. Pure.
export function invoiceRecipientKonto(
  recipient: string | null | undefined,
  ownKonto: string | null | undefined,
): string | undefined {
  const r = String(recipient ?? '').trim();
  const own = String(ownKonto ?? '').trim();
  if (!r || r === '0' || r === own) return undefined;
  return r;
}

export interface AngebotPosition {
  artikelnummer: string;          // echt | Pseudoartikel | 'TEXT'
  datentyp: '1' | '3';
  menge: number;
  einzelpreis?: number;           // netto
  bezeichnung?: string;
  zeilenrabatt1?: number;         // Prozent, negativ (z. B. -10)
  // Interne Zeilennummer (WEBAngebotT026.Zeilennummerintern, XSD seit Heri
  // 2026-09). NUR fürs Beleg-Editieren (option="3") nötig: sie identifiziert
  // eine bestehende Zeile eindeutig, damit ein Re-Import Zeilen ergänzt statt
  // dupliziert. Beim Neuanlegen (option="0") vergeben wir sie trotzdem (1..N in
  // stabiler Reihenfolge), damit ein späteres Edit dieselben Nummern trifft.
  zeilennummerintern?: number;
}

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
function el(tag: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `  <${tag}>${esc(String(value))}</${tag}>\n`;
}

export interface AngebotImportOpts {
  option?: string;        // §3.6.3: 0 = neuen Beleg erstellen (Default), 3 = editieren, 4 = storno …
  printVoucher?: string;  // 0 = nicht drucken (Default), 1 = Angebot, 2 = Auftrag …
}

// VOLLER MESOWebService-Envelope inkl. Pflicht-Attribut option="0" (neuen
// Beleg erstellen, §3.6.3) — der Proxy erkennt den Envelope und wrappt NICHT
// erneut. Reihenfolge der Felder = XSD-Sequenz.
export function buildAngebotImportXml(
  kopf: AngebotKopf,
  positions: AngebotPosition[],
  opts: AngebotImportOpts = {},
): string {
  const option = opts.option ?? '0';
  const printVoucher = opts.printVoucher ?? '0';
  const bk = kopf.belegkey ?? 1;

  const kopfXml =
    `<WEBAngebotT025>\n` +
    el('BELEGKEY', bk) +
    el('Kontonummer', kopf.kontonummer) +
    el('Laufnummer', kopf.laufnummer) +
    el('DatumAngebot', kopf.datumAngebot) +
    el('Belegart', kopf.belegart) +
    el('Vertreternummer', kopf.vertreternummer) +
    el('KontoRechnungsadresse', kopf.kontoRechnungsadresse) +
    `</WEBAngebotT025>`;

  const posXml = positions
    .map(
      (p) =>
        `<WEBAngebotT026>\n` +
        el('BELEGKEY', bk) +
        el('Artikelnummer', p.artikelnummer) +
        el('Datentyp', p.datentyp) +
        el('Mengegeliefert', p.menge) +
        el('Einzelpreis', p.einzelpreis) +
        el('Bezeichnung', p.bezeichnung) +
        el('Zeilenrabatt1', p.zeilenrabatt1) +
        el('Zeilennummerintern', p.zeilennummerintern) +
        `</WEBAngebotT026>`,
    )
    .join('\n');

  // KEIN <?xml?>-Prolog — WinLines Beleg-Schemaprüfung lehnt ihn ab
  // ("Invalid syntax for an xml declaration"). Nur die MESOWebService-Wurzel.
  return (
    `<MESOWebService TemplateType="30" Template="WEBAngebot" option="${esc(option)}" printVoucher="${esc(printVoucher)}">\n` +
    `${kopfXml}\n${posXml}\n` +
    `</MESOWebService>`
  );
}
