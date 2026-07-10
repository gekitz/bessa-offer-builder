import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COLORS, styles as base } from './pdfStyles';
import { PdfHeader, PdfFooter, POSITION_LABEL, fmt, fmtDate } from './RepairOrderPdfDocument';

// Customer-facing PDF of a SIGNED repair order. Renders straight from
// the sanitised PublicSignedRepairOrder (no employee attribution, no
// internal customer contact fields) — the same content the portal modal
// shows. Shares the header/footer/styles with the internal document.

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
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cellHead: { fontSize: 8, color: COLORS.medium, fontWeight: 'bold' },
  cell: { fontSize: 9, color: COLORS.dark },
  colKind: { width: '16%' },
  colLabel: { flex: 1 },
  colQty: { width: '14%', textAlign: 'right' },
  colUnitPrice: { width: '16%', textAlign: 'right' },
  colTotal: { width: '16%', textAlign: 'right' },
  totalsBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 3,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalsLabel: { fontSize: 10, color: COLORS.medium },
  totalsValue: { fontSize: 10, color: COLORS.dark },
  totalsRowBold: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalsLabelBold: { fontSize: 11, color: COLORS.dark, fontWeight: 'bold' },
  totalsValueBold: { fontSize: 11, color: COLORS.dark, fontWeight: 'bold' },
  signatureSection: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  signatureImage: { width: 220, height: 80, objectFit: 'contain' },
  signatureName: { fontSize: 10, color: COLORS.dark, marginTop: 2 },
  signatureMeta: { fontSize: 9, color: COLORS.medium, marginTop: 4 },
  pageNumber: { position: 'absolute', bottom: 30, right: 40, fontSize: 8, color: COLORS.light },
});

function PublicRepairOrderPdfDocument({ doc }) {
  return (
    <Document>
      <Page size="A4" style={base.page}>
        <PdfHeader />

        <Text style={local.title}>Reparaturschein #{doc.seqNumber}</Text>
        <Text style={local.subtitle}>
          Auftrag {doc.ticketNumber} · durchgeführt am {fmtDate(doc.performedAt)}
        </Text>

        <View style={local.metaGrid}>
          <View style={local.metaCol}>
            <Text style={local.metaLabel}>Kunde</Text>
            <Text style={local.metaValue}>{doc.customerName ?? '—'}</Text>
          </View>
        </View>

        {doc.workDescription && (
          <>
            <Text style={local.sectionTitle}>Arbeitsbeschreibung</Text>
            <Text style={local.description}>{doc.workDescription}</Text>
          </>
        )}

        {doc.positions.length > 0 && (
          <>
            <Text style={local.sectionTitle}>Positionen</Text>
            <View style={local.table}>
              <View style={local.tableHead}>
                <Text style={[local.cellHead, local.colKind]}>Art</Text>
                <Text style={[local.cellHead, local.colLabel]}>Bezeichnung</Text>
                <Text style={[local.cellHead, local.colQty]}>Menge</Text>
                <Text style={[local.cellHead, local.colUnitPrice]}>Einzelpreis</Text>
                <Text style={[local.cellHead, local.colTotal]}>Summe</Text>
              </View>
              {doc.positions.map((p, i) => {
                const qtyLabel =
                  p.unit === 'pauschale'
                    ? 'Pauschale'
                    : `${p.quantity}${p.unit === 'h' ? ' h' : p.unit === 'km' ? ' km' : ' Stk'}`;
                const priceLabel = p.unit === 'pauschale' ? '—' : `€ ${fmt(p.unitPrice)}`;
                return (
                  <View key={i} style={local.tableRow}>
                    <Text style={[local.cell, local.colKind]}>{POSITION_LABEL[p.kind] ?? p.kind}</Text>
                    <Text style={[local.cell, local.colLabel]}>{p.label}</Text>
                    <Text style={[local.cell, local.colQty]}>{qtyLabel}</Text>
                    <Text style={[local.cell, local.colUnitPrice]}>{priceLabel}</Text>
                    <Text style={[local.cell, local.colTotal]}>€ {fmt(p.total)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={local.totalsBox}>
          <View style={local.totalsRow}>
            <Text style={local.totalsLabel}>Summe netto</Text>
            <Text style={local.totalsValue}>€ {fmt(doc.subtotalNet)}</Text>
          </View>
          <View style={local.totalsRow}>
            <Text style={local.totalsLabel}>+ {doc.vatPercent} % MWSt.</Text>
            <Text style={local.totalsValue}>€ {fmt(doc.vatAmount)}</Text>
          </View>
          <View style={local.totalsRowBold}>
            <Text style={local.totalsLabelBold}>Gesamt brutto</Text>
            <Text style={local.totalsValueBold}>€ {fmt(doc.grossTotal)}</Text>
          </View>
        </View>

        <View style={local.signatureSection} wrap={false}>
          <Text style={local.sectionTitle}>Bestätigung des Kunden</Text>
          <Text style={local.description}>
            Mit der Unterschrift bestätigt der Kunde die durchgeführte Arbeit,
            Anfahrt und das verbaute Material.
          </Text>
          {doc.signatureData ? (
            <>
              <Image src={doc.signatureData} style={local.signatureImage} />
              <Text style={local.signatureName}>{doc.signedByName ?? '—'}</Text>
              <Text style={local.signatureMeta}>Unterschrieben am {fmtDate(doc.signedAt)}</Text>
            </>
          ) : (
            <Text style={local.signatureMeta}>Keine Unterschrift erfasst.</Text>
          )}
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

export default PublicRepairOrderPdfDocument;
