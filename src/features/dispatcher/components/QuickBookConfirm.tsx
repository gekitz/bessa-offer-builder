// Minimal "confirm a slot" modal for the dispatcher.
//
// Reusing AppointmentForm would force the dispatcher through 8+ form
// fields during a live phone call. Instead we show a compact confirm
// dialog with: read-only summary, one editable title, an optional
// location, and a conflict-check banner that requires an explicit
// override click before booking against an overlapping appointment.
//
// On submit we call createAppointment + insert the assignee row. The
// "kind" is fixed to 'reparatur' as a sensible default for the
// dispatcher's hot path — the technician can adjust later from the
// ticket detail / calendar.

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { createAppointment } from '../../tickets/api/ticketApi';
import type { Appointment, AppointmentKind, Ticket } from '../../tickets/types';
import { hasConflict, type Conflict, type FreeSlot } from '../lib/availability';
import type { DispatcherCustomer } from './DispatcherSearchPanel';

interface Props {
  slot: FreeSlot;
  employeeName: string;
  customer: DispatcherCustomer | null;
  ticket: Ticket | null;
  appointments: Appointment[];
  onSaved: () => void;
  onClose: () => void;
}

const KIND_DEFAULT: AppointmentKind = 'reparatur';

function formatLocal(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function QuickBookConfirm({
  slot,
  employeeName,
  customer,
  ticket,
  appointments,
  onSaved,
  onClose,
}: Props) {
  const defaultTitle = ticket
    ? `Termin — ${ticket.title}`
    : customer
      ? `Termin — ${customer.company}`
      : 'Termin';
  const [title, setTitle] = useState(defaultTitle);
  const [location, setLocation] = useState(ticket?.customerAddress ?? customer?.address ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictOverride, setConflictOverride] = useState(false);

  const conflicts: Conflict[] = useMemo(
    () => hasConflict([slot.employeeId], slot.startsAt, slot.endsAt, appointments),
    [slot.employeeId, slot.startsAt, slot.endsAt, appointments],
  );

  const hasUnresolvedConflicts = conflicts.length > 0 && !conflictOverride;

  async function handleSubmit() {
    if (saving) return;
    if (hasUnresolvedConflicts) return;
    setError(null);
    setSaving(true);
    try {
      await createAppointment(
        {
          title: title.trim() || defaultTitle,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          kind: KIND_DEFAULT,
          status: 'geplant',
          allDay: false,
          ticketId: ticket?.id ?? null,
          mesonicCustomerId: customer?.mesonicId ?? null,
          customerName: customer?.company ?? null,
          location: location.trim() || null,
        },
        [{ employeeId: slot.employeeId, role: 'lead' }],
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="dispatcher-quickbook-modal"
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="font-bold text-slate-800" style={{ fontSize: 15 }}>
            Termin anlegen
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700 space-y-0.5" style={{ fontSize: 12 }}>
            <div>
              <span className="text-slate-500">Techniker:</span> <span className="font-medium">{employeeName}</span>
            </div>
            <div>
              <span className="text-slate-500">Wann:</span>{' '}
              <span className="font-medium" data-testid="dispatcher-quickbook-when">
                {formatLocal(slot.startsAt)} – {new Date(slot.endsAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {customer && (
              <div>
                <span className="text-slate-500">Kunde:</span> <span className="font-medium">{customer.company}</span>
              </div>
            )}
            {ticket && (
              <div>
                <span className="text-slate-500">Ticket:</span>{' '}
                <span className="font-mono text-slate-600">{ticket.ticketNumber}</span> {ticket.title}
              </div>
            )}
          </div>

          {conflicts.length > 0 && (
            <div
              className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700"
              style={{ fontSize: 12 }}
              data-testid="dispatcher-quickbook-conflict"
            >
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <AlertTriangle size={13} />
                Doppelbuchung erkannt
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {c.appointment.title} —{' '}
                    {new Date(c.appointment.startsAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}–
                    {new Date(c.appointment.endsAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}
                  </li>
                ))}
              </ul>
              {!conflictOverride && (
                <button
                  type="button"
                  onClick={() => setConflictOverride(true)}
                  className="mt-2 rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 font-medium transition-colors"
                  style={{ fontSize: 11 }}
                  data-testid="dispatcher-quickbook-override"
                >
                  Trotzdem buchen
                </button>
              )}
            </div>
          )}

          <div>
            <label className="text-slate-500 block mb-1" style={{ fontSize: 11 }}>
              Titel
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              data-testid="dispatcher-quickbook-title"
            />
          </div>

          <div>
            <label className="text-slate-500 block mb-1" style={{ fontSize: 11 }}>
              Adresse (optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>

          {error && (
            <div
              className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2"
              style={{ fontSize: 12 }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 font-medium transition-colors"
            style={{ fontSize: 12 }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || hasUnresolvedConflicts}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white px-3 py-1.5 font-medium transition-colors"
            style={{ fontSize: 12 }}
            data-testid="dispatcher-quickbook-submit"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Termin anlegen
          </button>
        </div>
      </div>
    </div>
  );
}
