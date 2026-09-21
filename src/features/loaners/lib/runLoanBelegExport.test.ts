import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Loan, LoanerDevice } from '../types';

// exportLoanBeleg wires the pure Beleg transform (loanBeleg.ts) to the shared
// Mesonic primitives (readMaxLaufnummer/importBeleg) and the loan idempotency
// anchor (setLoanBelegExport). We mock those three impure edges; buildLoanBelegXml
// stays real (pure). The idempotency skip is exactly what the retroactive
// "Leih-Lieferschein erzeugen" button relies on, so it's pinned here.

const readMaxLaufnummer = vi.fn();
const importBeleg = vi.fn();
const setLoanBelegExport = vi.fn();

vi.mock('../../tickets/lib/runTicketBelegExport', () => ({
  readMaxLaufnummer: (...a: unknown[]) => readMaxLaufnummer(...a),
  importBeleg: (...a: unknown[]) => importBeleg(...a),
}));
vi.mock('../api/loanerApi', () => ({
  setLoanBelegExport: (...a: unknown[]) => setLoanBelegExport(...a),
}));

import { exportLoanBeleg } from './runLoanBelegExport';

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    customerName: 'ALFRED PFANDL',
    customerKdnr: '24998',
    ticketId: null,
    startedAt: '2026-09-20',
    expectedReturn: null,
    note: null,
    mesonicBelegLaufnummer: null,
    mesonicBelegKey: null,
    mesonicBelegCreatedAt: null,
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeDevice(overrides: Partial<LoanerDevice> = {}): LoanerDevice {
  return {
    id: 'dev-1',
    productId: null,
    bezeichnung: 'Sunmi T2s',
    serialNumber: 'TS42245840793',
    inventoryNo: null,
    acquisitionCost: null,
    acquiredAt: null,
    notionalDailyValue: null,
    status: 'on_loan',
    standort: 'klagenfurt',
    tags: [],
    note: null,
    active: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('exportLoanBeleg', () => {
  beforeEach(() => {
    readMaxLaufnummer.mockReset();
    importBeleg.mockReset();
    setLoanBelegExport.mockReset();
  });

  it('skips (idempotent) when the loan already has a Beleg key', async () => {
    const res = await exportLoanBeleg(makeLoan({ mesonicBelegKey: '24998-26' }), [makeDevice()]);
    expect(res).toEqual({ ok: true, belegKey: '24998-26', skipped: true });
    expect(readMaxLaufnummer).not.toHaveBeenCalled();
    expect(importBeleg).not.toHaveBeenCalled();
    expect(setLoanBelegExport).not.toHaveBeenCalled();
  });

  it('fails without a WinLine account (Kd.-Nr.)', async () => {
    const res = await exportLoanBeleg(makeLoan({ customerKdnr: '' }), [makeDevice()]);
    expect(res.ok).toBe(false);
    expect(importBeleg).not.toHaveBeenCalled();
  });

  it('fails when there are no devices', async () => {
    const res = await exportLoanBeleg(makeLoan(), []);
    expect(res.ok).toBe(false);
    expect(importBeleg).not.toHaveBeenCalled();
  });

  it('reads the next Laufnummer, imports the Beleg, and stores the anchor', async () => {
    readMaxLaufnummer.mockResolvedValue(25);
    importBeleg.mockResolvedValue({ ok: true });
    setLoanBelegExport.mockResolvedValue(undefined);

    const res = await exportLoanBeleg(makeLoan(), [makeDevice(), makeDevice({ id: 'dev-2' })]);

    expect(readMaxLaufnummer).toHaveBeenCalledWith('24998');
    // laufnummer = max + 1
    const xml = importBeleg.mock.calls[0][0] as string;
    expect(typeof xml).toBe('string');
    // one TEXT position per device
    expect(xml.match(/Leihstellung:/g)?.length).toBe(2);
    expect(setLoanBelegExport).toHaveBeenCalledWith('loan-1', 26, '24998-26');
    expect(res).toEqual({ ok: true, belegKey: '24998-26', laufnummer: 26 });
  });

  it('does not store the anchor when the Mesonic import fails', async () => {
    readMaxLaufnummer.mockResolvedValue(0);
    importBeleg.mockResolvedValue({ ok: false, error: 'Import fehlgeschlagen' });

    const res = await exportLoanBeleg(makeLoan(), [makeDevice()]);

    expect(res.ok).toBe(false);
    expect(res.error).toBe('Import fehlgeschlagen');
    expect(setLoanBelegExport).not.toHaveBeenCalled();
  });

  it('never throws — a thrown primitive is returned as an error result', async () => {
    readMaxLaufnummer.mockRejectedValue(new Error('Mesonic nicht erreichbar'));
    const res = await exportLoanBeleg(makeLoan(), [makeDevice()]);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Mesonic nicht erreichbar');
  });
});
