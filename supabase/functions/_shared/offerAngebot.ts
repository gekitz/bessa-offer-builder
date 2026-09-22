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
//   • JEDE gezählte Angebotszeile → eine TEXT-Position (Datentyp 3) zum
//     Netto-Zeilenpreis. Aktions-Splits (voller Preis + Aktionspreis) werden
//     als zwei Positionen abgebildet, exakt wie im Angebot gerechnet.
//   • Monatliche Zeilen tragen den Laufzeit-Hinweis in der Bezeichnung
//     ("… (12 Monate, monatlich)").
//   • Ein globaler Rabatt (rabattActive) und eine Hardware-Rücknahme
//     (takeBack) werden als EIGENE negative TEXT-Positionen ausgewiesen —
//     nicht in die Zeilenpreise eingerechnet (so wollte es Georg).
//   • Alt-Angebote ohne eingefrorenen lineSnapshot fallen auf Summen-Zeilen
//     aus dem acceptSnapshot zurück (Monatlich / Einmalig / Laufzeitsumme),
//     damit sie trotzdem auffindbar in Mesonic landen.

// ── Belegart & Konstanten (gespiegelt, dependency-frei) ──────────────────
// Angebot-Import → Belegart 17 (beide Standorte). Siehe angebotImport.ts.
export const OFFER_BELEGART = '17';
// Globaler Rabatt = 2 % auf die Laufzeitsumme. Spiegelt RABATT_PCT in
// _shared/planPricing.ts (dort die Single Source of Truth fürs Charging).
export const RABATT_PCT = 0.02;
// Mirrors src/data/tiers.ts TIER_LABEL (dependency-frei gehalten).
const TIER_LABEL: Record<string, string> = {
  '12mo': '12 Monate',
  '6mo': '6 Monate',
  '2mo': '2 Monate',
  event: '1-3 Tage',
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
  artikelnummer: string;  // hier immer 'TEXT'
  datentyp: '3';
  menge: number;
  einzelpreis: number;    // netto (negativ bei Gutschrift/Rabatt)
  bezeichnung: string;
}

export interface AngebotKopf {
  kontonummer: string;
  laufnummer: string | number;
  datumAngebot?: string;      // YYYY-MM-DD — Annahmedatum
  vertreternummer?: string | number;
}

// Bezeichnung einer Angebotszeile: optionaler Code-Präfix + Name, monatliche
// Zeilen mit Laufzeit-Hinweis.
function lineBezeichnung(l: OfferLineSnapshot): string {
  const base = l.code ? `${l.code} ${l.name}` : l.name;
  if (l.monthly) {
    const tl = l.tier ? TIER_LABEL[l.tier] : undefined;
    return tl ? `${base} (${tl}, monatlich)` : `${base} (monatlich)`;
  }
  return base;
}

// Eine Angebotszeile → 1–2 TEXT-Positionen (voller Preis + ggf. Aktionspreis).
// Menge 0 / Preis 0 werden übersprungen, damit keine Leerzeilen entstehen.
export function lineToBelegPositions(l: OfferLineSnapshot): AngebotPosition[] {
  const out: AngebotPosition[] = [];
  const bez = lineBezeichnung(l);
  if (l.qty > 0 && l.unitPrice !== 0) {
    out.push({ artikelnummer: 'TEXT', datentyp: '3', menge: l.qty, einzelpreis: round2(l.unitPrice), bezeichnung: bez });
  }
  if (l.discountQty > 0 && l.discountPrice !== 0) {
    out.push({ artikelnummer: 'TEXT', datentyp: '3', menge: l.discountQty, einzelpreis: round2(l.discountPrice), bezeichnung: `${bez} (Aktionspreis)` });
  }
  return out;
}

// Alle Positionen eines Angebots: Zeilen → Rabatt → Rücknahme.
export function offerToBelegPositions(
  lines: OfferLineSnapshot[],
  summary: OfferBelegSummary,
): AngebotPosition[] {
  const positions: AngebotPosition[] = [];

  if (lines.length > 0) {
    for (const l of lines) positions.push(...lineToBelegPositions(l));
  } else {
    // Fallback für Alt-Angebote ohne lineSnapshot: Summen aus dem
    // acceptSnapshot als lesbare TEXT-Zeilen, damit der Beleg auffindbar ist.
    if (summary.monthly > 0) {
      positions.push({ artikelnummer: 'TEXT', datentyp: '3', menge: 1, einzelpreis: round2(summary.monthly), bezeichnung: `Monatliche Positionen (${summary.maxMonths} Monate)` });
    }
    if (summary.once > 0) {
      positions.push({ artikelnummer: 'TEXT', datentyp: '3', menge: 1, einzelpreis: round2(summary.once), bezeichnung: 'Einmalige Positionen' });
    }
  }

  // Globaler Rabatt als eigene negative Zeile (2 % auf die Laufzeitsumme).
  if (summary.rabattActive && summary.periodTotal > 0) {
    const rabatt = round2(summary.periodTotal * RABATT_PCT);
    if (rabatt > 0) {
      positions.push({ artikelnummer: 'TEXT', datentyp: '3', menge: 1, einzelpreis: -rabatt, bezeichnung: 'Rabatt 2 % auf Laufzeitsumme' });
    }
  }

  // Hardware-Rücknahme als eigene Gutschrift-Zeile.
  if (summary.takeBack > 0) {
    positions.push({ artikelnummer: 'TEXT', datentyp: '3', menge: 1, einzelpreis: -round2(summary.takeBack), bezeichnung: 'Hardware-Rücknahme (Gutschrift)' });
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
): string {
  return buildOfferAngebotXml(kopf, offerToBelegPositions(lines, summary));
}
