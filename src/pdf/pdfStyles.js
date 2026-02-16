import { StyleSheet } from '@react-pdf/renderer';

// Using built-in Helvetica font for reliable PDF generation
// (Custom web fonts have compatibility issues with @react-pdf/renderer in browser)

// KITZ Brand Colors
export const COLORS = {
  kitzRed: '#E42228',
  kitzRedLight: '#FEF2F2',
  dark: '#1F2937',
  medium: '#6B7280',
  light: '#9CA3AF',
  border: '#E5E7EB',
  background: '#F9FAFB',
  white: '#FFFFFF',
  amber: '#F59E0B',
  amberLight: '#FFFBEB',
};

// Shared PDF styles
export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    color: COLORS.dark,
    backgroundColor: COLORS.white,
  },

  // Header
  header: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.kitzRed,
  },
  senderLine: {
    fontSize: 7,
    color: COLORS.medium,
    marginBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  logo: {
    width: 100,
    height: 46,
  },
  contactSection: {
    marginTop: 10,
  },
  contactColumns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  contactColumn: {
    fontSize: 8,
    color: COLORS.medium,
    width: '48%',
  },
  contactColumnLeft: {
    textAlign: 'left',
  },
  contactColumnRight: {
    textAlign: 'right',
  },
  contactLine: {
    marginBottom: 1,
  },
  websiteLine: {
    fontSize: 8,
    color: COLORS.medium,
    textAlign: 'center',
    marginTop: 4,
  },

  // Title
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.kitzRed,
    marginBottom: 5,
  },
  date: {
    fontSize: 10,
    color: COLORS.medium,
    marginBottom: 25,
  },

  // Customer section
  customerSection: {
    backgroundColor: COLORS.background,
    padding: 15,
    marginBottom: 20,
    borderRadius: 4,
  },
  customerLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.medium,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  customerName: {
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.dark,
    marginBottom: 2,
  },
  customerDetail: {
    fontSize: 10,
    color: COLORS.medium,
    marginBottom: 2,
  },

  // Table section
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.white,
    padding: '8 12',
    marginTop: 15,
  },
  sectionTitleMonthly: {
    backgroundColor: COLORS.kitzRed,
  },
  sectionTitleOnce: {
    backgroundColor: COLORS.amber,
  },

  // Table
  table: {
    marginBottom: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 30,
  },
  tableRowAlt: {
    backgroundColor: COLORS.background,
  },

  // Table columns
  colQty: { width: '8%', textAlign: 'center' },
  colCode: { width: '10%' },
  colName: { width: '42%' },
  colTier: { width: '20%' },
  colPrice: { width: '20%', textAlign: 'right' },

  headerText: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.medium,
    textTransform: 'uppercase',
  },
  cellText: {
    fontSize: 9,
    color: COLORS.dark,
  },
  cellCode: {
    fontSize: 8,
    fontFamily: 'Courier',
    color: COLORS.medium,
  },
  cellPrice: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },

  // Totals box
  totalsBox: {
    backgroundColor: COLORS.background,
    padding: 12,
    marginTop: 0,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  totalsLabel: {
    fontSize: 9,
    color: COLORS.medium,
    width: 100,
    textAlign: 'right',
    paddingRight: 15,
  },
  totalsValue: {
    fontSize: 9,
    color: COLORS.dark,
    width: 80,
    textAlign: 'right',
  },
  totalsFinal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 4,
    paddingTop: 6,
  },
  totalsFinalLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.dark,
    width: 100,
    textAlign: 'right',
    paddingRight: 15,
  },
  totalsFinalValue: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.kitzRed,
    width: 80,
    textAlign: 'right',
  },

  // Period summary section
  periodSummary: {
    marginTop: 20,
    padding: 15,
    backgroundColor: COLORS.dark,
    borderRadius: 4,
  },
  periodSummaryTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.white,
    marginBottom: 10,
  },
  periodSummaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodSummaryLabel: {
    fontSize: 9,
    color: COLORS.light,
    flex: 1,
  },
  periodSummaryValues: {
    alignItems: 'flex-end',
  },
  periodSummaryNetto: {
    fontSize: 9,
    color: COLORS.light,
    marginBottom: 2,
  },
  periodSummaryBrutto: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.kitzRed,
  },

  // Financing section
  financingSection: {
    marginTop: 25,
    padding: 15,
    backgroundColor: COLORS.kitzRedLight,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.kitzRed,
  },
  financingTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.kitzRed,
    marginBottom: 15,
  },
  financingOption: {
    marginBottom: 15,
  },
  financingOptionLast: {
    marginBottom: 0,
  },
  financingOptionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.dark,
    marginBottom: 6,
  },
  financingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  financingLabel: {
    fontSize: 9,
    color: COLORS.medium,
  },
  financingValue: {
    fontSize: 9,
    fontWeight: 500,
    color: COLORS.dark,
  },
  financingHighlight: {
    color: COLORS.kitzRed,
    fontWeight: 600,
  },

  // Notes section
  notesSection: {
    marginTop: 20,
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.medium,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 9,
    color: COLORS.dark,
    lineHeight: 1.5,
  },

  // Creator section
  creatorSection: {
    marginTop: 20,
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 4,
  },
  creatorTitle: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.medium,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  creatorName: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.dark,
    marginBottom: 2,
  },
  creatorDetail: {
    fontSize: 9,
    color: COLORS.medium,
    marginBottom: 1,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 6.5,
    color: COLORS.medium,
    textAlign: 'center',
    marginBottom: 2,
    lineHeight: 1.4,
  },
  footerTextBold: {
    fontSize: 7,
    color: COLORS.dark,
    textAlign: 'center',
    marginBottom: 3,
    fontWeight: 600,
  },

  // Page number
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 40,
    fontSize: 8,
    color: COLORS.light,
  },
});
