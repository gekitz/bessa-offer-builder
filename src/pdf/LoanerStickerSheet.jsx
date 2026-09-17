import React from 'react';
import { Document, Page, StyleSheet, Svg, Rect, Text, View } from '@react-pdf/renderer';
import { COLORS } from './pdfStyles';
import { LABEL_SIZE } from '../features/loaners/lib/labelFormat';

// Leihgeräte-Etiketten für den Etikettendrucker: EINE Seite je Etikett in
// exakter Etikettengröße (50 × 27 mm) — kein Zuschnitt nötig. Der Code128-
// Barcode wird als Vektor (<Rect>-Balken) gezeichnet, daher kein Pixeln beim
// Drucken. Balken kommen vorgerechnet herein (features/loaners/lib/barcode.ts),
// da @react-pdf keinen Barcode nativ erzeugt. Siehe docs/leihstellungen.md.
//
// `items`: [{ bezeichnung, serialNumber, inventoryNo, barcode }]
//   barcode = { width, height, bars:[{x,width}] } | null

const s = StyleSheet.create({
  // Etikett: horizontaler Rand = Ruhezone für den Barcode.
  page: { paddingHorizontal: 7, paddingVertical: 4, backgroundColor: COLORS.white },
  frame: { flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 6, fontWeight: 'bold', color: COLORS.dark, textAlign: 'center', maxLines: 1, textOverflow: 'ellipsis', marginBottom: 2 },
  barcode: { width: '100%', height: 30 },
  serial: { fontSize: 8, color: COLORS.dark, textAlign: 'center', letterSpacing: 0.6, marginTop: 2 },
  inv: { fontSize: 5, color: COLORS.medium, textAlign: 'center' },
});

export default function LoanerStickerSheet({ items }) {
  return (
    <Document title="Leihgeräte-Etiketten">
      {items.map((it, i) => (
        <Page key={`${it.serialNumber}-${i}`} size={LABEL_SIZE} style={s.page}>
          <View style={s.frame}>
            <Text style={s.name}>{it.bezeichnung}</Text>
            {it.barcode ? (
              <Svg viewBox={`0 0 ${it.barcode.width} ${it.barcode.height}`} preserveAspectRatio="none" style={s.barcode}>
                {it.barcode.bars.map((b, bi) => (
                  <Rect key={bi} x={b.x} y={0} width={b.width} height={it.barcode.height} fill="#000000" />
                ))}
              </Svg>
            ) : null}
            <Text style={s.serial}>{it.serialNumber}</Text>
            {it.inventoryNo ? <Text style={s.inv}>#{it.inventoryNo}</Text> : null}
          </View>
        </Page>
      ))}
    </Document>
  );
}
