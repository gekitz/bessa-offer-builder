import { describe, expect, it, vi } from 'vitest';
import { buildLoanCheckInCrmFields, postLoanCheckInCrmNote, LOAN_CRM_WORKFLOW } from './loanCrmNote';

const loan = { customerKdnr: '24998', startedAt: '2026-09-01' };
const devices = [
  { bezeichnung: 'Sunmi L3', serialNumber: 'SN-1' },
  { bezeichnung: 'Bondrucker', serialNumber: 'SN-2' },
];

describe('buildLoanCheckInCrmFields', () => {
  it('files against the customer Kd.-Nr. and lists every returned device', () => {
    const f = buildLoanCheckInCrmFields(loan, devices)!;
    expect(f.workflowNummer).toBe(LOAN_CRM_WORKFLOW);
    expect(f.kundenkonto).toBe('24998');
    expect(f.langbeschreibungIntern).toContain('Sunmi L3 (SN SN-1)');
    expect(f.langbeschreibungIntern).toContain('Bondrucker (SN SN-2)');
    expect(f.langbeschreibungIntern).toContain('Leihbeginn 2026-09-01');
  });

  it('returns null without a Kd.-Nr. (nothing to file against)', () => {
    expect(buildLoanCheckInCrmFields({ customerKdnr: '', startedAt: '2026-09-01' }, devices)).toBeNull();
  });
});

describe('postLoanCheckInCrmNote', () => {
  it('posts the built XML and returns the parsed key on success', async () => {
    const importCrm = vi.fn().mockResolvedValue({ success: true, raw: '<Root><KeyValue>77</KeyValue></Root>' });
    const res = await postLoanCheckInCrmNote(loan, devices, { importCrm });
    expect(importCrm).toHaveBeenCalledOnce();
    expect(importCrm.mock.calls[0][0]).toContain('<Kundenkonto>24998</Kundenkonto>');
    expect(res.success).toBe(true);
    expect(res.key).toBe('77');
  });

  it('never throws — a Mesonic failure surfaces as success:false', async () => {
    const importCrm = vi.fn().mockRejectedValue(new Error('timeout'));
    const res = await postLoanCheckInCrmNote(loan, devices, { importCrm });
    expect(res.success).toBe(false);
    expect(res.error).toBe('timeout');
  });

  it('skips (no post) when there is no Kd.-Nr.', async () => {
    const importCrm = vi.fn();
    const res = await postLoanCheckInCrmNote({ customerKdnr: '', startedAt: '2026-09-01' }, devices, { importCrm });
    expect(importCrm).not.toHaveBeenCalled();
    expect(res.skipped).toBe(true);
  });
});
