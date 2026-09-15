// Shared parsing for Mesonic article search results (searchArticles, Type 4).
//
// Mesonic returns records with verbose / inconsistent field names — either
// `Artikelbezeichnung`, `Bezeichnung`, the raw `T024_C003` alias, or the dotted
// `T024.C003`. We probe candidates in order and normalise to a tidy shape.
// Consumed by the Reparaturschein MaterialPicker and the Produkte
// Mesonic-Artikel lookup.

export interface MesonicArticle {
  raw: Record<string, unknown>;
  number: string;
  name: string;
  group?: string;
  hintedPrice?: number;
}

export function pickField(rec: Record<string, unknown>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = rec[c];
    if (v != null && v !== '') return String(v);
  }
  return '';
}

export function normaliseArticle(raw: Record<string, unknown>): MesonicArticle | null {
  const name = pickField(raw, 'Artikelbezeichnung', 'Bezeichnung', 'Name', 'T024_C003', 'T024.C003');
  const number = pickField(raw, 'Artikelnummer', 'ArtikelNr', 'Nummer', 'T024_C001', 'T024.C001');
  if (!number) return null;
  const group = pickField(raw, 'Artikelgruppe', 'Gruppe', 'T024_C004') || undefined;
  const hintedPriceRaw = pickField(raw, 'Preis', 'VKPreis', 'T024_C020');
  const hintedPrice = hintedPriceRaw ? Number(hintedPriceRaw.replace(',', '.')) : undefined;
  return {
    raw,
    number,
    name: name || number,
    group,
    hintedPrice: Number.isFinite(hintedPrice ?? NaN) ? hintedPrice : undefined,
  };
}
