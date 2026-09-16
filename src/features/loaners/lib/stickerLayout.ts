// Leihgeräte-Etiketten — reine Layout-Logik (keine DOM-/PDF-Abhängigkeit):
// Aufteilung der Geräte auf Etikettenbögen. Siehe docs/leihstellungen.md.

// A4-Bogen mit 3 Spalten × 8 Zeilen = 24 Etiketten (gängiges Format).
export const STICKER_COLS = 3;
export const STICKER_ROWS = 8;
export const STICKERS_PER_PAGE = STICKER_COLS * STICKER_ROWS;

export interface StickerItem {
  bezeichnung: string;
  serialNumber: string;
  inventoryNo?: string | null;
}

// Teilt eine flache Liste in Seiten zu je `perPage` Etiketten.
export function paginateStickers<T>(items: T[], perPage: number = STICKERS_PER_PAGE): T[][] {
  if (perPage < 1) throw new Error('perPage muss ≥ 1 sein');
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage));
  }
  return pages;
}
