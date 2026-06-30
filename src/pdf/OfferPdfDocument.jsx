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
import { TIER_LABEL_OFFER } from '../data/tiers';
import { computeDiscounts, SKONTO_DAYS } from '../lib/discounts';

// Format number to German locale
const fmt = (n) =>
  n.toLocaleString('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Per-page maintenance rates need 4 decimals (e.g. 0,0075 / 0,0019).
const fmtRate = (n) =>
  n.toLocaleString('de-AT', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });

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

// Wartung row component (per-year service fee for Melzer items)
function WartungRow({ item, index }) {
  const isAlt = index % 2 === 1;
  const totalQty = (item.qty || 0) + (item.discountQty || 0);
  return (
    <View style={[styles.tableRow, isAlt && styles.tableRowAlt]} wrap={false}>
      <Text style={[styles.cellText, styles.colQty]}>{totalQty}</Text>
      <Text style={[styles.cellCode, styles.colCode]}>{item.code || '-'}</Text>
      <View style={styles.colName}>
        <Text style={styles.cellText}>{item.name}</Text>
        <Text style={styles.cellInfo}>{item.servicePercent}% Wartung (UVP)</Text>
      </View>
      <Text style={[styles.cellText, styles.colTier]}>pro Jahr</Text>
      <Text style={[styles.cellPrice, styles.colPrice]}>{fmt(item.wartungLine)}</Text>
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

  // Option groups: a member that isn't the selected/recommended one renders as
  // an indented alternative showing only the price difference (Mehr-/Minderpreis).
  const isAlternative = item.optionSelected === false;
  const delta = item.optionDelta || 0;
  const deltaText =
    delta === 0
      ? 'gleicher Preis'
      : `${delta > 0 ? '+' : '-'}${fmt(Math.abs(delta))}${isMonthly ? '/Mo' : ''}`;

  // Build quantity display
  let qtyDisplay = String(totalQty);
  if (hasDiscountQty && item.qty > 0) {
    qtyDisplay = `${item.qty}+${item.discountQty}`;
  } else if (hasDiscountQty && item.qty === 0) {
    qtyDisplay = String(item.discountQty);
  }

  const specLines = item.description
    ? item.description.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    : [];

  return (
    <View style={[styles.tableRow, isAlt && styles.tableRowAlt]} wrap={false}>
      <Text style={[styles.cellText, styles.colQty]}>{isAlternative ? '' : qtyDisplay}</Text>
      <Text style={[styles.cellCode, styles.colCode]}>{isAlternative ? '' : item.code || '-'}</Text>
      <View style={styles.colName}>
        <Text style={isAlternative ? styles.cellTextAlt : styles.cellText}>
          {isAlternative ? 'Alternativ: ' : ''}
          {item.name}
          {hourLabel ? ` ${hourLabel}` : ''}
        </Text>
        {item.info && (
          <Text style={styles.cellInfo}>{item.info}</Text>
        )}
        {specLines.map((line, i) => (
          <Text key={i} style={styles.cellSpec}>• {line}</Text>
        ))}
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
        {isAlternative ? 'statt empf.' : tierLabel || modeLabel || '-'}
      </Text>
      <Text style={[isAlternative ? styles.cellPriceAlt : styles.cellPrice, styles.colPrice]}>
        {isAlternative ? deltaText : `${fmt(item.lineTotal)}${isMonthly ? '/Mo' : ''}`}
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
function PeriodSummary({ periodTotal, periodMonthly, yearly, hasMonthly, hasOnce, hasYearly, discount }) {
  const recurring = periodMonthly + yearly;
  const showRecurringRow = (hasMonthly && hasOnce) || hasYearly;
  const rabattActive = discount?.rabattActive;
  const skontoActive = discount?.skontoActive;
  const firstYearLabel =
    'Kosten im ersten Jahr (monatlich × Laufzeit + einmalig' + (hasYearly ? ' + Wartung' : '') + ')';
  const recurringLabel =
    'Kosten jedes weitere Jahr (monatlich × Laufzeit' + (hasYearly ? ' + Wartung' : '') + ')';

  return (
    <View style={styles.periodSummary} wrap={false}>
      <Text style={styles.periodSummaryTitle}>GESAMTÜBERSICHT</Text>

      {/* First-year total (+ Rabatt sub-line, kept together above the divider) */}
      <View style={styles.periodSummaryContent}>
        <Text style={styles.periodSummaryLabel}>{firstYearLabel}</Text>
        <View style={styles.periodSummaryValues}>
          {rabattActive && (
            <Text style={styles.periodSummaryStrike}>{fmt(discount.baseNetto * 1.2)} brutto</Text>
          )}
          <Text style={styles.periodSummaryNetto}>{fmt(discount.netto)} netto</Text>
          <Text style={styles.periodSummaryBrutto}>{fmt(discount.brutto)} brutto</Text>
        </View>
      </View>
      {rabattActive && (
        <View style={styles.periodSummaryRabatt}>
          <Text style={styles.periodSummaryRabattText}>inkl. 2% Rabatt</Text>
          <Text style={styles.periodSummaryRabattText}>- {fmt(discount.rabattAmount)} netto</Text>
        </View>
      )}

      {/* Recurring cost for every following year */}
      {showRecurringRow && (
        <View style={[styles.periodSummaryContent, { borderTopWidth: 0.5, borderTopColor: '#475569', paddingTop: 12, marginTop: 12 }]}>
          <Text style={styles.periodSummaryLabel}>{recurringLabel}</Text>
          <View style={styles.periodSummaryValues}>
            <Text style={styles.periodSummaryNetto}>{fmt(recurring)} netto</Text>
            <Text style={styles.periodSummaryBrutto}>{fmt(recurring * 1.2)} brutto</Text>
          </View>
        </View>
      )}

      {/* Skonto note — always last, as a conditional pay-in-full footer */}
      {skontoActive && (
        <View style={styles.periodSummarySkonto}>
          <View>
            <Text style={styles.periodSummarySkontoLabel}>Bei Zahlung innerhalb {SKONTO_DAYS} Tagen</Text>
            <Text style={styles.periodSummarySkontoSub}>3% Skonto (- {fmt(discount.skontoAmount)})</Text>
          </View>
          <Text style={styles.periodSummarySkontoValue}>{fmt(discount.skontoBrutto)} brutto</Text>
        </View>
      )}
    </View>
  );
}

// --- Copier / MFP (Sharp) offer rendering ----------------------------------
// A Sharp offer is itemised like the paper Angebot: the device table with its
// €0 bundled options, the UHG and install lines, an optional trade-in credit,
// then the Angebotssumme, the Grenke leasing terms, and the All-in
// Kopienpreiswartung rates block. Data comes from copierOffer.buildCopierOffer.

function CopierTableHeader() {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.headerText, styles.colQty]}>Menge</Text>
      <Text style={[styles.headerText, styles.colCode]}>Code</Text>
      <Text style={[styles.headerText, styles.colName]}>Bezeichnung</Text>
      <Text style={[styles.headerText, styles.colTier, { textAlign: 'right' }]}>Einzel</Text>
      <Text style={[styles.headerText, styles.colPrice]}>Gesamt</Text>
    </View>
  );
}

function CopierLineRow({ line, index }) {
  const isAlt = index % 2 === 1;
  const isIncluded = line.kind === 'included';
  const specLines =
    line.kind === 'device' && line.description
      ? line.description.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      : [];
  return (
    <View style={[styles.tableRow, isAlt && styles.tableRowAlt]} wrap={false}>
      <Text style={[styles.cellText, styles.colQty]}>{line.qty}</Text>
      <Text style={[styles.cellCode, styles.colCode]}>{line.code || '-'}</Text>
      <View style={styles.colName}>
        <Text style={styles.cellText}>{line.name}</Text>
        {specLines.map((l, i) => (
          <Text key={i} style={styles.cellSpec}>• {l}</Text>
        ))}
      </View>
      <Text style={[styles.cellText, styles.colTier, { textAlign: 'right' }]}>
        {isIncluded ? '—' : fmt(line.unitPrice)}
      </Text>
      <Text style={[styles.cellPrice, styles.colPrice]}>
        {isIncluded ? 'inkl.' : fmt(line.lineTotal)}
      </Text>
    </View>
  );
}

function CopierTotalsBox({ net, vat, gross }) {
  return (
    <View style={styles.totalsBox} wrap={false}>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>Nettosumme</Text>
        <Text style={styles.totalsValue}>{fmt(net)}</Text>
      </View>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>20% USt</Text>
        <Text style={styles.totalsValue}>{fmt(vat)}</Text>
      </View>
      <View style={[styles.totalsRow, styles.totalsFinal]}>
        <Text style={styles.totalsFinalLabel}>Angebotssumme</Text>
        <Text style={styles.totalsFinalValue}>{fmt(gross)}</Text>
      </View>
    </View>
  );
}

function LeasingBlock({ leasing, saleMode }) {
  const { rate, restwert, bearbeitungsgebuehr, vertragsgebuehr, mietsonderzahlung, termMonths } = leasing;
  const titleSuffix = saleMode === 'leasing' ? ' · gewünschte Zahlungsweise' : ' (Alternative zum Kauf)';
  return (
    <View style={styles.financingSection} wrap={false}>
      <Text style={styles.financingTitle}>LEASING – GRENKE ({termMonths} MONATE){titleSuffix}</Text>
      <View style={styles.financingRow}>
        <Text style={styles.financingLabel}>Monatliche Leasingrate</Text>
        <Text style={[styles.financingValue, styles.financingHighlight]}>{fmt(rate)}/Monat + 20% MwSt</Text>
      </View>
      <View style={styles.financingRow}>
        <Text style={styles.financingLabel}>Restwert (5%)</Text>
        <Text style={styles.financingValue}>{fmt(restwert)}</Text>
      </View>
      <View style={styles.financingRow}>
        <Text style={styles.financingLabel}>Bearbeitungsgebühr (einmalig)</Text>
        <Text style={styles.financingValue}>{fmt(bearbeitungsgebuehr)}</Text>
      </View>
      <View style={styles.financingRow}>
        <Text style={styles.financingLabel}>Vertragsgebühr (1% der Auftragssumme)</Text>
        <Text style={styles.financingValue}>{fmt(vertragsgebuehr)}</Text>
      </View>
      {mietsonderzahlung > 0 && (
        <View style={styles.financingRow}>
          <Text style={styles.financingLabel}>Mietsonderzahlung (einmalig)</Text>
          <Text style={styles.financingValue}>{fmt(mietsonderzahlung)}</Text>
        </View>
      )}
      <Text style={[styles.cellInfo, { marginTop: 6 }]}>
        Möglich nach erfolgreicher Bonitätsprüfung. Leasingpartner: GRENKE.
      </Text>
    </View>
  );
}

function MaintenanceBlock({ maintenance }) {
  const single = maintenance.length === 1;
  return (
    <View style={styles.notesSection} wrap={false}>
      <Text style={styles.notesTitle}>All-in Kopienpreiswartung</Text>
      <Text style={styles.notesText}>
        Beinhaltet: Service- und Reparaturarbeiten, Ersatzteile, Verbrauchsmaterial (Toner, Trommel, Developer) sowie Arbeits- und Wegzeit.
      </Text>
      <Text style={styles.notesText}>Ausgenommen: Papier, Folien und Heftklammern.</Text>
      <View style={{ marginTop: 6 }}>
        {maintenance.map((m, i) => (
          <Text key={i} style={styles.notesText}>
            {single ? '' : `${m.deviceName} – `}
            Preis pro Kopie/Druck s/w: € {fmtRate(m.pageBw)} · Farbe: € {fmtRate(m.pageColor)} · Scan: € {fmtRate(m.pageScan)} (zzgl. 20% MwSt)
          </Text>
        ))}
      </View>
      <Text style={[styles.notesText, { marginTop: 6 }]}>
        Die Abrechnung des tatsächlichen Zählerstandes erfolgt pro Quartal im Nachhinein.
      </Text>
    </View>
  );
}

function CopierSection({ copierOffer }) {
  return (
    <>
      <View style={styles.table}>
        <Text style={[styles.sectionTitle, styles.sectionTitleOnce]}>SHARP MFP – DIGITALKOPIERGERÄT</Text>
        <CopierTableHeader />
        {copierOffer.lines.map((line, idx) => (
          <CopierLineRow key={idx} line={line} index={idx} />
        ))}
        <CopierTotalsBox net={copierOffer.net} vat={copierOffer.vat} gross={copierOffer.gross} />
      </View>
      <LeasingBlock leasing={copierOffer.leasing} saleMode={copierOffer.saleMode} />
      <MaintenanceBlock maintenance={copierOffer.maintenance} />
    </>
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
  wartungItems = [],
  autoTerms = [],
  totals,
  notes,
  raten,
  rabattActive = false,
  skontoActive = false,
  showFinancing = false,
  creator = null,
  mandatsRef = '',
  signatures = null,
  acceptQrDataUrl = null,
  serviceStartDate = null,
  copierOffer = null,
}) {
  const date = new Date().toLocaleDateString('de-AT');
  const signedAt = signatures ? new Date().toLocaleDateString('de-AT') : null;
  // Rabatt reduces the financing base; Skonto is a pay-in-full note only.
  const discount = computeDiscounts(totals.periodTotal, { rabattActive, skontoActive });
  const periodBrutto = discount.brutto;
  // A Sharp/MFP offer renders its own itemised copier layout (device table +
  // Grenke leasing + maintenance rates) instead of the PoS monthly/once tables.
  const isCopier = !!copierOffer?.isCopierOffer;

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

        {/* Sharp / MFP copier layout (replaces the PoS cost tables) */}
        {isCopier && <CopierSection copierOffer={copierOffer} />}

        {/* Monthly Costs Table */}
        {!isCopier && monthlyItems.length > 0 && (
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
        {!isCopier && onceItems.length > 0 && (
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

        {/* Wartung pro Jahr (Melzer) */}
        {!isCopier && wartungItems.length > 0 && (
          <View style={styles.table}>
            <Text style={[styles.sectionTitle, styles.sectionTitleOnce]}>
              WARTUNG PRO JAHR
            </Text>
            <TableHeader />
            {wartungItems.map((item, idx) => (
              <WartungRow key={`w-${item.id}`} item={item} index={idx} />
            ))}
            <TotalsBox netto={totals.yearly} isMonthly={false} />
          </View>
        )}

        {/* Period Total Summary */}
        {!isCopier && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0) && (
          <PeriodSummary
            periodTotal={totals.periodTotal}
            periodMonthly={totals.periodMonthly}
            yearly={totals.yearly || 0}
            hasMonthly={totals.monthly > 0}
            hasOnce={totals.once > 0}
            hasYearly={(totals.yearly || 0) > 0}
            discount={discount}
          />
        )}

        {/* Auto-generated terms */}
        {autoTerms.length > 0 && (
          <View style={styles.notesSection} wrap={false}>
            <Text style={styles.notesTitle}>Bedingungen</Text>
            {autoTerms.map((t, i) => (
              <Text key={i} style={styles.notesText}>• {t}</Text>
            ))}
          </View>
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

        {/* Online acceptance via QR code */}
        {acceptQrDataUrl && !signatures && (
          <View
            wrap={false}
            style={{
              marginTop: 16,
              padding: 12,
              borderWidth: 1,
              borderColor: COLORS.red || '#dc2626',
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Image src={acceptQrDataUrl} style={{ width: 80, height: 80 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>
                Angebot online annehmen
              </Text>
              <Text style={{ fontSize: 9, color: '#475569', marginBottom: 2 }}>
                QR-Code scannen, Zahlungsart wählen und direkt starten.
              </Text>
              {serviceStartDate && (
                <Text style={{ fontSize: 9, color: '#475569' }}>
                  Leistungsbeginn: {new Date(serviceStartDate).toLocaleDateString('de-AT')}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Signature Section */}
        <SignatureSection signature={signatures?.offer} signedAt={signedAt} />

        {/* Footer - only on last page (copier offers have no extra pages) */}
        {!(!isCopier && showFinancing && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0)) && (
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
      {!isCopier && showFinancing && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0) && (
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
      {!isCopier && showFinancing && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0) && (
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
