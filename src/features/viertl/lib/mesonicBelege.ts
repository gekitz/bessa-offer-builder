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

// Erlöskonten für POS-Systeme (das, was für den Hardware-/ATrust-Tausch
// zählt). Nur Kassensysteme, NICHT Drucker/Peripherie: 8000 = A-Trust,
// 8050 = Kassen/Orderman.
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

// Mehrere Belege aus EINER Antwort (Batch-Abruf: mehrere Keys pro Call).
// Positionen (T026) werden ihrem Kopf (T025) über BELEGKEY zugeordnet.
// index = Laufnummer (die stabile Belegnummer des Kunden).
export function parseBelege(xml: string): Beleg[] {
  if (!xml || /<OverallSuccess>\s*false/i.test(xml)) return [];
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];

  const byKey = new Map<string, Beleg>();
  for (const h of Array.from(doc.getElementsByTagName('WEBBelegeT025'))) {
    const belegkey = text(h, 'BELEGKEY');
    const lauf = text(h, 'Laufnummer');
    byKey.set(belegkey, {
      index: lauf ? Number(lauf) : null,
      kontonummer: text(h, 'Kontonummer'),
      laufnummer: lauf,
      belegart: text(h, 'Belegart'),
      datumFaktura: text(h, 'DatumFaktura') || null,
      positions: [],
    });
  }
  for (const p of Array.from(doc.getElementsByTagName('WEBBelegeT026'))) {
    const beleg = byKey.get(text(p, 'BELEGKEY'));
    if (!beleg) continue;
    beleg.positions.push({
      datentyp: text(p, 'Datentyp'),
      artikelnummer: text(p, 'Artikelnummer'),
      bezeichnung: text(p, 'Bezeichnung'),
      menge: Number(text(p, 'Mengegeliefert') || 0),
      einzelpreis: Number(text(p, 'Einzelpreis') || 0),
      erloeskonto: text(p, 'Erloeskonto'),
    });
  }
  return Array.from(byKey.values());
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

export const BELEGE_BATCH_SIZE = 25; // Laufnummern pro HTTP-Call

export interface FetchBelegeOpts {
  startIndex?: number;           // ab welchem n starten (Default 1) — inkrementelles Nachladen
  max?: number;                  // max. Laufnummern ab startIndex (Default 200)
  batchSize?: number;            // Keys pro Call (Default 25)
  delayMs?: number;              // Drosselung zwischen Calls (Default 300)
  stopAfterEmptyBatches?: number; // Abbruch nach N komplett leeren Batches (Default 1)
  onProgress?: (scannedTo: number, found: number) => void;
  abort?: () => boolean;         // true → abbrechen
}

// Belege eines Kunden laden — GEBATCHT: pro Call mehrere Keys
// ('<Konto>-<n>','<Konto>-<n+1>',…), WinLine liefert alle in einer Antwort
// (White Paper §3.5.17). ~25× weniger Calls als pro-Beleg. Belege sind
// unveränderlich: startIndex = höchster bekannter Index + 1 → nur Neue.
// Stop, sobald ein ganzer Batch nur leere Platzhalter enthält (Ende erreicht).
export async function fetchCustomerBelege(
  kontonummer: string,
  opts: FetchBelegeOpts = {},
): Promise<{ belege: Beleg[]; scannedTo: number }> {
  const startIndex = Math.max(1, opts.startIndex ?? 1);
  const max = opts.max ?? 200;
  const batchSize = Math.max(1, opts.batchSize ?? BELEGE_BATCH_SIZE);
  const delayMs = opts.delayMs ?? 300;
  const stopAfterEmptyBatches = opts.stopAfterEmptyBatches ?? 1;
  const belege: Beleg[] = [];
  let scannedTo = startIndex - 1;
  let emptyBatchStreak = 0;
  const end = startIndex + max; // exclusive

  for (let start = startIndex; start < end; start += batchSize) {
    if (opts.abort?.()) break;
    const size = Math.min(batchSize, end - start);
    const keys = Array.from({ length: size }, (_, i) => `'${kontonummer}-${start + i}'`).join(',');
    scannedTo = start + size - 1;

    let batch: Beleg[] = [];
    try {
      const xml = await mesonicExportRaw(BELEGE_TYPE, BELEGE_TEMPLATE, keys);
      batch = parseBelege(xml);
    } catch {
      // Batch-Fehlschlag: als leer werten, nicht hämmern
    }
    const nonEmpty = batch.filter((b) => b.positions.length > 0);
    belege.push(...nonEmpty);
    opts.onProgress?.(scannedTo, belege.length);

    if (nonEmpty.length === 0) {
      emptyBatchStreak++;
      if (emptyBatchStreak >= stopAfterEmptyBatches) break;
    } else {
      emptyBatchStreak = 0;
    }
    if (start + batchSize < end && !opts.abort?.()) await sleep(delayMs);
  }
  return { belege, scannedTo };
}
