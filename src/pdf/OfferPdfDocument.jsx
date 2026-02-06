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
  address1: 'Rosentaler Straße 1, A-9020 Klagenfurt',
  address2: 'Johann-Offner-Straße 17, A-9400 Wolfsberg',
  phone1: '+43 (0) 463 504454',
  phone2: '+43 (0) 4352 4176',
  email: 'officekl@kitz.co.at',
  website: 'www.kitz.co.at',
  logo: kitzLogo,
};

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

  return (
    <View style={[styles.tableRow, isAlt && styles.tableRowAlt]}>
      <Text style={[styles.cellText, styles.colQty]}>{item.qty}</Text>
      <Text style={[styles.cellCode, styles.colCode]}>{item.code || '-'}</Text>
      <Text style={[styles.cellText, styles.colName]}>
        {item.name}
        {hourLabel ? ` ${hourLabel}` : ''}
      </Text>
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
    <View style={styles.totalsBox}>
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
    <View style={styles.periodSummary}>
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

// Financing section component
function FinancingSection({ periodBrutto, maxMonths, raten }) {
  const totalWithInterest = periodBrutto * 1.08;
  const downPayment = totalWithInterest * 0.3;
  const restAmount = totalWithInterest * 0.7;
  const perRate = restAmount / raten;
  const monthlyRent = (periodBrutto / maxMonths) * 1.08;

  return (
    <View style={styles.financingSection}>
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
}) {
  const date = new Date().toLocaleDateString('de-AT');
  const periodBrutto = totals.periodTotal * 1.2;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={COMPANY.logo} style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{COMPANY.name}</Text>
            <Text>{COMPANY.address1}</Text>
            <Text>{COMPANY.address2}</Text>
            <Text>
              Tel: {COMPANY.phone1} | {COMPANY.phone2}
            </Text>
            <Text>
              {COMPANY.email} | {COMPANY.website}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>ANGEBOT</Text>
        <Text style={styles.date}>Datum: {date}</Text>

        {/* Customer Info */}
        <View style={styles.customerSection}>
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
          <View style={styles.notesSection}>
            <Text style={styles.notesTitle}>Anmerkungen</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Alle Preise verstehen sich netto exkl. USt. Bei 12/6/2-Monats-Verträgen
            jeweils monatlich.
          </Text>
          <Text style={styles.footerText}>
            Dieses Angebot ist freibleibend und unverbindlich. Stand: {date}
          </Text>
        </View>

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
          <View style={styles.header}>
            <Image src={COMPANY.logo} style={styles.logo} />
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{COMPANY.name}</Text>
              <Text>{COMPANY.address1}</Text>
              <Text>{COMPANY.address2}</Text>
              <Text>
                Tel: {COMPANY.phone1} | {COMPANY.phone2}
              </Text>
              <Text>
                {COMPANY.email} | {COMPANY.website}
              </Text>
            </View>
          </View>

          <FinancingSection
            periodBrutto={periodBrutto}
            maxMonths={totals.maxMonths}
            raten={raten}
          />

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
