// WEBAngebot-Import (Type 30, Belegstufe 1 = Angebot) — schreibt ein
// Angebot als WinLine-Beleg. Feldreihenfolge folgt der XSD
// (MESOBelegeWEBAngebot.xsd, xs:sequence) — Reihenfolge ist Pflicht.
//
// Kopf  WEBAngebotT025: BELEGKEY, Kontonummer, Laufnummer, DatumAngebot,
//                       Belegart, Vertreternummer
// Mitte WEBAngebotT026: BELEGKEY, Artikelnummer, Datentyp, Mengegeliefert,
//                       Einzelpreis, Bezeichnung, Zeilenrabatt1
//
// Der Proxy (mesonicImport) legt den <MESOWebService …>-Envelope drum —
// hier NUR die nackten Zeilen erzeugen.
//
// Standort-abhängig (vom Ersteller): Klagenfurt → Belegart 8 + Pseudoartikel
// 99991234KL, Wolfsberg → Belegart 1 + 99991234WO. Einzelpreis = NETTO,
// Zeilenrabatt1 = Prozent negativ (z. B. -10 für 10 %). Datentyp 1 = Artikel
// folgt, 3 = Text (dann Artikelnummer = 'TEXT').

export const PSEUDO_ARTIKEL = { klagenfurt: '99991234KL', wolfsberg: '99991234WO' } as const;
export const BELEGART = { klagenfurt: '8', wolfsberg: '1' } as const;

export interface AngebotKopf {
  kontonummer: string;
  laufnummer: string | number;    // eindeutig pro Konto (wir vergeben max+1)
  datumAngebot?: string;          // YYYY-MM-DD
  belegart?: string;              // '8' KL / '1' WO
  vertreternummer?: string | number;
  belegkey?: number;              // default 1 (verbindet Kopf ↔ Mitte)
}

export interface AngebotPosition {
  artikelnummer: string;          // echt | Pseudoartikel | 'TEXT'
  datentyp: '1' | '3';
  menge: number;
  einzelpreis?: number;           // netto
  bezeichnung?: string;
  zeilenrabatt1?: number;         // Prozent, negativ (z. B. -10)
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
