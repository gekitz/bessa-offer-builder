// Leihstellungen — reine Geschäftslogik (keine Supabase-/Netzwerk-Aufrufe):
// Deckungsbeitrag/Auslastung je Gerät, Rückgabe-Status und Check-out-Guard.
// `today` wird immer übergeben, damit die Funktionen deterministisch testbar
// bleiben. Siehe docs/leihstellungen.md.

import type { IsoDate, Loan, LoanerDevice } from '../types';

// 'YYYY-MM-DD' → ganze Tage seit Epoch (UTC, zeitzonenunabhängig).
function toUtcDays(d: IsoDate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

// Tage zwischen zwei Datumsangaben (nie negativ).
export function daysBetween(start: IsoDate, end: IsoDate): number {
  return Math.max(0, toUtcDays(end) - toUtcDays(start));
}

// Eine Leihzeile aus Sicht der Kennzahlen: Leihbeginn (vom loans-Kopf) +
// Rückgabedatum (null = noch verliehen, zählt bis heute).
export interface LoanSpan {
  startedAt: IsoDate;
  returnedAt: IsoDate | null;
}

export interface DeviceMetrics {
  loanCount: number;
  totalDaysOnLoan: number;
  // null, wenn acquiredAt unbekannt ist (keine Bezugsgröße).
  daysOwned: number | null;
  // Auslastung 0..1 (Leihtage / Besitztage); null wenn nicht berechenbar.
  utilization: number | null;
  // acquisitionCost / loanCount; null wenn Kosten oder Leihen fehlen.
  amortizedCostPerLoan: number | null;
  // Nur DB-Reporting (nicht im v1-UI): Leihtage × Tagessatz − Anschaffung.
  notionalDb: number | null;
}

// Kostendeckung/Auslastung eines Geräts aus seinen Leihzeilen.
export function computeDeviceMetrics(
  device: Pick<LoanerDevice, 'acquisitionCost' | 'acquiredAt' | 'notionalDailyValue'>,
  spans: LoanSpan[],
  today: IsoDate,
): DeviceMetrics {
  const totalDaysOnLoan = spans.reduce(
    (sum, s) => sum + daysBetween(s.startedAt, s.returnedAt ?? today),
    0,
  );
  const loanCount = spans.length;
  const daysOwned = device.acquiredAt ? daysBetween(device.acquiredAt, today) : null;
  const utilization =
    daysOwned && daysOwned > 0 ? totalDaysOnLoan / daysOwned : null;
  const amortizedCostPerLoan =
    device.acquisitionCost != null && loanCount > 0
      ? device.acquisitionCost / loanCount
      : null;
  const notionalDb =
    device.notionalDailyValue != null && device.acquisitionCost != null
      ? totalDaysOnLoan * device.notionalDailyValue - device.acquisitionCost
      : null;
  return { loanCount, totalDaysOnLoan, daysOwned, utilization, amortizedCostPerLoan, notionalDb };
}

// Eine Leihstellung ist vollständig zurückgenommen, wenn sie mindestens ein
// Gerät hatte und alle Zeilen ein Rückgabedatum tragen.
export function isLoanFullyReturned(spans: Pick<LoanSpan, 'returnedAt'>[]): boolean {
  return spans.length > 0 && spans.every((s) => s.returnedAt != null);
}

// ─── Kunde eines offenen Leihs (für die „Kunde“-Filterung im Bestand) ───

export interface LoanHolder {
  name: string; // Anzeige
  kdnr: string; // Mesonic Kontonummer — stabiler Filterschlüssel
}

// deviceId → Kunde des offenen Leihs, das dieses Gerät hält. Nur noch nicht
// zurückgegebene Zeilen (returnedAt == null) zählen.
export function loanHolderByDevice(
  openLoans: Pick<Loan, 'customerName' | 'customerKdnr' | 'devices'>[],
): Map<string, LoanHolder> {
  const map = new Map<string, LoanHolder>();
  for (const loan of openLoans) {
    for (const ld of loan.devices ?? []) {
      if (ld.returnedAt == null) {
        map.set(ld.deviceId, { name: loan.customerName, kdnr: loan.customerKdnr });
      }
    }
  }
  return map;
}

export interface CustomerLoanCount {
  kdnr: string;
  name: string;
  count: number; // Anzahl aktuell verliehener Geräte
}

// Kunden mit aktuell verliehenen Geräten, je Kunde die Geräteanzahl,
// alphabetisch nach Name (de). Basis für das Kunden-Filterdropdown.
export function customerLoanCounts(holderByDevice: Map<string, LoanHolder>): CustomerLoanCount[] {
  const byKdnr = new Map<string, CustomerLoanCount>();
  for (const { name, kdnr } of holderByDevice.values()) {
    const existing = byKdnr.get(kdnr);
    if (existing) existing.count += 1;
    else byKdnr.set(kdnr, { kdnr, name, count: 1 });
  }
  return [...byKdnr.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// Nur verfügbare, aktive Geräte dürfen verliehen werden. Die harte
// „ein offenes Leih pro Gerät“-Regel erzwingt zusätzlich der DB-Unique-Index.
export function canCheckOut(
  device: Pick<LoanerDevice, 'status' | 'active'>,
): boolean {
  return device.active && device.status === 'available';
}
