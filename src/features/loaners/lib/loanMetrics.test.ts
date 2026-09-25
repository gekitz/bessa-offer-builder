import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  computeDeviceMetrics,
  isLoanFullyReturned,
  canCheckOut,
  loanHolderByDevice,
  customerLoanCounts,
  type LoanSpan,
} from './loanMetrics';
import type { Loan, LoanerDevice } from '../types';

const TODAY = '2026-09-16';

function device(overrides: Partial<LoanerDevice> = {}): LoanerDevice {
  return {
    id: 'dev-1',
    productId: 'sunmi-l3',
    bezeichnung: 'Sunmi L3',
    serialNumber: 'SN-0001',
    inventoryNo: null,
    acquisitionCost: 400,
    acquiredAt: '2025-09-16', // exactly one year ago
    notionalDailyValue: null,
    status: 'available',
    standort: 'klagenfurt',
    tags: [],
    note: null,
    active: true,
    createdAt: '2025-09-16T00:00:00Z',
    updatedAt: '2025-09-16T00:00:00Z',
    ...overrides,
  };
}

describe('daysBetween', () => {
  it('counts calendar days and never goes negative', () => {
    expect(daysBetween('2026-09-01', '2026-09-16')).toBe(15);
    expect(daysBetween('2026-09-16', '2026-09-16')).toBe(0);
    expect(daysBetween('2026-09-16', '2026-09-01')).toBe(0); // clamped
  });

  it('spans month and year boundaries', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2025-09-16', '2026-09-16')).toBe(365);
  });
});

describe('computeDeviceMetrics', () => {
  it('sums closed spans and counts an open span up to today', () => {
    const spans: LoanSpan[] = [
      { startedAt: '2026-01-01', returnedAt: '2026-01-11' }, // 10 days
      { startedAt: '2026-09-06', returnedAt: null }, // open → 10 days to today
    ];
    const m = computeDeviceMetrics(device(), spans, TODAY);
    expect(m.loanCount).toBe(2);
    expect(m.totalDaysOnLoan).toBe(20);
    expect(m.daysOwned).toBe(365);
    expect(m.utilization).toBeCloseTo(20 / 365, 6);
    expect(m.amortizedCostPerLoan).toBe(200); // 400 / 2
  });

  it('returns zeros / nulls for a never-loaned device', () => {
    const m = computeDeviceMetrics(device(), [], TODAY);
    expect(m.loanCount).toBe(0);
    expect(m.totalDaysOnLoan).toBe(0);
    expect(m.utilization).toBe(0); // owned but never out
    expect(m.amortizedCostPerLoan).toBeNull(); // no loans to divide by
  });

  it('leaves daysOwned/utilization null when acquiredAt is unknown', () => {
    const spans: LoanSpan[] = [{ startedAt: '2026-09-06', returnedAt: null }];
    const m = computeDeviceMetrics(device({ acquiredAt: null }), spans, TODAY);
    expect(m.daysOwned).toBeNull();
    expect(m.utilization).toBeNull();
    expect(m.totalDaysOnLoan).toBe(10);
  });

  it('leaves amortizedCostPerLoan null when cost is unknown', () => {
    const spans: LoanSpan[] = [{ startedAt: '2026-09-06', returnedAt: '2026-09-16' }];
    const m = computeDeviceMetrics(device({ acquisitionCost: null }), spans, TODAY);
    expect(m.amortizedCostPerLoan).toBeNull();
  });

  it('computes notionalDb only when both cost and daily value are set', () => {
    const spans: LoanSpan[] = [{ startedAt: '2026-08-17', returnedAt: '2026-09-16' }]; // 30 days
    const withRate = computeDeviceMetrics(
      device({ notionalDailyValue: 20 }),
      spans,
      TODAY,
    );
    expect(withRate.notionalDb).toBe(30 * 20 - 400); // 200
    const withoutRate = computeDeviceMetrics(device(), spans, TODAY);
    expect(withoutRate.notionalDb).toBeNull();
  });
});

describe('isLoanFullyReturned', () => {
  it('is true only when every device on the loan is returned', () => {
    expect(isLoanFullyReturned([{ returnedAt: '2026-09-16' }, { returnedAt: '2026-09-16' }])).toBe(true);
    expect(isLoanFullyReturned([{ returnedAt: '2026-09-16' }, { returnedAt: null }])).toBe(false);
    expect(isLoanFullyReturned([{ returnedAt: null }])).toBe(false);
  });

  it('is false for an empty loan (nothing was handed out)', () => {
    expect(isLoanFullyReturned([])).toBe(false);
  });
});

describe('canCheckOut', () => {
  it('allows only available, active devices', () => {
    expect(canCheckOut({ status: 'available', active: true })).toBe(true);
    expect(canCheckOut({ status: 'on_loan', active: true })).toBe(false);
    expect(canCheckOut({ status: 'defective', active: true })).toBe(false);
    expect(canCheckOut({ status: 'retired', active: true })).toBe(false);
    expect(canCheckOut({ status: 'available', active: false })).toBe(false);
  });
});

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    customerName: 'Gasthaus Müller',
    customerKdnr: '10001',
    ticketId: null,
    startedAt: '2026-09-01',
    expectedReturn: null,
    note: null,
    mesonicBelegLaufnummer: null,
    mesonicBelegKey: null,
    mesonicBelegCreatedAt: null,
    createdBy: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    devices: [],
    ...overrides,
  };
}

// A loan_devices line — only deviceId/returnedAt matter to these helpers.
function line(deviceId: string, returnedAt: string | null = null) {
  return { id: `ld-${deviceId}`, loanId: 'loan-1', deviceId, returnedAt, note: null, createdAt: '2026-09-01T00:00:00Z' };
}

describe('loanHolderByDevice', () => {
  it('maps each still-out device to its loan customer', () => {
    const map = loanHolderByDevice([
      loan({ customerName: 'A', customerKdnr: '1', devices: [line('d1'), line('d2')] }),
    ]);
    expect(map.get('d1')).toEqual({ name: 'A', kdnr: '1' });
    expect(map.get('d2')).toEqual({ name: 'A', kdnr: '1' });
  });

  it('skips already-returned lines', () => {
    const map = loanHolderByDevice([
      loan({ devices: [line('d1'), line('d2', '2026-09-10')] }),
    ]);
    expect(map.has('d1')).toBe(true);
    expect(map.has('d2')).toBe(false);
  });

  it('tolerates a loan without a devices join', () => {
    expect(loanHolderByDevice([loan({ devices: undefined })]).size).toBe(0);
  });
});

describe('customerLoanCounts', () => {
  it('counts devices per customer and sorts by name (de)', () => {
    const map = loanHolderByDevice([
      loan({ customerName: 'Zeta', customerKdnr: '9', devices: [line('d1')] }),
      loan({ id: 'loan-2', customerName: 'Ärzte', customerKdnr: '2', devices: [line('d2'), line('d3')] }),
    ]);
    expect(customerLoanCounts(map)).toEqual([
      { kdnr: '2', name: 'Ärzte', count: 2 }, // 'Ä' sorts before 'Z' in de
      { kdnr: '9', name: 'Zeta', count: 1 },
    ]);
  });

  it('aggregates a customer that holds devices across two loans by kdnr', () => {
    const map = loanHolderByDevice([
      loan({ customerName: 'Müller', customerKdnr: '5', devices: [line('d1')] }),
      loan({ id: 'loan-2', customerName: 'Müller', customerKdnr: '5', devices: [line('d2')] }),
    ]);
    expect(customerLoanCounts(map)).toEqual([{ kdnr: '5', name: 'Müller', count: 2 }]);
  });

  it('is empty when nothing is out', () => {
    expect(customerLoanCounts(new Map())).toEqual([]);
  });
});
