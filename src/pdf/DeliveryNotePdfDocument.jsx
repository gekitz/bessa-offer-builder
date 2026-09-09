import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COLORS, styles as base } from './pdfStyles';
import { PdfFooter, PdfHeader, fmt, fmtDate } from './RepairOrderPdfDocument';

// PDF for a Lieferschein (delivery note). Reuses the RepairOrder header/footer
// convention; the body lists delivered goods with per-unit serial numbers and
// the captured customer signature. A delivery note carries no internal-only
// data (no employee attribution), so the SAME document serves both the staff
// download and the customer portal. See docs/ticket-lieferschein.md.
//
// `doc` is the normalised shape built by both callers:
//   { ticketNumber, seqNumber, performedAt, note,
//     customerName, customerAddress, customerPhone, customerEmail, mesonicCustomerId,
//     items: [{ bezeichnung, mesonicArtikelNr, quantity, unitPrice, serialNumbers }],
//     signedByName, signedAt, signatureData }

const local = StyleSheet.create({
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark, marginBottom: 4 },
  subtitle: { fontSize: 11, color: COLORS.medium, marginBottom: 14 },
  metaGrid: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 8, color: COLORS.medium, marginBottom: 2 },
  metaValue: { fontSize: 10, color: COLORS.dark },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: COLORS.dark, marginTop: 10, marginBottom: 6 },
  description: { fontSize: 10, color: COLORS.dark, lineHeight: 1.4, marginBottom: 6 },
  italicNote: { fontSize: 9, color: COLORS.medium, fontStyle: 'italic', marginBottom: 10 },

  table: { marginTop: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: 2 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableRow: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableRowLast: { paddingVertical: 5, paddingHorizontal: 6 },
  rowLine: { flexDirection: 'row' },
  cellHead: { fontSize: 8, color: COLORS.medium, fontWeight: 'bold' },
  cell: { fontSize: 9, color: COLORS.dark },
  // Column widths sum to 100.
  colName: { flex: 1 },
  colArtikel: { width: '18%' },
  colQty: { width: '12%', textAlign: 'right' },
  colUnit: { width: '16%', textAlign: 'right' },
  colTotal: { width: '16%', textAlign: 'right' },
  serialLine: { fontSize: 8, color: COLORS.medium, marginTop: 2 },

  totalsBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 3,
  },
  totalsRowBold: { flexDirection: 'row', justifyContent: 'space-between' },
  totalsLabelBold: { fontSize: 11, color: COLORS.dark, fontWeight: 'bold' },
  totalsValueBold: { fontSize: 11, color: COLORS.dark, fontWeight: 'bold' },

  signatureSection: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  signatureGrid: { flexDirection: 'row', gap: 20, marginTop: 8 },
  signatureCol: { flex: 1 },
  signatureImage: { width: 220, height: 80, objectFit: 'contain' },
  signatureMeta: { fontSize: 9, color: COLORS.medium, marginTop: 4 },
  signatureName: { fontSize: 10, color: COLORS.dark, marginTop: 2 },
  pageNumber: { position: 'absolute', bottom: 30, right: 40, fontSize: 8, color: COLORS.light },
});

function DeliveryNotePdfDocument({ doc }) {
  const items = doc.items ?? [];
  const totalNet = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitPrice), 0);

  return (
    <Document>
      <Page size="A4" style={base.page}>
        <PdfHeader />

        <Text style={local.title}>Lieferschein #{doc.seqNumber}</Text>
        <Text style={local.subtitle}>
          Ticket {doc.ticketNumber} · geliefert am {fmtDate(doc.performedAt)}
        </Text>

        {/* Meta grid */}
        <View style={local.metaGrid}>
          <View style={local.metaCol}>
            <Text style={local.metaLabel}>Kunde</Text>
            <Text style={local.metaValue}>{doc.customerName ?? '—'}</Text>
            {doc.customerAddress && <Text style={local.metaValue}>{doc.customerAddress}</Text>}
            {doc.mesonicCustomerId && (
              <Text style={[local.metaLabel, { marginTop: 4 }]}>Mesonic-Nr {doc.mesonicCustomerId}</Text>
            )}
          </View>
          <View style={local.metaCol}>
            {doc.customerPhone && <Text style={local.metaValue}>Tel. {doc.customerPhone}</Text>}
            {doc.customerEmail && <Text style={local.metaValue}>{doc.customerEmail}</Text>}
          </View>
        </View>

        {doc.note && (
          <>
            <Text style={local.sectionTitle}>Notiz</Text>
            <Text style={local.description}>{doc.note}</Text>
          </>
        )}

        {/* Positions */}
        <Text style={local.sectionTitle}>Gelieferte Positionen</Text>
        <View style={local.table}>
          <View style={local.tableHead}>
            <Text style={[local.cellHead, local.colName]}>Bezeichnung</Text>
            <Text style={[local.cellHead, local.colArtikel]}>Artikel-Nr.</Text>
            <Text style={[local.cellHead, local.colQty]}>Menge</Text>
            <Text style={[local.cellHead, local.colUnit]}>Einzelpreis</Text>
            <Text style={[local.cellHead, local.colTotal]}>Summe</Text>
          </View>
          {items.map((it, i) => {
            const isLast = i === items.length - 1;
            const serials = (it.serialNumbers ?? []).filter(Boolean);
            const lineTotal = Number(it.quantity) * Number(it.unitPrice);
            return (
              <View key={i} style={isLast ? local.tableRowLast : local.tableRow}>
                <View style={local.rowLine}>
                  <Text style={[local.cell, local.colName]}>{it.bezeichnung}</Text>
                  <Text style={[local.cell, local.colArtikel]}>{it.mesonicArtikelNr ?? '—'}</Text>
                  <Text style={[local.cell, local.colQty]}>{fmt(it.quantity)}</Text>
                  <Text style={[local.cell, local.colUnit]}>€ {fmt(it.unitPrice)}</Text>
                  <Text style={[local.cell, local.colTotal]}>€ {fmt(lineTotal)}</Text>
                </View>
                {serials.length > 0 && (
                  <Text style={local.serialLine}>S/N: {serials.join(', ')}</Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={local.totalsBox}>
          <View style={local.totalsRowBold}>
            <Text style={local.totalsLabelBold}>Summe netto</Text>
            <Text style={local.totalsValueBold}>€ {fmt(totalNet)}</Text>
          </View>
        </View>

        {/* Signature */}
        <View style={local.signatureSection} wrap={false}>
          <Text style={local.sectionTitle}>Bestätigung des Kunden</Text>
          <Text style={local.description}>
            Mit der Unterschrift bestätigt der Kunde die Übernahme der oben angeführten Ware.
          </Text>
          <View style={local.signatureGrid}>
            <View style={local.signatureCol}>
              {doc.signatureData ? (
                <>
                  <Image src={doc.signatureData} style={local.signatureImage} />
                  <Text style={local.signatureName}>{doc.signedByName ?? '—'}</Text>
                  <Text style={local.signatureMeta}>Unterschrieben am {fmtDate(doc.signedAt)}</Text>
                </>
              ) : (
                <Text style={local.italicNote}>Noch keine Kundenunterschrift erfasst.</Text>
              )}
            </View>
            <View style={local.signatureCol} />
          </View>
        </View>

        <Text
          style={local.pageNumber}
          render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`}
          fixed
        />

        <PdfFooter />
      </Page>
    </Document>
  );
}

export default DeliveryNotePdfDocument;
