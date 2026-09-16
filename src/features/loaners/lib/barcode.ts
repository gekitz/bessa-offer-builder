// Code128-Barcode → PNG-Data-URL. Browser-only (nutzt ein Offscreen-Canvas);
// wird beim Etikettendruck aufgerufen, nicht im Test. Siehe docs/leihstellungen.md.

import JsBarcode from 'jsbarcode';

// Rendert `value` als Code128 auf ein Canvas und gibt eine PNG-Data-URL zurück,
// die @react-pdf/renderer als <Image> einbetten kann. Bei ungültigem Wert wirft
// JsBarcode — der Aufrufer behandelt das (leere/ungültige Seriennummern).
export function code128DataUrl(value: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false, // die menschenlesbare Seriennummer setzt das Etikett selbst
    height: 60,
    width: 2,
    margin: 0,
  });
  return canvas.toDataURL('image/png');
}
