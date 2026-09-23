// Accepted offer → WinLine-Angebot (Belegart 17). Reiner Datentransform,
// keine Supabase-/Netzwerk-Aufrufe — die eigentliche Mesonic-Mechanik
// (Session, Import) macht die Edge-Funktion export-offer-angebot über den
// mesonic-proxy.
//
// Warum ein eigener, self-contained Envelope statt
// offers/lib/angebotImport.ts?  Diese Datei wird von einer Deno-Edge-Funktion
// gebündelt (supabase/functions/…), die NICHT nach ../../src importieren kann.
// Sie ist deshalb — wie _shared/planPricing.ts — bewusst dependency-frei und
// spiegelt die XSD-Feldreihenfolge von angebotImport.ts. Ein Konsistenztest
// pinnt beide gegeneinander, falls sich das Schema ändert.
//
// Geldmodell (fixiert; von Tests gepinnt):
//   • Der Beleg ist in zwei Abschnitte gegliedert, gespiegelt vom Angebots-PDF:
//     „Laufende Kosten“ (Überschrift) → laufende Zeilen, dann eine Leerzeile,
//     „Einmalige Kosten“ (Überschrift) → einmalige Zeilen. Überschriften und
//     Leerzeile sind Datentyp-3-Textzeilen (ohne Preis).
//   • Laufende Zeilen: Menge = Laufzeit in Monaten (aus dem Tier), Einzelpreis =
//     Zeilen-Monatspreis (Stück × Einzel). Gesamt = Monate × Monatspreis, d. h.
//     die Software über die ganze Laufzeit (Software × Laufzeit). Stückzahl > 1
//     steht als „(N×)“ im Text, weil die Menge-Spalte die Monate zeigt.
//   • Einmalige Zeilen: Menge = Stück, Einzelpreis = Einzelpreis.
//   • Preis-tragende Zeilen laufen über den Pseudoartikel 99991234{KL/WO}
//     (Datentyp 1 = "Artikel folgt"). Datentyp 3 ("Text") wäre eine reine
//     Kommentarzeile: WinLine druckt darauf WEDER Menge NOCH Preis (live
//     gesehen). Der Pseudoartikel trägt Freitext-Bezeichnung UND Preis, exakt
//     wie der live-verifizierte Reparaturschein (repairOrderBeleg.ts). Aktions-
//     Splits (voller Preis + Aktionspreis) werden als zwei Positionen abgebildet.
//   • Ein globaler Rabatt (rabattActive) und eine Hardware-Rücknahme
//     (takeBack) werden als EIGENE negative Positionen ausgewiesen —
//     nicht in die Zeilenpreise eingerechnet (so wollte es Georg).
//   • Alt-Angebote ohne eingefrorenen lineSnapshot fallen auf Summen-Zeilen
//     aus dem acceptSnapshot zurück (Laufende: Laufzeit × Monatssumme /
//     Einmalige: Summe), damit sie trotzdem auffindbar in Mesonic landen.
//   • Der KL/WO-Suffix des Pseudoartikels folgt dem Standort des Angebots-
//     Erstellers (offers.creator_id → employees.standort_id); Default
//     Klagenfurt, falls nicht auflösbar.

// ── Belegart & Konstanten (gespiegelt, dependency-frei) ──────────────────
// Angebot-Import → Belegart 17 (beide Standorte). Siehe angebotImport.ts.
export const OFFER_BELEGART = '17';
// Globaler Rabatt = 2 % auf die Laufzeitsumme. Spiegelt RABATT_PCT in
// _shared/planPricing.ts (dort die Single Source of Truth fürs Charging).
export const RABATT_PCT = 0.02;

// Pseudoartikel für Freitext-Positionen MIT Preis — je Standort eine
// KL/WO-Ausprägung. Gespiegelt aus offers/lib/angebotImport.ts (dort die
// Single Source of Truth); hier dependency-frei kopiert, da diese Datei von
// einer Deno-Edge-Funktion gebündelt wird und nicht nach ../../src importiert.
export const PSEUDO_ARTIKEL = { klagenfurt: '99991234KL', wolfsberg: '99991234WO' } as const;
export type MesonicStandort = 'klagenfurt' | 'wolfsberg';

// standorte-Seed (create_workforce.sql): 1 = Klagenfurt, 2 = Wolfsberg.
// Spiegelt standortFromId in tickets/lib/repairOrderBeleg.ts.
export function standortFromId(id: number | null | undefined): MesonicStandort {
  return id === 2 ? 'wolfsberg' : 'klagenfurt';
}
// Mirrors src/data/tiers.ts TIER_MONTHS (dependency-frei gehalten). Treibt die
// Menge (= Laufzeit in Monaten) der laufenden Positionen im Beleg.
const TIER_MONTHS: Record<string, number> = {
  '12mo': 12,
  '6mo': 6,
  '2mo': 2,
  event: 1,
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Frozen line snapshot (offer_data.lineSnapshot) ───────────────────────
// Eingefroren beim Speichern (OfferBuilderPage), analog acceptSnapshot: der
// Server rekonstruiert so KEINE Preise (Katalog ist RLS-gesperrt), sondern
// liest die zum Sendezeitpunkt gültigen Netto-Zeilenpreise direkt.
export interface OfferLineSnapshot {
  name: string;
  code?: string;
  qty: number;            // voller Preis
  discountQty: number;    // Aktionspreis-Menge
  unitPrice: number;      // netto, voll
  discountPrice: number;  // netto, Aktion
  monthly: boolean;
  tier?: string;          // '12mo' | '6mo' | '2mo' | 'event'
}

// Summen-/Konditionsteil (aus acceptSnapshot + offer_data), für die
// Rabatt-/Rücknahme-Zeilen und den Alt-Angebot-Fallback.
export interface OfferBelegSummary {
  periodTotal: number;    // Netto-Laufzeitsumme (acceptSnapshot.periodTotal)
  monthly: number;        // Netto mtl. (acceptSnapshot.monthly)
  once: number;           // Netto einmalig (acceptSnapshot.once)
  maxMonths: number;      // längste Laufzeit (acceptSnapshot.maxMonths)
  takeBack: number;       // Hardware-Rücknahme, netto ≥ 0
  rabattActive: boolean;  // globaler 2%-Rabatt aktiv
}

export interface AngebotPosition {
  // Datentyp 1 → Pseudoartikel 99991234{KL/WO}, trägt Menge + Einzelpreis im
  // Druck. Datentyp 3 → 'TEXT', reine Textzeile (Abschnitts-Überschrift /
  // Leerzeile) OHNE Menge/Preis.
  artikelnummer: string;
  datentyp: '1' | '3';
  menge?: number;
  einzelpreis?: number;    // netto (negativ bei Gutschrift/Rabatt)
  bezeichnung: string;
}

export interface AngebotKopf {
  kontonummer: string;
  laufnummer: string | number;
  datumAngebot?: string;      // YYYY-MM-DD — Annahmedatum
  vertreternummer?: string | number;
  // Abweichender Rechnungsempfänger (WEBAngebotT025.KontoRechnungsadresse) — ein
  // anderes Konto, an das Faktura + OP gehen. Nur setzen, wenn abweichend vom
  // Konto; leer → WinLine nimmt die Stammdaten-Rechnungsadresse. Spiegelt
  // angebotImport.ts.
  kontoRechnungsadresse?: string;
}

// Spiegelt invoiceRecipientKonto in angebotImport.ts (dependency-frei kopiert, da
// diese Datei von einer Deno-Edge-Funktion gebündelt wird). Liefert das abweichende
// Rechnungs-Konto oder undefined (leer / '0' / gleich dem eigenen Konto).
export function invoiceRecipientKonto(
  recipient: string | null | undefined,
  ownKonto: string | null | undefined,
): string | undefined {
  const r = String(recipient ?? '').trim();
  const own = String(ownKonto ?? '').trim();
  if (!r || r === '0' || r === own) return undefined;
  return r;
}

// Bezeichnung einer Positionszeile: optionaler Code-Präfix + Name. Stückzahl >1
// wird als "(N×)" ergänzt — bei laufenden Zeilen zeigt die Menge die Laufzeit
// (Monate), nicht die Stück, deshalb wandert die Stückzahl in den Text.
function baseName(l: OfferLineSnapshot): string {
  return l.code ? `${l.code} ${l.name}` : l.name;
}
function withCount(name: string, count: number): string {
  return count > 1 ? `${name} (${count}×)` : name;
}

// Priced line on the pseudo-article (Datentyp 1 → Menge + Preis are printed).
function priced(artikel: string, menge: number, einzelpreis: number, bezeichnung: string): AngebotPosition {
  return { artikelnummer: artikel, datentyp: '1', menge, einzelpreis, bezeichnung };
}
// Pure text line (Datentyp 3 → 'TEXT'): section header or spacer. Menge 1 /
// Preis 0 werden MITGEGEBEN (nicht weggelassen) — exakt wie der live-
// verifizierte Leih-Lieferschein (loanBeleg.ts). Eine Belegzeile OHNE
// Mengegeliefert lässt den Import generisch scheitern (Fehler 300008).
// Datentyp 3 druckt Menge/Preis ohnehin nicht.
function text(bezeichnung: string): AngebotPosition {
  return { artikelnummer: 'TEXT', datentyp: '3', menge: 1, einzelpreis: 0, bezeichnung };
}

// Eine laufende Zeile → Menge = Laufzeit (Monate aus dem Tier), Einzelpreis =
// Zeilen-Monatspreis (Stück × Einzel). So ergibt Gesamt = Monate × Monatspreis,
// d. h. die Software-Kosten über die ganze Laufzeit. Aktions-Split → 2 Zeilen.
function monthlyPositions(l: OfferLineSnapshot, artikel: string): AngebotPosition[] {
  const out: AngebotPosition[] = [];
  const months = (l.tier && TIER_MONTHS[l.tier]) || 12;
  const name = baseName(l);
  if (l.qty > 0 && l.unitPrice !== 0) {
    out.push(priced(artikel, months, round2(l.unitPrice * l.qty), withCount(name, l.qty)));
  }
  if (l.discountQty > 0 && l.discountPrice !== 0) {
    out.push(priced(artikel, months, round2(l.discountPrice * l.discountQty), `${withCount(name, l.discountQty)} (Aktionspreis)`));
  }
  return out;
}

// Eine einmalige Zeile → Menge = Stück, Einzelpreis = Einzelpreis. Split → 2.
function oncePositions(l: OfferLineSnapshot, artikel: string): AngebotPosition[] {
  const out: AngebotPosition[] = [];
  const name = baseName(l);
  if (l.qty > 0 && l.unitPrice !== 0) {
    out.push(priced(artikel, l.qty, round2(l.unitPrice), name));
  }
  if (l.discountQty > 0 && l.discountPrice !== 0) {
    out.push(priced(artikel, l.discountQty, round2(l.discountPrice), `${name} (Aktionspreis)`));
  }
  return out;
}

// Eine Angebotszeile → 1–2 Positionen. Laufend (monatlich) vs. einmalig teilen
// sich Menge/Preis-Logik. Menge 0 / Preis 0 werden übersprungen.
export function lineToBelegPositions(
  l: OfferLineSnapshot,
  standort: MesonicStandort = 'klagenfurt',
): AngebotPosition[] {
  const artikel = PSEUDO_ARTIKEL[standort];
  return l.monthly ? monthlyPositions(l, artikel) : oncePositions(l, artikel);
}

// Alle Positionen eines Angebots, in Abschnitte gegliedert:
//   „Laufende Kosten“ (Überschrift) → laufende Zeilen
//   (Leerzeile)
//   „Einmalige Kosten“ (Überschrift) → einmalige Zeilen
//   → Rabatt → Rücknahme
// Überschriften/Leerzeile sind Datentyp-3-Textzeilen (ohne Preis). Ein Abschnitt
// erscheint nur, wenn er Zeilen hat.
export function offerToBelegPositions(
  lines: OfferLineSnapshot[],
  summary: OfferBelegSummary,
  standort: MesonicStandort = 'klagenfurt',
): AngebotPosition[] {
  const artikel = PSEUDO_ARTIKEL[standort];

  let monthly: AngebotPosition[] = [];
  let once: AngebotPosition[] = [];

  if (lines.length > 0) {
    for (const l of lines) {
      const target = l.monthly ? monthly : once;
      target.push(...lineToBelegPositions(l, standort));
    }
  } else {
    // Fallback für Alt-Angebote ohne lineSnapshot: Summen aus dem acceptSnapshot
    // als lesbare Zeilen — laufend als Laufzeit × Monatssumme, damit die
    // Gliederung identisch ist.
    if (summary.monthly > 0) {
      monthly.push(priced(artikel, summary.maxMonths || 12, round2(summary.monthly), 'Monatliche Positionen'));
    }
    if (summary.once > 0) {
      once.push(priced(artikel, 1, round2(summary.once), 'Einmalige Positionen'));
    }
  }

  const positions: AngebotPosition[] = [];
  if (monthly.length > 0) {
    positions.push(text('Laufende Kosten'));
    positions.push(...monthly);
  }
  if (once.length > 0) {
    if (monthly.length > 0) positions.push(text(' ')); // Leerzeile zwischen den Blöcken
    positions.push(text('Einmalige Kosten'));
    positions.push(...once);
  }

  // Globaler Rabatt als eigene negative Zeile (2 % auf die Laufzeitsumme).
  if (summary.rabattActive && summary.periodTotal > 0) {
    const rabatt = round2(summary.periodTotal * RABATT_PCT);
    if (rabatt > 0) {
      positions.push(priced(artikel, 1, -rabatt, 'Rabatt 2 % auf Laufzeitsumme'));
    }
  }

  // Hardware-Rücknahme als eigene Gutschrift-Zeile.
  if (summary.takeBack > 0) {
    positions.push(priced(artikel, 1, -round2(summary.takeBack), 'Hardware-Rücknahme (Gutschrift)'));
  }

  return positions;
}

// ── XML-Envelope (spiegelt buildAngebotImportXml in angebotImport.ts) ─────
function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
function el(tag: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `  <${tag}>${esc(String(value))}</${tag}>\n`;
}

// Voller MESOWebService-Envelope (TemplateType 30, Template WEBAngebot),
// Belegart 17. KEIN <?xml?>-Prolog (WinLine lehnt ihn ab). Der mesonic-proxy
// erkennt den Envelope und wrappt NICHT erneut. Feldreihenfolge = XSD-Sequenz.
export function buildOfferAngebotXml(
  kopf: AngebotKopf,
  positions: AngebotPosition[],
): string {
  const bk = 1; // verbindet Kopf ↔ Mitte
  const kopfXml =
    `<WEBAngebotT025>\n` +
    el('BELEGKEY', bk) +
    el('Kontonummer', kopf.kontonummer) +
    el('Laufnummer', kopf.laufnummer) +
    el('DatumAngebot', kopf.datumAngebot) +
    el('Belegart', OFFER_BELEGART) +
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
        `</WEBAngebotT026>`,
    )
    .join('\n');

  return (
    `<MESOWebService TemplateType="30" Template="WEBAngebot" option="0" printVoucher="0">\n` +
    `${kopfXml}\n${posXml}\n` +
    `</MESOWebService>`
  );
}

// Beleg-Key = <konto>-<laufnummer>, Idempotenz-Anker (analog Rep-/Lieferschein).
export function offerBelegKey(konto: string, laufnummer: string | number): string {
  return `${konto}-${laufnummer}`;
}

// End-to-End-Builder: Kopf + Positionen → fertiges XML.
export function buildOfferAngebotImport(
  kopf: AngebotKopf,
  lines: OfferLineSnapshot[],
  summary: OfferBelegSummary,
  standort: MesonicStandort = 'klagenfurt',
): string {
  return buildOfferAngebotXml(kopf, offerToBelegPositions(lines, summary, standort));
}
