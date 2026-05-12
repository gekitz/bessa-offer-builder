import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COLORS, styles as base } from './pdfStyles';
import kitzLogo from '/kitz-logo.png';

// PDF for a signed repair order. Mirrors the OfferPdfDocument header
// + footer convention but specialises the body for: ticket meta,
// work description, technician entries, materials, billing
// breakdown, and the captured customer signature.

const COMPANY = {
  senderLine: 'Kitz Computer+Office GmbH, Johann-Offner-Str. 17, A-9400 Wolfsberg',
  wolfsberg: {
    address: 'Johann Offnerstr. 17',
    city: '9400 Wolfsberg',
    tel: '04352/4176',
    fax: '75',
    email: 'office@kitz.co.at',
  },
  klagenfurt: {
    address: 'Rosentalerstr. 1',
    city: '9020 Klagenfurt',
    tel: '0463/504454',
    fax: '20',
    email: 'office.kl@kitz.co.at',
  },
  website: 'www.kitz.co.at',
};

const fmt = (n) =>
  Number(n).toLocaleString('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const POSITION_LABEL = {
  labor: 'Arbeit',
  travel_flat: 'Anfahrt',
  travel_km: 'KM-Geld',
  travel_wegzeit: 'Wegzeit',
  service_flat: 'Service',
  material: 'Material',
};

// ─────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────

const local = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.medium,
    marginBottom: 14,
  },
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
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginTop: 10,
    marginBottom: 6,
  },
  description: {
    fontSize: 10,
    color: COLORS.dark,
    lineHeight: 1.4,
    marginBottom: 6,
  },
  italicNote: {
    fontSize: 9,
    color: COLORS.medium,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  table: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 2,
  },
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
  tableRowLast: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  cellHead: { fontSize: 8, color: COLORS.medium, fontWeight: 'bold' },
  cell: { fontSize: 9, color: COLORS.dark },
  cellRight: { textAlign: 'right' },
  // Position-table column widths sum to 100.
  colKind: { width: '14%' },
  colLabel: { flex: 1 },
  colQty: { width: '12%', textAlign: 'right' },
  colUnitPrice: { width: '15%', textAlign: 'right' },
  colTotal: { width: '15%', textAlign: 'right' },

  // Billing summary
  totalsBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 3,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
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

  // Signature
  signatureSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  signatureGrid: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
  },
  signatureCol: { flex: 1 },
  signatureImage: {
    width: 220,
    height: 80,
    objectFit: 'contain',
  },
  signatureMeta: {
    fontSize: 9,
    color: COLORS.medium,
    marginTop: 4,
  },
  signatureName: {
    fontSize: 10,
    color: COLORS.dark,
    marginTop: 2,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 40,
    fontSize: 8,
    color: COLORS.light,
  },
});

// ─────────────────────────────────────────────────────────────────────
// Reusable header (mirrors OfferPdfDocument)
// ─────────────────────────────────────────────────────────────────────

function PdfHeader() {
  return (
    <View style={base.header} fixed>
      <Text style={base.senderLine}>{COMPANY.senderLine}</Text>
      <View style={base.headerContent}>
        <Image src={kitzLogo} style={base.logo} />
      </View>
      <View style={base.contactSection}>
        <View style={base.contactColumns}>
          <View style={[base.contactColumn, base.contactColumnLeft]}>
            <Text style={base.contactLine}>{COMPANY.wolfsberg.address}, {COMPANY.wolfsberg.city}</Text>
            <Text style={base.contactLine}>Tel. {COMPANY.wolfsberg.tel} Fax. {COMPANY.wolfsberg.fax}</Text>
            <Text style={base.contactLine}>E-mail: {COMPANY.wolfsberg.email}</Text>
          </View>
          <View style={[base.contactColumn, base.contactColumnRight]}>
            <Text style={base.contactLine}>{COMPANY.klagenfurt.address}, {COMPANY.klagenfurt.city}</Text>
            <Text style={base.contactLine}>Tel. {COMPANY.klagenfurt.tel} Fax. {COMPANY.klagenfurt.fax}</Text>
            <Text style={base.contactLine}>E-mail: {COMPANY.klagenfurt.email}</Text>
          </View>
        </View>
        <Text style={base.websiteLine}>{COMPANY.website}</Text>
      </View>
    </View>
  );
}

function PdfFooter() {
  return (
    <View style={base.footer} fixed>
      <Text style={base.footerTextBold}>
        Es gelten die aktuellen Allgemeinen Geschäftsbedingungen der KITZ Computer + Office GmbH.
      </Text>
      <Text style={base.footerText}>
        Diese sind jederzeit abrufbar unter www.kitz.co.at
      </Text>
      <Text style={base.footerText}>
        Reklaturkosten sind bei Abholung sofort netto Kasse zu begleichen.
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main document
// ─────────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function RepairOrderPdfDocument({ ticket, repairOrder, billing, employeesByEntry = {} }) {
  // billing.positions already carries the per-row total; we just render.
  return (
    <Document>
      <Page size="A4" style={base.page}>
        <PdfHeader />

        <Text style={local.title}>Reparaturschein #{repairOrder.seqNumber}</Text>
        <Text style={local.subtitle}>
          Ticket {ticket.ticketNumber} · durchgeführt am {fmtDate(repairOrder.performedAt)}
        </Text>

        {/* Meta grid */}
        <View style={local.metaGrid}>
          <View style={local.metaCol}>
            <Text style={local.metaLabel}>Kunde</Text>
            <Text style={local.metaValue}>{ticket.customerName ?? '—'}</Text>
            {ticket.customerAddress && (
              <Text style={local.metaValue}>{ticket.customerAddress}</Text>
            )}
            {ticket.mesonicCustomerId && (
              <Text style={[local.metaLabel, { marginTop: 4 }]}>
                Mesonic-Nr {ticket.mesonicCustomerId}
              </Text>
            )}
          </View>
          <View style={local.metaCol}>
            <Text style={local.metaLabel}>Ticket</Text>
            <Text style={local.metaValue}>{ticket.title}</Text>
            {ticket.customerPhone && (
              <Text style={local.metaValue}>Tel. {ticket.customerPhone}</Text>
            )}
            {ticket.customerEmail && (
              <Text style={local.metaValue}>{ticket.customerEmail}</Text>
            )}
          </View>
        </View>

        {/* Work description */}
        {repairOrder.workDescription && (
          <>
            <Text style={local.sectionTitle}>Arbeitsbeschreibung</Text>
            <Text style={local.description}>{repairOrder.workDescription}</Text>
          </>
        )}
        {repairOrder.gpsTravelNote && (
          <Text style={local.italicNote}>{repairOrder.gpsTravelNote}</Text>
        )}

        {/* Positions table — derived from the billing summary. */}
        {billing.positions.length > 0 && (
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
              {billing.positions.map((p, i) => {
                const isLast = i === billing.positions.length - 1;
                const rowStyle = isLast ? local.tableRowLast : local.tableRow;
                const qtyLabel =
                  p.unit === 'pauschale'
                    ? 'Pauschale'
                    : `${p.quantity}${p.unit === 'h' ? ' h' : p.unit === 'km' ? ' km' : ' Stk'}`;
                const priceLabel = p.unit === 'pauschale' ? '—' : `€ ${fmt(p.unitPrice)}`;
                const labelText = p.employeeName ? `${p.employeeName} — ${p.label}` : p.label;
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={[local.cell, local.colKind]}>{POSITION_LABEL[p.kind] ?? p.kind}</Text>
                    <Text style={[local.cell, local.colLabel]}>{labelText}</Text>
                    <Text style={[local.cell, local.colQty]}>{qtyLabel}</Text>
                    <Text style={[local.cell, local.colUnitPrice]}>{priceLabel}</Text>
                    <Text style={[local.cell, local.colTotal]}>€ {fmt(p.total)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Totals box */}
        <View style={local.totalsBox}>
          {billing.laborTotal > 0 && (
            <View style={local.totalsRow}>
              <Text style={local.totalsLabel}>Arbeit</Text>
              <Text style={local.totalsValue}>€ {fmt(billing.laborTotal)}</Text>
            </View>
          )}
          {billing.travelTotal > 0 && (
            <View style={local.totalsRow}>
              <Text style={local.totalsLabel}>Anfahrt / Wegzeit</Text>
              <Text style={local.totalsValue}>€ {fmt(billing.travelTotal)}</Text>
            </View>
          )}
          {billing.serviceTotal > 0 && (
            <View style={local.totalsRow}>
              <Text style={local.totalsLabel}>Service-Pauschalen</Text>
              <Text style={local.totalsValue}>€ {fmt(billing.serviceTotal)}</Text>
            </View>
          )}
          {billing.materialTotal > 0 && (
            <View style={local.totalsRow}>
              <Text style={local.totalsLabel}>Material</Text>
              <Text style={local.totalsValue}>€ {fmt(billing.materialTotal)}</Text>
            </View>
          )}
          <View style={local.totalsRow}>
            <Text style={local.totalsLabel}>Summe netto</Text>
            <Text style={local.totalsValue}>€ {fmt(billing.subtotalNet)}</Text>
          </View>
          <View style={local.totalsRow}>
            <Text style={local.totalsLabel}>+ {billing.vatPercent} % MWSt.</Text>
            <Text style={local.totalsValue}>€ {fmt(billing.vatAmount)}</Text>
          </View>
          <View style={local.totalsRowBold}>
            <Text style={local.totalsLabelBold}>Gesamt brutto</Text>
            <Text style={local.totalsValueBold}>€ {fmt(billing.grandTotalGross)}</Text>
          </View>
        </View>

        {/* Signature */}
        <View style={local.signatureSection} wrap={false}>
          <Text style={local.sectionTitle}>Bestätigung des Kunden</Text>
          <Text style={local.description}>
            Mit der Unterschrift bestätigt der Kunde die durchgeführte Arbeit,
            Anfahrt und das verbaute Material.
          </Text>
          <View style={local.signatureGrid}>
            <View style={local.signatureCol}>
              {repairOrder.signatureData ? (
                <>
                  <Image src={repairOrder.signatureData} style={local.signatureImage} />
                  <Text style={local.signatureName}>{repairOrder.signedByName ?? '—'}</Text>
                  <Text style={local.signatureMeta}>
                    Unterschrieben am {fmtDate(repairOrder.signedAt)}
                  </Text>
                </>
              ) : (
                <Text style={local.italicNote}>
                  Noch keine Kundenunterschrift erfasst.
                </Text>
              )}
            </View>
            <View style={local.signatureCol}>
              <Text style={local.signatureName}>Techniker</Text>
              <Text style={local.signatureMeta}>{Object.values(employeesByEntry).filter(Boolean).join(', ')}</Text>
            </View>
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

export default RepairOrderPdfDocument;
