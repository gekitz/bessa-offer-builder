// Code128 als VEKTOR-Balken (keine Rasterung → kein Pixeln beim Drucken auf dem
// Etikettendrucker). Browser-only: jsbarcode rendert in ein Offscreen-SVG, aus
// dem wir die schwarzen Balken (x/Breite) auslesen und im PDF als <Rect>
// nachzeichnen. Siehe docs/leihstellungen.md.

import JsBarcode from 'jsbarcode';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Barcode {
  width: number; // intrinsische Breite (Modul-Einheiten) → viewBox
  height: number; // intrinsische Höhe → viewBox
  bars: Array<{ x: number; width: number }>; // schwarze Balken
}

// Code128-Balken für `value`. jsbarcode zeichnet die Balken in ein <g>, der
// Hintergrund liegt daneben — `g rect` liefert daher exakt die Balken. Gibt null
// zurück, wenn der Wert ungültig ist oder kein DOM verfügbar ist (Tests).
export function code128Bars(value: string): Barcode | null {
  try {
    if (typeof document === 'undefined') return null;
    const svg = document.createElementNS(SVG_NS, 'svg');
    const height = 100;
    JsBarcode(svg, value, {
      format: 'CODE128',
      displayValue: false, // die menschenlesbare Seriennummer setzt das Etikett selbst
      height,
      width: 2,
      margin: 0,
    });
    const width = parseFloat(svg.getAttribute('width') || '') || 0;
    const bars = Array.from(svg.querySelectorAll('g rect'))
      .map((r) => ({ x: parseFloat(r.getAttribute('x') || '0'), width: parseFloat(r.getAttribute('width') || '0') }))
      .filter((b) => b.width > 0);
    if (!width || bars.length === 0) return null;
    return { width, height, bars };
  } catch {
    return null;
  }
}
