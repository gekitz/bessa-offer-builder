import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Edit2,
  Loader2,
  MapPin,
  Plus,
  Users,
} from 'lucide-react';
import { listAppointmentsForTicket } from '../api/ticketApi';
import type { Appointment, AppointmentStatus, Ticket } from '../types';
import AppointmentForm from './AppointmentForm';

interface AppointmentsTabProps {
  ticket: Ticket;
  currentEmployeeId?: string | null;
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  geplant: 'Geplant',
  bestaetigt: 'Bestätigt',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
  abgesagt: 'Abgesagt',
};

const STATUS_CLS: Record<AppointmentStatus, string> = {
  geplant:    'bg-violet-50 text-violet-700 border-violet-200',
  bestaetigt: 'bg-blue-50 text-blue-700 border-blue-200',
  in_arbeit:  'bg-amber-50 text-amber-700 border-amber-200',
  erledigt:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  abgesagt:   'bg-rose-50 text-rose-700 border-rose-200',
};

function fmtDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    time: d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function AppointmentsTab({ ticket, currentEmployeeId = null }: AppointmentsTabProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAppointmentsForTicket(ticket.id);
      setAppointments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">
            Termine ({appointments.length})
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
        >
          <Plus size={14} />
          Neuer Termin
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
          <Calendar size={24} className="mx-auto mb-2 text-slate-300" />
          <div className="text-sm text-slate-500 mb-1">Noch keine Termine.</div>
          <div className="text-xs text-slate-400">
            Termin planen → erscheint im Kalender und im Outlook-Feed der Techniker.
          </div>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="appointments-list">
          {appointments.map((a) => {
            const { date, time } = fmtDateTime(a.startsAt);
            const endTime = fmtDateTime(a.endsAt).time;
            return (
              <li
                key={a.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 cursor-pointer hover:border-slate-300 transition"
                onClick={() => setEditing(a)}
                data-testid="appointment-card"
              >
                <div className="flex items-center gap-3">
                  <div className="text-center flex-shrink-0 px-2">
                    <div className="text-xs text-slate-400">{date}</div>
                    <div className="font-mono text-sm text-slate-700">{time}–{endTime}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-slate-800 text-sm truncate">{a.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs border ${STATUS_CLS[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      {a.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={10} />
                          <span className="truncate max-w-48">{a.location}</span>
                        </span>
                      )}
                      {a.assignees && a.assignees.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users size={10} />
                          {a.assignees.map((x) => x._employeeName ?? '?').join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <AppointmentForm
          fromTicket={ticket}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {editing && (
        <AppointmentForm
          appointment={editing}
          fromTicket={ticket}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onDeleted={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
