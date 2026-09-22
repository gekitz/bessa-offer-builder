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
const getLoanWithDevices = vi.fn();

vi.mock('../../tickets/lib/runTicketBelegExport', () => ({
  readMaxLaufnummer: (...a: unknown[]) => readMaxLaufnummer(...a),
  importBeleg: (...a: unknown[]) => importBeleg(...a),
}));
vi.mock('../api/loanerApi', () => ({
  setLoanBelegExport: (...a: unknown[]) => setLoanBelegExport(...a),
  getLoanWithDevices: (...a: unknown[]) => getLoanWithDevices(...a),
}));

import { exportLoanBeleg, reexportLoanBeleg } from './runLoanBelegExport';

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
    getLoanWithDevices.mockReset();
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
    // 1 header "Leihstellung:" line + one bare TEXT line per device (2) = 3 positions.
    expect(xml.match(/Leihstellung:/g)?.length).toBe(1);
    expect(xml.match(/<Artikelnummer>TEXT<\/Artikelnummer>/g)?.length).toBe(3);
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

describe('reexportLoanBeleg (append path)', () => {
  beforeEach(() => {
    readMaxLaufnummer.mockReset();
    importBeleg.mockReset();
    setLoanBelegExport.mockReset();
    getLoanWithDevices.mockReset();
  });

  it('EDITS the existing Beleg (option 3) under the same Laufnummer, resending all devices', async () => {
    getLoanWithDevices.mockResolvedValue({
      loan: makeLoan({ mesonicBelegKey: '24998-26', mesonicBelegLaufnummer: 26 }),
      devices: [makeDevice(), makeDevice({ id: 'dev-2', serialNumber: 'SN-2' })],
    });
    importBeleg.mockResolvedValue({ ok: true });

    const res = await reexportLoanBeleg('loan-1');

    // No new Laufnummer read — reuses the loan's existing one.
    expect(readMaxLaufnummer).not.toHaveBeenCalled();
    const [xml, opts] = importBeleg.mock.calls[0];
    expect(opts).toEqual({ option: 3 });
    expect(xml).toContain('option="3"');
    expect(xml).toContain('<Laufnummer>26</Laufnummer>');
    // header + 2 device lines resent under the same Laufnummer
    expect((xml as string).match(/Leihstellung:/g)?.length).toBe(1);
    expect((xml as string).match(/<Artikelnummer>TEXT<\/Artikelnummer>/g)?.length).toBe(3);
    // Key unchanged; no re-anchor needed.
    expect(setLoanBelegExport).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, belegKey: '24998-26', laufnummer: 26 });
  });

  it('falls back to a CREATE when the loan has no Beleg yet (check-out export never landed)', async () => {
    getLoanWithDevices.mockResolvedValue({
      loan: makeLoan({ mesonicBelegKey: null, mesonicBelegLaufnummer: null }),
      devices: [makeDevice()],
    });
    readMaxLaufnummer.mockResolvedValue(30);
    importBeleg.mockResolvedValue({ ok: true });
    setLoanBelegExport.mockResolvedValue(undefined);

    const res = await reexportLoanBeleg('loan-1');

    expect(readMaxLaufnummer).toHaveBeenCalledWith('24998');
    const [xml, opts] = importBeleg.mock.calls[0];
    expect(opts).toBeUndefined(); // create path calls importBeleg(xml) with no option
    expect(xml).toContain('option="0"');
    expect(setLoanBelegExport).toHaveBeenCalledWith('loan-1', 31, '24998-31');
    expect(res).toEqual({ ok: true, belegKey: '24998-31', laufnummer: 31 });
  });

  it('returns an error when the loan is not found', async () => {
    getLoanWithDevices.mockResolvedValue(null);
    const res = await reexportLoanBeleg('loan-x');
    expect(res.ok).toBe(false);
    expect(importBeleg).not.toHaveBeenCalled();
  });

  it('does not swallow into a throw — a failed edit import returns an error result', async () => {
    getLoanWithDevices.mockResolvedValue({
      loan: makeLoan({ mesonicBelegKey: '24998-26', mesonicBelegLaufnummer: 26 }),
      devices: [makeDevice()],
    });
    importBeleg.mockResolvedValue({ ok: false, error: 'Zeile nicht zuordenbar' });

    const res = await reexportLoanBeleg('loan-1');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Zeile nicht zuordenbar');
  });
});
