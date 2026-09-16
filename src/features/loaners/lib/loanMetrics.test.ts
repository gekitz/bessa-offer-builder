import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  computeDeviceMetrics,
  isLoanFullyReturned,
  canCheckOut,
  type LoanSpan,
} from './loanMetrics';
import type { LoanerDevice } from '../types';

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
