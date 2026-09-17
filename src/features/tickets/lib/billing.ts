// Pure billing calculation for tickets/repair orders.
//
// All inputs are the raw entries/materials + the rate lookups.
// No Supabase calls here — keeps the math testable in isolation.

import type {
  BillingPosition,
  BillingSummary,
  RepairOrder,
  RepairOrderAdjustment,
  RepairOrderBilling,
  RepairOrderEntry,
  RepairOrderMaterial,
  ServiceRate,
  Ticket,
  TravelZone,
} from '../types';

export const VAT_PERCENT = 20;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Invoiced time granularity: nearest quarter-hour (0.25 h = 15 min). Any
// non-zero time bills at least one quarter — a real work stint or Wegzeit is
// never €0. Applies to labor AND Wegzeit (fixed with Georg 2026-09-17).
function roundQuarterHour(hours: number): number {
  if (hours <= 0) return 0;
  const q = Math.round(hours * 4) / 4;
  return q < 0.25 ? 0.25 : q;
}

// Invoiced distance granularity: nearest whole kilometre, min 1 km for any
// real trip.
function roundKm(km: number): number {
  if (km <= 0) return 0;
  const r = Math.round(km);
  return r < 1 ? 1 : r;
}

// Pick the appropriate Kassen-Gastro rate for a given total work-hours
// across all entries on a repair order. The rate sheet defines a
// staircase: <10h → KASSA_BASE (€118), 10–20h → KASSA_10_20 (€109),
// 21+h → KASSA_21PLUS (€98). The technician records the entry with
// the *base* code (KASSA_BASE) and we promote it here based on the
// summed hours of *all* KASSA_* entries on the same repair order.
function resolveKassenRate(
  entries: RepairOrderEntry[],
  rateByCode: Map<string, ServiceRate>,
): Map<string, ServiceRate> {
  const KASSEN_CODES = new Set(['KASSA_BASE', 'KASSA_10_20', 'KASSA_21PLUS']);
  const totalKassenMinutes = entries
    .filter((e) => KASSEN_CODES.has(e.serviceRateCode))
    .reduce((s, e) => s + e.workMinutes, 0);
  const totalKassenHours = totalKassenMinutes / 60;

  let resolvedCode: string;
  if (totalKassenHours >= 21) resolvedCode = 'KASSA_21PLUS';
  else if (totalKassenHours >= 10) resolvedCode = 'KASSA_10_20';
  else resolvedCode = 'KASSA_BASE';

  const resolved = rateByCode.get(resolvedCode);
  if (!resolved) return rateByCode;

  // Return a map where any KASSA_* code maps to the resolved tier.
  const out = new Map(rateByCode);
  for (const code of KASSEN_CODES) {
    out.set(code, resolved);
  }
  return out;
}

// Resolve Mesonic-rate based on customer wartungsvertrag flag.
// If the entry was recorded against MESONIC_NO_CONTRACT but the
// customer has a contract, we still bill at the contract rate
// (€138 instead of €183). The customer flag is authoritative.
function resolveMesonicRate(
  hasWartungsvertrag: boolean,
  rateByCode: Map<string, ServiceRate>,
): Map<string, ServiceRate> {
  const target = hasWartungsvertrag ? rateByCode.get('MESONIC_CONTRACT') : rateByCode.get('MESONIC_NO_CONTRACT');
  if (!target) return rateByCode;
  const out = new Map(rateByCode);
  out.set('MESONIC_NO_CONTRACT', target);
  out.set('MESONIC_CONTRACT', target);
  return out;
}

interface CalcRepairOrderArgs {
  repairOrder: RepairOrder;
  entries: RepairOrderEntry[];
  materials: RepairOrderMaterial[];
  adjustments?: RepairOrderAdjustment[];
  rateByCode: Map<string, ServiceRate>;
  zoneByCode: Map<string, TravelZone>;
  employeeNameById?: Map<string, string>;
  customerHasWartungsvertrag: boolean;
}

export function calcRepairOrderBilling(args: CalcRepairOrderArgs): RepairOrderBilling {
  const { repairOrder, entries, materials, zoneByCode, employeeNameById, customerHasWartungsvertrag } = args;

  // Apply tier resolution for Kassen + Mesonic-contract
  let rateMap = resolveKassenRate(entries, args.rateByCode);
  rateMap = resolveMesonicRate(customerHasWartungsvertrag, rateMap);

  const positions: BillingPosition[] = [];
  let laborTotal = 0;
  let travelTotal = 0;
  let serviceTotal = 0;
  // Real hourly-labor minutes (rate.unit === 'hour' work entries only). Feeds
  // the ticket-level offer labor floor. Excludes Wegzeit + pauschale + floor.
  let laborMinutes = 0;

  for (const entry of entries) {
    const rate = rateMap.get(entry.serviceRateCode);
    if (!rate) continue;

    // Labor / service-pauschale
    if (entry.workMinutes > 0) {
      // Bill labor at quarter-hour granularity, then derive the total from that
      // rounded quantity. The displayed menge, the total, and the Mesonic Beleg
      // (which recomputes menge × preis) all reconcile on the same rounded value.
      const hours = roundQuarterHour(entry.workMinutes / 60);
      if (rate.unit === 'hour') {
        const total = round2(hours * rate.rate);
        positions.push({
          kind: 'labor',
          label: `${rate.label}`,
          quantity: hours,
          unit: 'h',
          unitPrice: rate.rate,
          total,
          repairOrderId: repairOrder.id,
          repairOrderSeq: repairOrder.seqNumber,
          employeeId: entry.employeeId,
          employeeName: employeeNameById?.get(entry.employeeId),
        });
        laborTotal += total;
        laborMinutes += entry.workMinutes;
      } else if (rate.unit === 'pauschale') {
        // Flat-fee service (Fernwartung, Kostenvoranschlag)
        const total = round2(rate.rate);
        positions.push({
          kind: 'service_flat',
          label: rate.label,
          quantity: 1,
          unit: 'pauschale',
          unitPrice: rate.rate,
          total,
          repairOrderId: repairOrder.id,
          repairOrderSeq: repairOrder.seqNumber,
          employeeId: entry.employeeId,
          employeeName: employeeNameById?.get(entry.employeeId),
        });
        serviceTotal += total;
      }
    }

    // Travel
    if (entry.travelMode === 'pauschale' && entry.travelZoneCode) {
      const zone = zoneByCode.get(entry.travelZoneCode);
      if (zone) {
        const total = round2(zone.flatRate);
        positions.push({
          kind: 'travel_flat',
          label: `Anfahrt ${zone.label}`,
          quantity: 1,
          unit: 'pauschale',
          unitPrice: zone.flatRate,
          total,
          repairOrderId: repairOrder.id,
          repairOrderSeq: repairOrder.seqNumber,
          employeeId: entry.employeeId,
          employeeName: employeeNameById?.get(entry.employeeId),
          mesonicArtikelNr: zone.mesonicArtikelNr,
        });
        travelTotal += total;
      }
    } else if (entry.travelMode === 'km_plus_wegzeit' && entry.travelKm != null) {
      // KM-Geld (rate aus service_rates, aktuell €0.75) + Wegzeit zum Stundensatz
      const kmRate = rateMap.get('KM_PLUS_WEGZEIT');
      if (kmRate) {
        const km = roundKm(entry.travelKm);
        const total = round2(km * kmRate.rate);
        positions.push({
          kind: 'travel_km',
          label: `Anfahrt ${km} km (Wegzeit separat)`,
          quantity: km,
          unit: 'km',
          unitPrice: kmRate.rate,
          total,
          repairOrderId: repairOrder.id,
          repairOrderSeq: repairOrder.seqNumber,
          employeeId: entry.employeeId,
          employeeName: employeeNameById?.get(entry.employeeId),
        });
        travelTotal += total;
      }
      // Wegzeit als Arbeitszeit zum Stundensatz der Arbeit
      if (entry.travelWegzeitMinutes > 0 && rate && rate.unit === 'hour') {
        // Quarter-hour granularity before pricing (see labor above), so preview
        // line, PDF and Mesonic Beleg all reconcile on menge × preis.
        const hours = roundQuarterHour(entry.travelWegzeitMinutes / 60);
        const total = round2(hours * rate.rate);
        positions.push({
          kind: 'travel_wegzeit',
          label: `Wegzeit (${rate.label})`,
          quantity: hours,
          unit: 'h',
          unitPrice: rate.rate,
          total,
          repairOrderId: repairOrder.id,
          repairOrderSeq: repairOrder.seqNumber,
          employeeId: entry.employeeId,
          employeeName: employeeNameById?.get(entry.employeeId),
        });
        travelTotal += total;
      }
    } else if (entry.travelMode === 'km_inkl_wegzeit' && entry.travelKm != null) {
      const kmRate = rateMap.get('KM_INKL_WEGZEIT');
      if (kmRate) {
        const km = roundKm(entry.travelKm);
        const total = round2(km * kmRate.rate);
        positions.push({
          kind: 'travel_km',
          label: `Anfahrt ${km} km (inkl. Wegzeit)`,
          quantity: km,
          unit: 'km',
          unitPrice: kmRate.rate,
          total,
          repairOrderId: repairOrder.id,
          repairOrderSeq: repairOrder.seqNumber,
          employeeId: entry.employeeId,
          employeeName: employeeNameById?.get(entry.employeeId),
        });
        travelTotal += total;
      }
    }
  }

  let materialTotal = 0;
  for (const mat of materials) {
    const total = round2(mat.total ?? mat.quantity * mat.unitPrice);
    positions.push({
      kind: 'material',
      label: mat.bezeichnung,
      quantity: mat.quantity,
      unit: 'Stk',
      unitPrice: mat.unitPrice,
      total,
      repairOrderId: repairOrder.id,
      repairOrderSeq: repairOrder.seqNumber,
      mesonicArtikelNr: mat.mesonicArtikelNr,
    });
    materialTotal += total;
  }

  // Corrections (Gutschrift/Korrektur) — signed amounts posted by an
  // admin during review. Rendered as their own lines; never edit the
  // original signed positions.
  let adjustmentTotal = 0;
  for (const adj of args.adjustments ?? []) {
    positions.push({
      kind: 'adjustment',
      label: adj.reason,
      quantity: 1,
      unit: 'pauschale',
      unitPrice: adj.amount,
      total: round2(adj.amount),
      repairOrderId: repairOrder.id,
      repairOrderSeq: repairOrder.seqNumber,
    });
    adjustmentTotal += adj.amount;
  }
  adjustmentTotal = round2(adjustmentTotal);

  return {
    repairOrderId: repairOrder.id,
    seqNumber: repairOrder.seqNumber,
    performedAt: repairOrder.performedAt,
    signed: repairOrder.status === 'signed',
    positions,
    laborTotal: round2(laborTotal),
    travelTotal: round2(travelTotal),
    materialTotal: round2(materialTotal),
    serviceTotal: round2(serviceTotal),
    adjustmentTotal,
    subtotal: round2(laborTotal + travelTotal + materialTotal + serviceTotal + adjustmentTotal),
    laborMinutes,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Offer labor-hours floor: when the accepted offer quoted Arbeitszeit, the
// ticket must never bill fewer labor hours than quoted. This pure helper
// sizes the synthetic top-up so preview and Mesonic export apply an identical
// floor. See docs/plans/offer-labor-floor.md.

export interface OfferLaborFloor {
  minutes: number;
  rate: number | null;
}

// billedLaborMinutes    = real hourly labor already billed for the ticket.
// alreadyFlooredMinutes = floor minutes previously committed (0 for the
//                         on-screen preview; the ticket's exported-floor tally
//                         for the Mesonic export).
// Returns the synthetic top-up position, or null when the floor is already met.
export function offerLaborFloorPosition(
  billedLaborMinutes: number,
  alreadyFlooredMinutes: number,
  floor: OfferLaborFloor,
  ctx: { repairOrderId: string; repairOrderSeq: number },
): BillingPosition | null {
  if (floor.minutes <= 0) return null;
  const shortfallMin = floor.minutes - billedLaborMinutes - alreadyFlooredMinutes;
  if (shortfallMin <= 0) return null;
  const rate = floor.rate ?? 118;
  const hours = round2(shortfallMin / 60);
  const total = round2(hours * rate);
  return {
    kind: 'labor_floor',
    label: 'Mindest-Arbeitszeit laut Angebot',
    quantity: hours,
    unit: 'h',
    unitPrice: rate,
    total,
    repairOrderId: ctx.repairOrderId,
    repairOrderSeq: ctx.repairOrderSeq,
    // No employeeId — the export bills it against the standort pseudo-artikel.
  };
}

interface CalcTicketArgs {
  ticket: Ticket;
  repairOrders: Array<{
    repairOrder: RepairOrder;
    entries: RepairOrderEntry[];
    materials: RepairOrderMaterial[];
    adjustments?: RepairOrderAdjustment[];
  }>;
  rateByCode: Map<string, ServiceRate>;
  zoneByCode: Map<string, TravelZone>;
  employeeNameById?: Map<string, string>;
}

export function calcTicketBilling(args: CalcTicketArgs): BillingSummary {
  const { ticket, repairOrders, rateByCode, zoneByCode, employeeNameById } = args;

  // Only billable repair orders count.
  const billings = repairOrders
    .filter(({ repairOrder }) => repairOrder.billable)
    .map(({ repairOrder, entries, materials, adjustments }) =>
      calcRepairOrderBilling({
        repairOrder,
        entries,
        materials,
        adjustments,
        rateByCode,
        zoneByCode,
        employeeNameById,
        customerHasWartungsvertrag: ticket.customerHasWartungsvertrag,
      }),
    );

  let laborTotal = round2(billings.reduce((s, b) => s + b.laborTotal, 0));
  const travelTotal = round2(billings.reduce((s, b) => s + b.travelTotal, 0));
  const materialTotal = round2(billings.reduce((s, b) => s + b.materialTotal, 0));
  const serviceTotal = round2(billings.reduce((s, b) => s + b.serviceTotal, 0));
  const adjustmentTotal = round2(billings.reduce((s, b) => s + b.adjustmentTotal, 0));

  // Offer labor floor (on-screen preview → alreadyFloored = 0): top up the
  // ticket-level labor to the quoted minimum. Attach to the latest included
  // repair order; when there are none, emit a synthetic summary line so a
  // not-yet-worked ticket still shows the full quoted floor.
  const billedLaborMinutes = billings.reduce((s, b) => s + b.laborMinutes, 0);
  const latest = billings.reduce<RepairOrderBilling | null>(
    (best, b) => (best === null || b.seqNumber > best.seqNumber ? b : best),
    null,
  );
  const floorCtx = latest
    ? { repairOrderId: latest.repairOrderId, repairOrderSeq: latest.seqNumber }
    : { repairOrderId: '', repairOrderSeq: 0 };
  const floorPos = offerLaborFloorPosition(
    billedLaborMinutes,
    0,
    { minutes: ticket.offerLaborMinutes, rate: ticket.offerLaborRate },
    floorCtx,
  );
  if (floorPos) {
    if (latest) {
      latest.positions.push(floorPos);
      latest.laborTotal = round2(latest.laborTotal + floorPos.total);
      latest.subtotal = round2(latest.subtotal + floorPos.total);
    } else {
      billings.push({
        repairOrderId: '',
        seqNumber: 0,
        performedAt: ticket.createdAt.slice(0, 10),
        signed: false,
        positions: [floorPos],
        laborTotal: floorPos.total,
        travelTotal: 0,
        materialTotal: 0,
        serviceTotal: 0,
        adjustmentTotal: 0,
        subtotal: floorPos.total,
        laborMinutes: 0,
      });
    }
    laborTotal = round2(laborTotal + floorPos.total);
  }

  const subtotalNet = round2(laborTotal + travelTotal + materialTotal + serviceTotal + adjustmentTotal);
  const vatAmount = round2((subtotalNet * VAT_PERCENT) / 100);
  const grandTotalGross = round2(subtotalNet + vatAmount);

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    repairOrders: billings,
    laborTotal,
    travelTotal,
    materialTotal,
    serviceTotal,
    adjustmentTotal,
    subtotalNet,
    vatPercent: VAT_PERCENT,
    vatAmount,
    grandTotalGross,
  };
}
