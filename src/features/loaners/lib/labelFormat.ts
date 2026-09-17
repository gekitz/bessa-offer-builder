// Etikettendrucker-Format für Leihgeräte-Aufkleber. Ein Etikett = eine PDF-Seite
// in exakter Etikettengröße, damit direkt (ohne Zuschnitt) gedruckt werden kann.
// Der Barcode wird als Vektor gerendert (siehe barcode.ts / LoanerStickerSheet),
// daher kein Pixeln beim Drucken. Siehe docs/leihstellungen.md.

// Etikettengröße (Georg, Etikettendrucker): 50 mm × 27 mm.
export const LABEL_WIDTH_MM = 50;
export const LABEL_HEIGHT_MM = 27;

// PostScript-Punkte je Millimeter (1 pt = 1/72 Zoll).
export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

// @react-pdf Page size in points: [Breite, Höhe].
export const LABEL_SIZE: [number, number] = [mmToPt(LABEL_WIDTH_MM), mmToPt(LABEL_HEIGHT_MM)];
