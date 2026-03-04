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
        {item.info && (
          <Text style={styles.cellInfo}>{item.info}</Text>
        )}
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
function PeriodSummary({ periodTotal, periodMonthly, hasMonthly, hasOnce }) {
  const brutto = periodTotal * 1.2;
  const showMonthlyRow = hasMonthly && hasOnce;

  return (
    <View style={styles.periodSummary} wrap={false}>
      <Text style={styles.periodSummaryTitle}>GESAMTÜBERSICHT</Text>
      {showMonthlyRow && (
        <View style={[styles.periodSummaryContent, { borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingBottom: 6, marginBottom: 4 }]}>
          <Text style={styles.periodSummaryLabel}>
            Monatliche Kosten × Laufzeit (monatlich × Laufzeit)
          </Text>
          <View style={styles.periodSummaryValues}>
            <Text style={styles.periodSummaryNetto}>{fmt(periodMonthly)} netto</Text>
            <Text style={[styles.periodSummaryBrutto, { color: '#1e293b' }]}>{fmt(periodMonthly * 1.2)} brutto</Text>
          </View>
        </View>
      )}
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
function SignatureSection({ signature, signedAt }) {
  return (
    <View style={styles.signatureSection} wrap={false}>
      <Text style={styles.signatureTitle}>Auftragsbestätigung</Text>
      <Text style={styles.signatureText}>
        Mit meiner Unterschrift bestätige ich die Annahme dieses Angebots zu den oben genannten Bedingungen.
      </Text>
      <View style={styles.signatureFields}>
        <View style={styles.signatureField}>
          {signedAt ? (
            <Text style={{ fontSize: 10, marginBottom: 4 }}>{signedAt}</Text>
          ) : (
            <View style={styles.signatureLine} />
          )}
          <Text style={styles.signatureLabel}>Ort, Datum</Text>
        </View>
        <View style={styles.signatureField}>
          {signature ? (
            <Image src={signature} style={{ width: 180, height: 60, marginBottom: 4 }} />
          ) : (
            <View style={styles.signatureLine} />
          )}
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

// SEPA Lastschrift-Mandat component
function SepaMandate({ customer, mandatsRef, signature, signedAt }) {
  const payerName = customer.company || customer.name || '';
  const payerAddress = customer.address || '';

  return (
    <View>
      <Text style={styles.sepaTitle}>SEPA – LASTSCHRIFT – MANDAT</Text>

      {/* Mandatsreferenz */}
      <View style={styles.sepaRefBox}>
        <Text style={styles.sepaRefLabel}>Mandatsreferenz:</Text>
        <Text style={styles.sepaRefValue}>{mandatsRef || ''}</Text>
      </View>

      {/* Zahlungsempfänger */}
      <View style={styles.sepaSection}>
        <Text style={styles.sepaSectionTitle}>Zahlungsempfänger</Text>
        <Text style={styles.sepaText}>Kitz Computer + Office GmbH</Text>
        <Text style={styles.sepaText}>Johann Offner Straße 17</Text>
        <Text style={styles.sepaText}>9400 Wolfsberg</Text>
        <Text style={[styles.sepaText, { marginTop: 6 }]}>
          <Text style={{ fontWeight: 700 }}>Creditor-ID: </Text>
          <Text style={{ fontFamily: 'Courier', fontWeight: 700 }}>AT02ZZZ00000009212</Text>
        </Text>
      </View>

      {/* Legal text */}
      <View style={styles.sepaSection}>
        <Text style={styles.sepaLegalText}>
          Ich ermächtige / Wir ermächtigen die Kitz Computer + Office GmbH, Zahlungen von meinem / unserem Konto mittels SEPA-Lastschrift einzuziehen. Zugleich weise ich / weisen wir mein / unser Kreditinstitut an, die von der Kitz Computer + Office GmbH auf mein / unser Konto gezogenen SEPA-Lastschriften einzulösen.
        </Text>
        <Text style={styles.sepaLegalText}>
          Hinweis: Ich kann / Wir können innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem / unserem Kreditinstitut vereinbarten Bedingungen.
        </Text>
        <Text style={styles.sepaLegalText}>
          Vor dem ersten Einzug einer SEPA-Lastschrift wird die Kitz Computer + Office GmbH mir / uns eine Vorabinformation (Pre-Notification) zusenden.
        </Text>
      </View>

      {/* Zahlungspflichtiger */}
      <View style={styles.sepaSection}>
        <Text style={styles.sepaSectionTitle}>Zahlungspflichtiger</Text>
        <View style={styles.sepaFieldRow}>
          <Text style={styles.sepaFieldLabel}>Name:</Text>
          <Text style={styles.sepaFieldValue}>{payerName}</Text>
        </View>
        <View style={styles.sepaFieldRow}>
          <Text style={styles.sepaFieldLabel}>Anschrift:</Text>
          <Text style={styles.sepaFieldValue}>{payerAddress}</Text>
        </View>
        <View style={[styles.sepaFieldRow, { marginTop: 10 }]}>
          <Text style={styles.sepaFieldLabel}>IBAN:</Text>
          <Text style={styles.sepaFieldValue}>{' '}</Text>
        </View>
        <View style={styles.sepaFieldRow}>
          <Text style={styles.sepaFieldLabel}>BIC:</Text>
          <Text style={styles.sepaFieldValue}>{' '}</Text>
        </View>
      </View>

      {/* Zahlungsart */}
      <View style={styles.sepaSection}>
        <Text style={styles.sepaSectionTitle}>Zahlungsart</Text>
        <View style={styles.sepaCheckRow}>
          <View style={styles.sepaCheckBox}>
            <Text style={{ fontSize: 8, fontWeight: 700 }}>X</Text>
          </View>
          <Text style={styles.sepaCheckLabel}>Wiederkehrender Einzug</Text>
        </View>
      </View>

      {/* Spesen notice */}
      <View style={styles.sepaSection}>
        <Text style={styles.sepaLegalText}>
          Anfallende Spesen bei fehlerhafter oder widerrufener Kontoabbuchung gehen zu Lasten des Zahlungspflichtigen.
        </Text>
      </View>

      {/* Signature */}
      <View style={styles.sepaSignatureFields}>
        <View style={styles.sepaSignatureField}>
          {signedAt ? (
            <Text style={{ fontSize: 10, marginBottom: 4 }}>{signedAt}</Text>
          ) : (
            <View style={styles.sepaSignatureLine} />
          )}
          <Text style={styles.sepaSignatureLabel}>Ort, Datum</Text>
        </View>
        <View style={styles.sepaSignatureField}>
          {signature ? (
            <Image src={signature} style={{ width: 180, height: 60, marginBottom: 4 }} />
          ) : (
            <View style={styles.sepaSignatureLine} />
          )}
          <Text style={styles.sepaSignatureLabel}>Unterschrift / Firmenstempel</Text>
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
  mandatsRef = '',
  signatures = null,
}) {
  const date = new Date().toLocaleDateString('de-AT');
  const signedAt = signatures ? new Date().toLocaleDateString('de-AT') : null;
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
          <PeriodSummary periodTotal={totals.periodTotal} periodMonthly={totals.periodMonthly} hasMonthly={totals.monthly > 0} hasOnce={totals.once > 0} />
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
        <SignatureSection signature={signatures?.offer} signedAt={signedAt} />

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

      {/* SEPA Mandate Page */}
      {showFinancing && (totals.monthly > 0 || totals.once > 0) && (
        <Page size="A4" style={styles.page}>
          <PdfHeader />
          <SepaMandate customer={customer} mandatsRef={mandatsRef} signature={signatures?.sepa} signedAt={signedAt} />
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
