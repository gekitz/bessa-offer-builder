import { describe, it, expect } from 'vitest';
import { planTicketBelege, type OrderForExport } from '../ticketBelegPlan';
import type { EmployeeMesonic } from '../repairOrderBeleg';
import type { BillingPosition, RepairOrderBilling } from '../../types';

const heri: EmployeeMesonic = { vertreternummer: '9', standort: 'wolfsberg' };
const employeeMesonic = new Map([['e-heri', heri]]);

function laborPos(over: Partial<BillingPosition> = {}): BillingPosition {
  return {
    kind: 'labor', label: 'Arbeit', quantity: 1, unit: 'h', unitPrice: 100, total: 100,
    repairOrderId: 'ro', repairOrderSeq: 1, employeeId: 'e-heri', ...over,
  };
}

function order(seqNumber: number, positions: BillingPosition[], alreadyExportedKey: string | null = null): OrderForExport {
  const billing: RepairOrderBilling = {
    repairOrderId: `ro-${seqNumber}`, seqNumber, performedAt: '2026-09-01', signed: true,
    positions, laborTotal: 0, travelTotal: 0, materialTotal: 0, serviceTotal: 0, adjustmentTotal: 0, subtotal: 0,
  };
  return { billing, alreadyExportedKey };
}

const baseOpts = { konto: '272765', ticketStandort: 'klagenfurt' as const, startLaufnummer: 100, employeeMesonic };

describe('planTicketBelege', () => {
  it('vergibt fortlaufende Laufnummern + Beleg-Keys je Reparaturschein', () => {
    const plan = planTicketBelege([order(1, [laborPos()]), order(2, [laborPos()])], baseOpts);
    expect(plan.toCreate.map((b) => b.laufnummer)).toEqual([100, 101]);
    expect(plan.toCreate.map((b) => b.belegKey)).toEqual(['272765-100', '272765-101']);
    expect(plan.skipped).toEqual([]);
  });

  it('baut je Beleg gültiges WEBAngebot-XML mit Belegart nach Ticket-Standort', () => {
    const kl = planTicketBelege([order(1, [laborPos()])], baseOpts);
    expect(kl.toCreate[0].xml).toContain('<MESOWebService TemplateType="30" Template="WEBAngebot"');
    expect(kl.toCreate[0].xml).toContain('<Belegart>16</Belegart>'); // Klagenfurt-Reparatur
    expect(kl.toCreate[0].xml).toContain('<Laufnummer>100</Laufnummer>');
    expect(kl.toCreate[0].xml).toContain('<Artikelnummer>30000009WO</Artikelnummer>'); // Heri, Heimat WO

    const wo = planTicketBelege([order(1, [laborPos()])], { ...baseOpts, ticketStandort: 'wolfsberg' });
    expect(wo.toCreate[0].xml).toContain('<Belegart>12</Belegart>'); // Wolfsberg-Reparatur
  });

  it('überspringt bereits exportierte Scheine ohne eine Laufnummer zu verbrauchen', () => {
    const plan = planTicketBelege([
      order(1, [laborPos()], '272765-050'), // schon exportiert
      order(2, [laborPos()]),
    ], baseOpts);
    expect(plan.skipped).toEqual([{ repairOrderId: 'ro-1', reason: 'already_exported', belegKey: '272765-050' }]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].laufnummer).toBe(100); // startet trotzdem bei 100
  });

  it('überspringt leere Scheine (keine Positionen)', () => {
    const plan = planTicketBelege([order(1, []), order(2, [laborPos()])], baseOpts);
    expect(plan.skipped).toEqual([{ repairOrderId: 'ro-1', reason: 'empty' }]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].repairOrderId).toBe('ro-2');
  });

  it('reicht die kopf-Vertreternummer in den Beleg-Kopf durch', () => {
    const plan = planTicketBelege([order(1, [laborPos()])], { ...baseOpts, kopfVertreternummer: 26 });
    expect(plan.toCreate[0].xml).toContain('<Vertreternummer>26</Vertreternummer>');
  });
});
