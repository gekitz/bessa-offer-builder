import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  FileSignature,
  Loader2,
  Plus,
  Receipt,
  Wrench,
} from 'lucide-react';
import {
  addEntry,
  createRepairOrder,
  listAppointmentsForTicket,
  listRepairOrders,
} from '../api/ticketApi';
import type { Appointment, RepairOrder, Ticket } from '../types';
import RepairOrderDetail from './RepairOrderDetail';

interface RepairOrdersTabProps {
  ticket: Ticket;
  currentEmployeeId?: string | null;
  // Bumped whenever a child mutation should refresh sibling views
  // (e.g. the billing summary in the close dialog).
  onChange?: () => void;
}

const STATUS_LABEL: Record<RepairOrder['status'], string> = {
  draft: 'Entwurf',
  completed: 'Abgeschlossen',
  signed: 'Unterschrieben',
  cancelled: 'Storniert',
};

const STATUS_CLS: Record<RepairOrder['status'], string> = {
  draft:     'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
  signed:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function RepairOrdersTab({
  ticket,
  currentEmployeeId = null,
  onChange,
}: RepairOrdersTabProps) {
  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingFromAppointmentId, setCreatingFromAppointmentId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ros, appts] = await Promise.all([
        listRepairOrders(ticket.id),
        listAppointmentsForTicket(ticket.id),
      ]);
      setOrders(ros);
      setAppointments(appts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Appointments past their start time that don't yet have a rep-order
  // are candidates for "Schein aus Termin erstellen".
  const appointmentsAwaitingRo = useMemo(() => {
    const withRoIds = new Set(orders.map((r) => r.appointmentId).filter(Boolean) as string[]);
    return appointments.filter(
      (a) => !withRoIds.has(a.id) && a.status !== 'abgesagt',
    );
  }, [appointments, orders]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const created = await createRepairOrder({
        ticketId: ticket.id,
        createdBy: currentEmployeeId ?? null,
        billable: ticket.billable,
      });
      setOrders((prev) => [...prev, created]);
      setActiveId(created.id);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  // Create a draft repair order linked to the appointment, pre-seeded
  // with a 0-minute entry per assignee so each technician only needs
  // to fill in their actual time on site.
  async function handleCreateFromAppointment(appt: Appointment) {
    setCreatingFromAppointmentId(appt.id);
    setError(null);
    try {
      const performedAt = appt.startsAt.slice(0, 10); // 'YYYY-MM-DD'
      const created = await createRepairOrder({
        ticketId: ticket.id,
        appointmentId: appt.id,
        performedAt,
        workDescription: appt.description ?? null,
        createdBy: currentEmployeeId ?? null,
        billable: ticket.billable,
      });
      // Pre-seed entries for each assignee with workMinutes=0. Order
      // doesn't matter — sequential is fine for the handful of techs
      // on a typical visit and keeps the error message specific if
      // one fails.
      for (const a of appt.assignees ?? []) {
        await addEntry(created.id, {
          employeeId: a.employeeId,
          serviceRateCode: 'PC_NB',
          workMinutes: 0,
          travelMode: 'none',
        });
      }
      setOrders((prev) => [...prev, created]);
      setActiveId(created.id);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingFromAppointmentId(null);
    }
  }

  if (activeId) {
    return (
      <RepairOrderDetail
        ticket={ticket}
        repairOrderId={activeId}
        currentEmployeeId={currentEmployeeId}
        onBack={() => {
          setActiveId(null);
          reload();
        }}
        onChanged={() => {
          // The list page-level totals don't recompute live — refresh on back.
          onChange?.();
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">
            Reparaturscheine ({orders.length})
          </span>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Neuer Reparaturschein
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Termin → Schein candidates */}
      {!loading && appointmentsAwaitingRo.length > 0 && (
        <ul className="space-y-2 mb-2" data-testid="appointments-awaiting-ro">
          {appointmentsAwaitingRo.map((appt) => (
            <li
              key={appt.id}
              className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5 flex items-center gap-3"
            >
              <Calendar size={14} className="text-violet-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-violet-900">
                    Termin {new Date(appt.startsAt).toLocaleDateString('de-AT')}
                  </span>
                  <span className="text-xs text-violet-700/80 truncate">{appt.title}</span>
                </div>
                {appt.assignees && appt.assignees.length > 0 && (
                  <div className="text-xs text-violet-700/70 mt-0.5">
                    {appt.assignees.map((a) => a._employeeName ?? '?').join(', ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleCreateFromAppointment(appt)}
                disabled={creatingFromAppointmentId === appt.id}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                data-testid={`create-ro-from-${appt.id}`}
              >
                {creatingFromAppointmentId === appt.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={12} />
                )}
                Schein erstellen
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
          <Receipt size={24} className="mx-auto mb-2 text-slate-300" />
          <div className="text-sm text-slate-500 mb-1">Noch keine Reparaturscheine.</div>
          <div className="text-xs text-slate-400">
            Pro Vor-Ort-Einsatz einen Schein anlegen, Techniker-Zeiten und Material erfassen,
            Kunde unterschreiben lassen.
          </div>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="repair-orders-list">
          {orders.map((o) => {
            const badge = STATUS_CLS[o.status];
            return (
              <li
                key={o.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 flex items-center gap-3 cursor-pointer hover:border-slate-300 transition"
                onClick={() => setActiveId(o.id)}
                data-testid="repair-order-card"
              >
                <Receipt size={16} className="text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">
                      Rep.schein #{o.seqNumber}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${badge}`}>
                      {STATUS_LABEL[o.status]}
                    </span>
                    {!o.billable && (
                      <span className="rounded bg-slate-100 text-slate-500 px-1.5 py-0.5 text-xs">
                        nicht verrechenbar
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>am {new Date(o.performedAt).toLocaleDateString('de-AT')}</span>
                    {o.status === 'signed' && o.signedByName && (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <FileSignature size={10} />
                        {o.signedByName}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-300" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
