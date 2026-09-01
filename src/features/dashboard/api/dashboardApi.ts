// Reviewer-Dashboard („Übersicht") — aggregiert die Freigabe-/Prüf-Queues
// über die bestehenden Feature-APIs. Reine Lesezugriffe; jede Zeile verlinkt
// später in ihr Feature. Admin-only (Georg + Herbert).

import { supabase } from '../../../lib/supabase';
import { listTickets } from '../../tickets/api/ticketApi';
import { listLeaveRequests } from '../../vacation/api/vacationApi';
import { listOrderRequests } from '../../procurement/api/procurementApi';
import type { LeaveTypeCode } from '../../vacation/types';

export interface ReviewTicketItem {
  id: string;
  ticketNumber: string;
  title: string;
  customerName: string | null;
  updatedAt: string;
}

export interface PendingLeaveItem {
  id: string;
  employeeName: string;
  leaveTypeCode: LeaveTypeCode;
  startDate: string;
  endDate: string;
}

export interface OpenRequestItem {
  id: string;
  productName: string;
  qty: number;
  requesterName: string | null;
  customerName: string | null;
}

export interface DashboardData {
  reviewTickets: ReviewTicketItem[];
  pendingLeaves: PendingLeaveItem[];
  openRequests: OpenRequestItem[];
}

export async function loadReviewDashboard(): Promise<DashboardData> {
  const [tickets, leaves, requests] = await Promise.all([
    listTickets({ status: ['review'] }),
    listLeaveRequests({ status: 'pending' }),
    listOrderRequests({ status: ['open'] }),
  ]);

  // Mitarbeiter-Namen für die Urlaubs-/Krank-Anträge nachladen (die Liste
  // liefert nur employee_id).
  const empIds = [...new Set(leaves.map((l) => l.employeeId).filter(Boolean))];
  const nameById = new Map<string, string>();
  if (empIds.length > 0 && supabase) {
    const { data } = await supabase.from('employees').select('id, name').in('id', empIds);
    for (const e of (data ?? []) as { id: string; name: string }[]) nameById.set(e.id, e.name);
  }

  return {
    reviewTickets: tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      customerName: t.customerName,
      updatedAt: t.updatedAt,
    })),
    pendingLeaves: leaves.map((l) => ({
      id: l.id,
      employeeName: nameById.get(l.employeeId) ?? l.employeeId,
      leaveTypeCode: l.leaveTypeCode,
      startDate: l.startDate,
      endDate: l.endDate,
    })),
    openRequests: requests.map((r) => ({
      id: r.id,
      productName: r.productName,
      qty: r.qty,
      requesterName: r._requesterName ?? null,
      customerName: r.customerName,
    })),
  };
}
