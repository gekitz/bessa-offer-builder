import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COLORS } from './pdfStyles';
import { paginateStickers, STICKERS_PER_PAGE } from '../features/loaners/lib/stickerLayout';

// Etikettenbogen für Leihgeräte: 3 × 8 Code128-Etiketten je A4-Seite. Jedes
// Etikett zeigt die Bezeichnung, den Code128-Barcode der Seriennummer und die
// menschenlesbare Seriennummer (+ optionale Inventarnr.). Der Barcode kommt als
// vorgerenderte PNG-Data-URL herein (siehe features/loaners/lib/barcode.ts), da
// @react-pdf keinen Barcode nativ erzeugt. Siehe docs/leihstellungen.md.
//
// `items`: [{ bezeichnung, serialNumber, inventoryNo, barcode }]

const s = StyleSheet.create({
  page: { padding: 18, backgroundColor: COLORS.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '33.33%',
    height: 88,
    padding: 6,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    justifyContent: 'space-between',
  },
  name: { fontSize: 7, fontWeight: 'bold', color: COLORS.dark, maxLines: 2, textOverflow: 'ellipsis' },
  barcode: { width: '100%', height: 34, objectFit: 'contain' },
  serial: { fontSize: 7, color: COLORS.dark, textAlign: 'center', letterSpacing: 0.5 },
  inv: { fontSize: 6, color: COLORS.medium, textAlign: 'center' },
});

export default function LoanerStickerSheet({ items }) {
  const pages = paginateStickers(items, STICKERS_PER_PAGE);
  return (
    <Document title="Leihgeräte-Etiketten">
      {pages.map((page, pi) => (
        <Page key={pi} size="A4" style={s.page}>
          <View style={s.grid}>
            {page.map((it, i) => (
              <View key={`${it.serialNumber}-${i}`} style={s.cell}>
                <Text style={s.name}>{it.bezeichnung}</Text>
                {it.barcode ? (
                  <Image src={it.barcode} style={s.barcode} />
                ) : (
                  <Text style={s.serial}>—</Text>
                )}
                <View>
                  <Text style={s.serial}>{it.serialNumber}</Text>
                  {it.inventoryNo ? <Text style={s.inv}>#{it.inventoryNo}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}
