import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
} from '@react-pdf/renderer';
import { styles, COLORS } from './pdfStyles';
import kitzLogo from '/kitz-logo.png';

// Format number to German locale
const fmt = (n) =>
  n.toLocaleString('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Tier labels
const TIER_LABEL_OFFER = {
  '12mo': '12 Monate mtl.',
  '6mo': '6 Monate mtl.',
  '2mo': '2 Monate mtl.',
  event: '1-3 Tage/Event',
};

// Company default info
const COMPANY = {
  name: 'KITZ Computer + Office GmbH',
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
  logo: kitzLogo,
};

// PDF Header component
function PdfHeader() {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.senderLine}>{COMPANY.senderLine}</Text>
      <View style={styles.headerContent}>
        <Image src={COMPANY.logo} style={styles.logo} />
      </View>
      <View style={styles.contactSection}>
        <View style={styles.contactColumns}>
          <View style={[styles.contactColumn, styles.contactColumnLeft]}>
            <Text style={styles.contactLine}>{COMPANY.wolfsberg.address}, {COMPANY.wolfsberg.city}</Text>
            <Text style={styles.contactLine}>Tel. {COMPANY.wolfsberg.tel} Fax. {COMPANY.wolfsberg.fax}</Text>
            <Text style={styles.contactLine}>E-mail: {COMPANY.wolfsberg.email}</Text>
          </View>
          <View style={[styles.contactColumn, styles.contactColumnRight]}>
            <Text style={styles.contactLine}>{COMPANY.klagenfurt.address}, {COMPANY.klagenfurt.city}</Text>
            <Text style={styles.contactLine}>Tel. {COMPANY.klagenfurt.tel} Fax. {COMPANY.klagenfurt.fax}</Text>
            <Text style={styles.contactLine}>E-mail: {COMPANY.klagenfurt.email}</Text>
          </View>
        </View>
        <Text style={styles.websiteLine}>{COMPANY.website}</Text>
      </View>
    </View>
  );
}

// PDF Footer component
function PdfFooter() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerTextBold}>
        Es gelten die aktuellen Allgemeinen Geschäftsbedingungen der KITZ Computer + Office GmbH.
      </Text>
      <Text style={styles.footerText}>
        Diese sind jederzeit abrufbar unter www.kitz.co.at
      </Text>
      <Text style={styles.footerText}>
        Reklamation nur sofort. Die gelieferte Ware bleibt bis zur vollständigen Bezahlung unser Eigentum. Bei Zahlungsverzug berechnen wir bankmäßige Verzugszinsen. Gerichtsstand und Erfüllungsort ist Wolfsberg. Fn - 107314s
      </Text>
    </View>
  );
}

// Table header component
function TableHeader() {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.headerText, styles.colQty]}>Menge</Text>
      <Text style={[styles.headerText, styles.colCode]}>Code</Text>
      <Text style={[styles.headerText, styles.colName]}>Bezeichnung</Text>
      <Text style={[styles.headerText, styles.colTier]}>Laufzeit</Text>
      <Text style={[styles.headerText, styles.colPrice]}>Preis</Text>
    </View>
  );
}

// Table row component
function TableRow({ item, index, isMonthly }) {
  const isAlt = index % 2 === 1;
  const tierLabel = item.tier ? TIER_LABEL_OFFER[item.tier] : '';
  const modeLabel =
    item.mode === 'rent' && item.type === 'term'
      ? 'Miete'
      : item.mode === 'buy'
      ? 'Kauf'
      : '';
  const hourLabel = item.type === 'h' ? `(${item.qty} Std.)` : '';
  const hasDiscountQty = item.discountQty > 0;
  const totalQty = (item.qty || 0) + (item.discountQty || 0);

  // Build quantity display
  let qtyDisplay = String(totalQty);
  if (hasDiscountQty && item.qty > 0) {
    qtyDisplay = `${item.qty}+${item.discountQty}`;
  } else if (hasDiscountQty && item.qty === 0) {
    qtyDisplay = String(item.discountQty);
  }

  return (
    <View style={[styles.tableRow, isAlt && styles.tableRowAlt]} wrap={false}>
      <Text style={[styles.cellText, styles.colQty]}>{qtyDisplay}</Text>
      <Text style={[styles.cellCode, styles.colCode]}>{item.code || '-'}</Text>
      <View style={styles.colName}>
        <Text style={styles.cellText}>
          {item.name}
          {hourLabel ? ` ${hourLabel}` : ''}
        </Text>
        {hasDiscountQty && item.qty > 0 && (
          <Text style={styles.cellDiscount}>
            ({item.qty}x €{fmt(item.unitPrice)} + {item.discountQty}x €{fmt(item.discountPrice)} {item.discountLabel})
          </Text>
        )}
        {hasDiscountQty && item.qty === 0 && (
          <Text style={styles.cellDiscount}>
            ({item.discountLabel}: €{fmt(item.discountPrice)})
          </Text>
        )}
      </View>
      <Text style={[styles.cellText, styles.colTier]}>
        {tierLabel || modeLabel || '-'}
      </Text>
      <Text style={[styles.cellPrice, styles.colPrice]}>
        {fmt(item.lineTotal)}
        {isMonthly ? '/Mo' : ''}
      </Text>
    </View>
  );
}

// Totals box component
function TotalsBox({ netto, isMonthly }) {
  const ust = netto * 0.2;
  const brutto = netto * 1.2;
  const suffix = isMonthly ? '/Monat' : '';

  return (
    <View style={styles.totalsBox} wrap={false}>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>Netto{suffix}</Text>
        <Text style={styles.totalsValue}>{fmt(netto)}</Text>
      </View>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>20% USt</Text>
        <Text style={styles.totalsValue}>{fmt(ust)}</Text>
      </View>
      <View style={[styles.totalsRow, styles.totalsFinal]}>
        <Text style={styles.totalsFinalLabel}>Brutto{suffix}</Text>
        <Text style={styles.totalsFinalValue}>{fmt(brutto)}</Text>
      </View>
    </View>
  );
}

// Period total summary component
function PeriodSummary({ periodTotal }) {
  const brutto = periodTotal * 1.2;

  return (
    <View style={styles.periodSummary} wrap={false}>
      <Text style={styles.periodSummaryTitle}>GESAMTÜBERSICHT</Text>
      <View style={styles.periodSummaryContent}>
        <Text style={styles.periodSummaryLabel}>
          Vertragslaufzeit gesamt (monatlich x Laufzeit + einmalig)
        </Text>
        <View style={styles.periodSummaryValues}>
          <Text style={styles.periodSummaryNetto}>{fmt(periodTotal)} netto</Text>
          <Text style={styles.periodSummaryBrutto}>{fmt(brutto)} brutto</Text>
        </View>
      </View>
    </View>
  );
}

// Signature section component
function SignatureSection() {
  return (
    <View style={styles.signatureSection} wrap={false}>
      <Text style={styles.signatureTitle}>Auftragsbestätigung</Text>
      <Text style={styles.signatureText}>
        Mit meiner Unterschrift bestätige ich die Annahme dieses Angebots zu den oben genannten Bedingungen.
      </Text>
      <View style={styles.signatureFields}>
        <View style={styles.signatureField}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Ort, Datum</Text>
        </View>
        <View style={styles.signatureField}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Unterschrift / Firmenstempel</Text>
        </View>
      </View>
    </View>
  );
}

// Financing section component
function FinancingSection({ periodBrutto, maxMonths, raten }) {
  const totalWithInterest = periodBrutto * 1.08;
  const downPayment = totalWithInterest * 0.3;
  const restAmount = totalWithInterest * 0.7;
  const perRate = restAmount / raten;
  const monthlyRent = (periodBrutto / maxMonths) * 1.08;

  return (
    <View style={styles.financingSection} wrap={false}>
      <Text style={styles.financingTitle}>FINANZIERUNGSOPTIONEN</Text>

      {/* Option 1: Ratenzahlung */}
      <View style={styles.financingOption}>
        <Text style={styles.financingOptionTitle}>
          Option 1: Ratenzahlung (+8%)
        </Text>
        <View style={styles.financingRow}>
          <Text style={styles.financingLabel}>Gesamtbetrag (+8%)</Text>
          <Text style={styles.financingValue}>{fmt(totalWithInterest)} brutto</Text>
        </View>
        <View style={styles.financingRow}>
          <Text style={styles.financingLabel}>Anzahlung (30%)</Text>
          <Text style={[styles.financingValue, styles.financingHighlight]}>
            {fmt(downPayment)} brutto
          </Text>
        </View>
        <View style={styles.financingRow}>
          <Text style={styles.financingLabel}>Restbetrag in {raten} Raten</Text>
          <Text style={styles.financingValue}>{fmt(perRate)}/Rate</Text>
        </View>
      </View>

      {/* Option 2: Miete */}
      <View style={styles.financingOptionLast}>
        <Text style={styles.financingOptionTitle}>Option 2: Miete (+8%)</Text>
        <View style={styles.financingRow}>
          <Text style={styles.financingLabel}>Kaution (einmalig)</Text>
          <Text style={[styles.financingValue, styles.financingHighlight]}>
            500,00 brutto
          </Text>
        </View>
        <View style={styles.financingRow}>
          <Text style={styles.financingLabel}>Monatliche Miete (+8%)</Text>
          <Text style={styles.financingValue}>{fmt(monthlyRent)}/Monat brutto</Text>
        </View>
      </View>
    </View>
  );
}

// Main PDF Document component
export default function OfferPdfDocument({
  customer,
  monthlyItems,
  onceItems,
  totals,
  notes,
  raten,
  showFinancing = false,
  creator = null,
}) {
  const date = new Date().toLocaleDateString('de-AT');
  const periodBrutto = totals.periodTotal * 1.2;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <PdfHeader />

        {/* Title */}
        <Text style={styles.title}>ANGEBOT</Text>
        <Text style={styles.date}>Datum: {date}</Text>

        {/* Customer Info */}
        <View style={styles.customerSection} wrap={false}>
          <Text style={styles.customerLabel}>Kunde</Text>
          {customer.company && (
            <Text style={styles.customerName}>{customer.company}</Text>
          )}
          {customer.name && (
            <Text style={styles.customerDetail}>z.Hd. {customer.name}</Text>
          )}
          {customer.email && (
            <Text style={styles.customerDetail}>{customer.email}</Text>
          )}
          {customer.phone && (
            <Text style={styles.customerDetail}>Tel: {customer.phone}</Text>
          )}
          {!customer.company &&
            !customer.name &&
            !customer.email &&
            !customer.phone && (
              <Text style={styles.customerDetail}>-</Text>
            )}
        </View>

        {/* Monthly Costs Table */}
        {monthlyItems.length > 0 && (
          <View style={styles.table}>
            <Text style={[styles.sectionTitle, styles.sectionTitleMonthly]}>
              MONATLICHE KOSTEN
            </Text>
            <TableHeader />
            {monthlyItems.map((item, idx) => (
              <TableRow key={item.id} item={item} index={idx} isMonthly={true} />
            ))}
            <TotalsBox netto={totals.monthly} isMonthly={true} />
          </View>
        )}

        {/* One-time Costs Table */}
        {onceItems.length > 0 && (
          <View style={styles.table}>
            <Text style={[styles.sectionTitle, styles.sectionTitleOnce]}>
              EINMALIGE KOSTEN
            </Text>
            <TableHeader />
            {onceItems.map((item, idx) => (
              <TableRow key={item.id} item={item} index={idx} isMonthly={false} />
            ))}
            <TotalsBox netto={totals.once} isMonthly={false} />
          </View>
        )}

        {/* Period Total Summary */}
        {(totals.monthly > 0 || totals.once > 0) && (
          <PeriodSummary periodTotal={totals.periodTotal} />
        )}

        {/* Notes */}
        {notes && notes.trim() && (
          <View style={styles.notesSection} wrap={false}>
            <Text style={styles.notesTitle}>Anmerkungen</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        {/* Creator Info */}
        {creator && (
          <View style={styles.creatorSection} wrap={false}>
            <Text style={styles.creatorTitle}>Ihr Ansprechpartner</Text>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <Text style={styles.creatorDetail}>{creator.role}</Text>
            <Text style={styles.creatorDetail}>Tel: {creator.phone}</Text>
            <Text style={styles.creatorDetail}>E-Mail: {creator.email}</Text>
          </View>
        )}

        {/* Signature Section */}
        <SignatureSection />

        {/* Footer - only on last page */}
        {!(showFinancing && (totals.monthly > 0 || totals.once > 0)) && (
          <PdfFooter />
        )}

        {/* Page number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Seite ${pageNumber} von ${totalPages}`
          }
          fixed
        />
      </Page>

      {/* Financing Options - Separate Page */}
      {showFinancing && (totals.monthly > 0 || totals.once > 0) && (
        <Page size="A4" style={styles.page}>
          {/* Header */}
          <PdfHeader />

          <FinancingSection
            periodBrutto={periodBrutto}
            maxMonths={totals.maxMonths}
            raten={raten}
          />

          {/* Footer */}
          <PdfFooter />

          {/* Page number */}
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `Seite ${pageNumber} von ${totalPages}`
            }
            fixed
          />
        </Page>
      )}
    </Document>
  );
}
