import { describe, expect, it } from 'vitest';
import { calcRepairOrderBilling, calcTicketBilling, VAT_PERCENT } from '../lib/billing';
import type {
  RepairOrder,
  RepairOrderEntry,
  RepairOrderMaterial,
  ServiceRate,
  Ticket,
  TravelMode,
  TravelZone,
} from '../types';

// ──────────────────────────────────────────────────────────────────
// Fixtures — values match the 2026 Stundensätze sheet
// ──────────────────────────────────────────────────────────────────

const SERVICE_RATES: ServiceRate[] = [
  rate('DRUCKER', 130, 'hour'),
  rate('PC_NB', 130, 'hour'),
  rate('NETZWERK', 175, 'hour'),
  rate('KASSA_BASE', 118, 'hour'),
  rate('KASSA_10_20', 109, 'hour', { tierMinHours: 10 }),
  rate('KASSA_21PLUS', 98, 'hour', { tierMinHours: 21 }),
  rate('TELEKOM_BUERO', 118, 'hour'),
  rate('MESONIC_NO_CONTRACT', 183, 'hour', { requiresWartungsvertrag: false }),
  rate('MESONIC_CONTRACT', 138, 'hour', { requiresWartungsvertrag: true }),
  rate('FERNWARTUNG', 45, 'pauschale'),
  rate('KM_PLUS_WEGZEIT', 0.57, 'km'),
  rate('KM_INKL_WEGZEIT', 1.10, 'km'),
];

const TRAVEL_ZONES: TravelZone[] = [
  zone('STADT', 32, null, '31000000'),
  zone('ZONE_1', 56, 5, '31000001'),
  zone('ZONE_2', 84, 10, '31000002'),
  zone('ZONE_3', 102, 20, '31000003'),
  zone('ZONE_4', 110, 46, '31000004'),
];

const RATE_BY_CODE = new Map(SERVICE_RATES.map((r) => [r.code, r] as const));
const ZONE_BY_CODE = new Map(TRAVEL_ZONES.map((z) => [z.code, z] as const));
const EMP_NAMES = new Map([
  ['emp-a', 'Hannes Huber'],
  ['emp-b', 'Klaus Weber'],
]);

function rate(
  code: string,
  value: number,
  unit: 'hour' | 'pauschale' | 'km',
  extras: Partial<ServiceRate> = {},
): ServiceRate {
  return {
    id: 0,
    code,
    label: code,
    category: 'hardware',
    unit,
    rate: value,
    tierMinHours: null,
    requiresWartungsvertrag: null,
    mesonicArtikelNr: null,
    activeFrom: '2026-01-01',
    activeTo: null,
    ...extras,
  };
}

function zone(code: string, flat: number, maxKm: number | null, mesonic: string): TravelZone {
  return {
    id: 0,
    code,
    label: code,
    maxKm,
    flatRate: flat,
    mesonicArtikelNr: mesonic,
    activeFrom: '2026-01-01',
  };
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: '26-0000001',
    title: 'Test',
    description: null,
    kind: 'support',
    priority: 'normal',
    status: 'open',
    poolAbteilungId: null,
    assignedTo: null,
    mesonicCustomerId: null,
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    customerAddress: null,
    customerHasWartungsvertrag: false,
    standortId: null,
    billable: true,
    closedAt: null,
    closedBy: null,
    resolutionNote: null,
    offerId: null,
    mesonicBelegId: null,
    createdBy: null,
    createdAt: '2026-05-11T08:00:00Z',
    updatedAt: '2026-05-11T08:00:00Z',
    ...overrides,
  };
}

function repairOrder(overrides: Partial<RepairOrder> = {}): RepairOrder {
  return {
    id: 'ro-1',
    ticketId: 't-1',
    appointmentId: null,
    seqNumber: 1,
    status: 'completed',
    workDescription: null,
    gpsTravelNote: null,
    signatureData: null,
    signedAt: null,
    signedByName: null,
    performedAt: '2026-05-11',
    billable: true,
    createdBy: null,
    createdAt: '2026-05-11T10:00:00Z',
    updatedAt: '2026-05-11T10:00:00Z',
    ...overrides,
  };
}

function entry(o: {
  rate: string;
  minutes: number;
  emp?: string;
  travelMode?: TravelMode;
  travelZone?: string;
  travelKm?: number;
  travelWegzeitMin?: number;
}): RepairOrderEntry {
  return {
    id: `e-${Math.random()}`,
    repairOrderId: 'ro-1',
    employeeId: o.emp ?? 'emp-a',
    serviceRateCode: o.rate,
    workMinutes: o.minutes,
    travelMode: o.travelMode ?? null,
    travelZoneCode: o.travelZone ?? null,
    travelKm: o.travelKm ?? null,
    travelWegzeitMinutes: o.travelWegzeitMin ?? 0,
    note: null,
    createdAt: '2026-05-11T10:00:00Z',
  };
}

function material(o: { nr: string; bez: string; qty: number; price: number }): RepairOrderMaterial {
  return {
    id: `m-${Math.random()}`,
    repairOrderId: 'ro-1',
    mesonicArtikelNr: o.nr,
    bezeichnung: o.bez,
    quantity: o.qty,
    unitPrice: o.price,
    total: o.qty * o.price,
    createdAt: '2026-05-11T10:00:00Z',
  };
}

// ──────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────

describe('calcRepairOrderBilling', () => {
  it('returns zero totals for an empty repair order', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.subtotal).toBe(0);
    expect(r.positions).toEqual([]);
  });

  it('bills 1.5h PC work at €130 → €195', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'PC_NB', minutes: 90 })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.laborTotal).toBe(195);
    expect(r.travelTotal).toBe(0);
    expect(r.materialTotal).toBe(0);
    expect(r.subtotal).toBe(195);
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].kind).toBe('labor');
    expect(r.positions[0].quantity).toBe(1.5);
    expect(r.positions[0].unitPrice).toBe(130);
  });

  it('bills Netzwerk at €175/h (not €130)', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'NETZWERK', minutes: 60 })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.laborTotal).toBe(175);
  });

  it('Fernwartung-Pauschale bills as pauschale, not labor', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'FERNWARTUNG', minutes: 20 })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.serviceTotal).toBe(45);
    expect(r.laborTotal).toBe(0);
    expect(r.positions[0].kind).toBe('service_flat');
  });
});

describe('Kassen-Staffelung', () => {
  it('under 10h total → KASSA_BASE €118', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'KASSA_BASE', minutes: 5 * 60 })], // 5h
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.positions[0].unitPrice).toBe(118);
    expect(r.laborTotal).toBe(590); // 5 × 118
  });

  it('10–20h total → KASSA_10_20 €109', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [
        entry({ rate: 'KASSA_BASE', minutes: 5 * 60, emp: 'emp-a' }),
        entry({ rate: 'KASSA_BASE', minutes: 7 * 60, emp: 'emp-b' }), // sum = 12h
      ],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.positions.every((p) => p.unitPrice === 109)).toBe(true);
    expect(r.laborTotal).toBe(12 * 109);
  });

  it('21h+ total → KASSA_21PLUS €98', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'KASSA_BASE', minutes: 22 * 60 })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.positions[0].unitPrice).toBe(98);
    expect(r.laborTotal).toBe(22 * 98);
  });

  it('non-Kassen entries on same order are not promoted', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [
        entry({ rate: 'KASSA_BASE', minutes: 22 * 60, emp: 'emp-a' }),
        entry({ rate: 'PC_NB', minutes: 60, emp: 'emp-b' }),
      ],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    const kassen = r.positions.find((p) => p.label === 'KASSA_21PLUS');
    const pc = r.positions.find((p) => p.label === 'PC_NB');
    expect(kassen?.unitPrice).toBe(98);
    expect(pc?.unitPrice).toBe(130); // PC stays at hardware rate
  });
});

describe('Mesonic-Wartungsvertrag-Override', () => {
  it('without Wartungsvertrag uses €183/h', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'MESONIC_NO_CONTRACT', minutes: 60 })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.laborTotal).toBe(183);
  });

  it('with Wartungsvertrag overrides to €138/h even if entry was tagged NO_CONTRACT', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'MESONIC_NO_CONTRACT', minutes: 60 })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: true,
    });
    expect(r.laborTotal).toBe(138);
  });
});

describe('Travel modes', () => {
  it('pauschale STADT bills €32', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'PC_NB', minutes: 60, travelMode: 'pauschale', travelZone: 'STADT' })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.travelTotal).toBe(32);
    const travelPos = r.positions.find((p) => p.kind === 'travel_flat');
    expect(travelPos?.mesonicArtikelNr).toBe('31000000');
  });

  it('pauschale ZONE_3 bills €102', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'PC_NB', minutes: 60, travelMode: 'pauschale', travelZone: 'ZONE_3' })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.travelTotal).toBe(102);
  });

  it('km_plus_wegzeit: km × €0.57 + Wegzeit × Stundensatz', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [
        entry({
          rate: 'PC_NB',
          minutes: 60, // 1h work @ €130
          travelMode: 'km_plus_wegzeit',
          travelKm: 50,
          travelWegzeitMin: 60, // 1h Wegzeit @ €130
        }),
      ],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    // labor: 1h × 130 = 130
    expect(r.laborTotal).toBe(130);
    // travel: 50 × 0.57 = 28.50, plus Wegzeit 1h × 130 = 130 → 158.50
    expect(r.travelTotal).toBe(158.50);
    const km = r.positions.find((p) => p.kind === 'travel_km');
    const wegzeit = r.positions.find((p) => p.kind === 'travel_wegzeit');
    expect(km?.total).toBe(28.50);
    expect(wegzeit?.total).toBe(130);
  });

  it('km_inkl_wegzeit: km × €1.10, no separate Wegzeit', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [
        entry({
          rate: 'PC_NB',
          minutes: 60,
          travelMode: 'km_inkl_wegzeit',
          travelKm: 30,
          travelWegzeitMin: 30, // should be ignored
        }),
      ],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.travelTotal).toBe(33); // 30 × 1.10
    expect(r.positions.filter((p) => p.kind === 'travel_wegzeit')).toEqual([]);
  });

  it('travelMode "none" adds nothing for travel', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'PC_NB', minutes: 60, travelMode: 'none' })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.travelTotal).toBe(0);
  });
});

describe('Materials', () => {
  it('sums quantity × unitPrice for each material', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [],
      materials: [
        material({ nr: 'SUNMI-V2', bez: 'Sunmi V2', qty: 2, price: 450 }),
        material({ nr: 'CAT6-10', bez: 'Cat6-Kabel 10m', qty: 1, price: 25 }),
      ],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      customerHasWartungsvertrag: false,
    });
    expect(r.materialTotal).toBe(925); // 900 + 25
    expect(r.positions.filter((p) => p.kind === 'material')).toHaveLength(2);
  });
});

describe('Employee name attribution', () => {
  it('attaches employee name to positions when provided', () => {
    const r = calcRepairOrderBilling({
      repairOrder: repairOrder(),
      entries: [entry({ rate: 'PC_NB', minutes: 60, emp: 'emp-a' })],
      materials: [],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
      employeeNameById: EMP_NAMES,
      customerHasWartungsvertrag: false,
    });
    expect(r.positions[0].employeeName).toBe('Hannes Huber');
  });
});

describe('calcTicketBilling', () => {
  it('sums multiple repair orders, applies 20% VAT', () => {
    const t = ticket();
    const summary = calcTicketBilling({
      ticket: t,
      repairOrders: [
        {
          repairOrder: repairOrder({ id: 'ro-1', seqNumber: 1 }),
          entries: [entry({ rate: 'PC_NB', minutes: 120 })], // 2h × 130 = 260
          materials: [],
        },
        {
          repairOrder: repairOrder({ id: 'ro-2', seqNumber: 2 }),
          entries: [entry({ rate: 'PC_NB', minutes: 60 })], // 1h × 130 = 130
          materials: [material({ nr: 'X', bez: 'Teil', qty: 1, price: 10 })],
        },
      ],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
    });
    expect(summary.laborTotal).toBe(390);
    expect(summary.materialTotal).toBe(10);
    expect(summary.subtotalNet).toBe(400);
    expect(summary.vatPercent).toBe(VAT_PERCENT);
    expect(summary.vatAmount).toBe(80);
    expect(summary.grandTotalGross).toBe(480);
    expect(summary.repairOrders).toHaveLength(2);
  });

  it('skips non-billable repair orders', () => {
    const t = ticket();
    const summary = calcTicketBilling({
      ticket: t,
      repairOrders: [
        {
          repairOrder: repairOrder({ id: 'ro-1', billable: false }),
          entries: [entry({ rate: 'PC_NB', minutes: 600 })], // would be 1300, but not billable
          materials: [],
        },
        {
          repairOrder: repairOrder({ id: 'ro-2', billable: true, seqNumber: 2 }),
          entries: [entry({ rate: 'PC_NB', minutes: 60 })],
          materials: [],
        },
      ],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
    });
    expect(summary.subtotalNet).toBe(130);
    expect(summary.repairOrders).toHaveLength(1);
    expect(summary.repairOrders[0].seqNumber).toBe(2);
  });

  it('passes customer-Wartungsvertrag through to each repair order', () => {
    const t = ticket({ customerHasWartungsvertrag: true });
    const summary = calcTicketBilling({
      ticket: t,
      repairOrders: [
        {
          repairOrder: repairOrder(),
          entries: [entry({ rate: 'MESONIC_NO_CONTRACT', minutes: 60 })],
          materials: [],
        },
      ],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
    });
    expect(summary.laborTotal).toBe(138);
  });

  it('combines labor + travel + material + service totals', () => {
    const t = ticket();
    const summary = calcTicketBilling({
      ticket: t,
      repairOrders: [
        {
          repairOrder: repairOrder(),
          entries: [
            entry({ rate: 'PC_NB', minutes: 60, travelMode: 'pauschale', travelZone: 'STADT' }),
            entry({ rate: 'FERNWARTUNG', minutes: 20, emp: 'emp-b' }),
          ],
          materials: [material({ nr: 'X', bez: 'Teil', qty: 1, price: 100 })],
        },
      ],
      rateByCode: RATE_BY_CODE,
      zoneByCode: ZONE_BY_CODE,
    });
    expect(summary.laborTotal).toBe(130);
    expect(summary.travelTotal).toBe(32);
    expect(summary.materialTotal).toBe(100);
    expect(summary.serviceTotal).toBe(45);
    expect(summary.subtotalNet).toBe(307);
  });
});
