// Belege eines Kunden aus Mesonic lesen — über den BEWÄHRTEN Export-Weg
// (Type 30, Vorlage `WEBBelege`), NICHT über die kaputte LIST-Route.
//
// Key-Format: `<Kontonummer>-<n>` (n = laufende Belegnummer des Kunden,
// beginnend bei 1). Wir zählen n hoch bis „kein Beleg mehr" — erkennbar an
// einer Antwort ohne T026-Positionen (leerer Beleg, i. d. R. Belegart 12,
// ohne DatumFaktura).
//
// Antwortstruktur:
//   <MESOWebService Template="WEBBelege">
//     <WEBBelegeT025> … Kopf: Kontonummer, Laufnummer, DatumFaktura, Belegart </WEBBelegeT025>
//     <WEBBelegeT026> … Position: Datentyp, Artikelnummer, Bezeichnung, Menge, Einzelpreis </WEBBelegeT026>
//     … (mehrere T026)
//   </MESOWebService>
//
// Datentyp: 1 = echter Artikel (Artikelnummer gesetzt), 3 = Freitext (TEXT).

import { mesonicExportRaw } from '../../../lib/mesonicApi';

export const BELEGE_TEMPLATE = 'WEBBelege';
export const BELEGE_TYPE = 30;

export interface BelegPosition {
  datentyp: string;
  artikelnummer: string;
  bezeichnung: string;
  menge: number;
  einzelpreis: number;
  erloeskonto: string;   // Erlöskonto — 8000 deutet oft (nicht immer) auf Hardware
}

// Erlöskonten, die typischerweise Hardware kennzeichnen (Heuristik, erweiterbar).
export const HARDWARE_ERLOESKONTEN = new Set(['8000', '8050']);

// „Wahrscheinlich Hardware" — echter Artikel auf einem Hardware-Erlöskonto.
export function isLikelyHardware(p: BelegPosition): boolean {
  return p.datentyp === '1' && HARDWARE_ERLOESKONTEN.has(p.erloeskonto);
}

export interface Beleg {
  index: number | null;          // die abgefragte laufende Nummer <n>
  kontonummer: string;
  laufnummer: string;
  belegart: string;
  datumFaktura: string | null;   // ISO (YYYY-MM-DD) oder null
  positions: BelegPosition[];
}

function text(el: Element | null, tag: string): string {
  if (!el) return '';
  const node = el.getElementsByTagName(tag)[0];
  return node?.textContent?.trim() ?? '';
}

// Rohes WEBBelege-XML → Beleg (oder null bei Fehler/keinem Kopf).
export function parseBeleg(xml: string, index: number | null = null): Beleg | null {
  if (!xml || /<OverallSuccess>\s*false/i.test(xml)) return null;
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const head = doc.getElementsByTagName('WEBBelegeT025')[0] ?? null;
  if (!head) return null;

  const positions: BelegPosition[] = Array.from(doc.getElementsByTagName('WEBBelegeT026')).map((p) => ({
    datentyp: text(p, 'Datentyp'),
    artikelnummer: text(p, 'Artikelnummer'),
    bezeichnung: text(p, 'Bezeichnung'),
    menge: Number(text(p, 'Mengegeliefert') || 0),
    einzelpreis: Number(text(p, 'Einzelpreis') || 0),
    erloeskonto: text(p, 'Erloeskonto'),
  }));

  return {
    index,
    kontonummer: text(head, 'Kontonummer'),
    laufnummer: text(head, 'Laufnummer'),
    belegart: text(head, 'Belegart'),
    datumFaktura: text(head, 'DatumFaktura') || null,
    positions,
  };
}

// „Kein Beleg an dieser Stelle" — keine Positionen (leerer/Platzhalter-Beleg).
export function isEmptyBeleg(beleg: Beleg | null): boolean {
  return !beleg || beleg.positions.length === 0;
}

// Echte Artikel-Positionen (Datentyp 1, Artikelnummer ≠ TEXT/leer).
export function articlePositions(beleg: Beleg): BelegPosition[] {
  return beleg.positions.filter(
    (p) => p.datentyp === '1' && p.artikelnummer && p.artikelnummer.toUpperCase() !== 'TEXT',
  );
}

// Neuester Beleg (nach DatumFaktura, dann Laufnummer) mit echten Artikeln.
export function latestHardware(belege: Beleg[]): { beleg: Beleg; articles: BelegPosition[] } | null {
  const withArticles = belege.filter((b) => articlePositions(b).length > 0);
  if (!withArticles.length) return null;
  withArticles.sort(
    (a, b) =>
      (b.datumFaktura ?? '').localeCompare(a.datumFaktura ?? '') ||
      (Number(b.laufnummer) || 0) - (Number(a.laufnummer) || 0),
  );
  return { beleg: withArticles[0], articles: articlePositions(withArticles[0]) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchBelegeOpts {
  startIndex?: number;      // ab welchem n starten (Default 1) — für inkrementelles Nachladen
  max?: number;             // max. Iterationen ab startIndex (Default 60)
  delayMs?: number;         // Drosselung zwischen Aufrufen (Default 300)
  stopAfterEmpty?: number;  // Abbruch nach N leeren in Folge (Default 2)
  onProgress?: (n: number, found: number) => void;
  abort?: () => boolean;    // true → abbrechen
}

// Belege eines Kunden sequenziell + gedrosselt laden. Bewusst schonend zum
// WinLine-Session-Pool → immer PRO KUNDE auf Abruf, nie als Massenlauf.
// Belege sind unveränderlich: für Nachladen startIndex = höchster bekannter
// Index + 1 setzen, dann werden nur NEUE Belege geholt.
export async function fetchCustomerBelege(kontonummer: string, opts: FetchBelegeOpts = {}): Promise<Beleg[]> {
  const startIndex = Math.max(1, opts.startIndex ?? 1);
  const max = opts.max ?? 60;
  const delayMs = opts.delayMs ?? 300;
  const stopAfterEmpty = opts.stopAfterEmpty ?? 2;
  const belege: Beleg[] = [];
  let emptyStreak = 0;

  for (let n = startIndex; n < startIndex + max; n++) {
    if (opts.abort?.()) break;
    let beleg: Beleg | null = null;
    try {
      const xml = await mesonicExportRaw(BELEGE_TYPE, BELEGE_TEMPLATE, `${kontonummer}-${n}`);
      beleg = parseBeleg(xml, n);
    } catch {
      // einzelner Fehlschlag: als leer werten (Streak zählt), nicht hämmern
    }
    if (isEmptyBeleg(beleg)) {
      emptyStreak++;
      if (emptyStreak >= stopAfterEmpty) break;
    } else {
      emptyStreak = 0;
      belege.push(beleg as Beleg);
    }
    opts.onProgress?.(n, belege.length);
    if (n < max && !opts.abort?.()) await sleep(delayMs);
  }
  return belege;
}
