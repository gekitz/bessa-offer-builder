import { useEffect } from 'react';
import { Calendar, MapPin, User, Users, X } from 'lucide-react';
import LeaveStatusBadge from './LeaveStatusBadge';
import { formatGermanDate, formatRange } from '../lib/formatDate';
import type { Employee, IsoDate, LeaveRequest, LeaveTypeCode } from '../types';
import type { LeaveType } from '../api/vacationApi';
import type { CalendarEvent } from '../../calendar/types';

interface DayDetailModalProps {
  day: IsoDate;
  leaves: Array<LeaveRequest & { id: string }>;
  appointments?: CalendarEvent[];
  employees: Map<string, Employee>;
  leaveTypes: Map<LeaveTypeCode, LeaveType>;
  onClose: () => void;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
}

const TYPE_DOT_COLORS: Record<LeaveTypeCode, string> = {
  urlaub:        'bg-blue-500',
  zeitausgleich: 'bg-indigo-500',
  krankenstand:  'bg-red-500',
  schule:        'bg-cyan-500',
  pflege:        'bg-orange-500',
  schulung:      'bg-violet-500',
  sonderurlaub:  'bg-slate-400',
};

// Modal that lists every leave covering a specific day. Opened from
// the calendar by clicking a day cell. Acts as the answer to
// "who exactly is out on this day, and why?".
export default function DayDetailModal({ day, leaves, appointments = [], employees, leaveTypes, onClose }: DayDetailModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="day-detail-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            <span className="font-bold" style={{ fontSize: 16 }}>{formatGermanDate(day)}</span>
            <span className="text-slate-400" style={{ fontSize: 12 }}>
              ({appointments.length > 0 ? `${appointments.length} Termin${appointments.length === 1 ? '' : 'e'}, ` : ''}
              {leaves.length} {leaves.length === 1 ? 'Abwesenheit' : 'Abwesenheiten'})
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Appointments first — most actionable layer for a dispatcher */}
          {appointments.length > 0 && (
            <ul className="divide-y divide-slate-100 border-b border-slate-200 bg-violet-50/40">
              {appointments.map((a) => {
                const employeeNames = (a.employeeIds ?? [])
                  .map((id) => employees.get(id)?.name)
                  .filter(Boolean) as string[];
                const location = (a.metadata?.location as string | undefined) ?? null;
                return (
                  <li key={a.id} className="px-5 py-3" data-testid="day-detail-appointment">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-violet-900 truncate" style={{ fontSize: 13 }}>
                          {a.title}
                        </span>
                      </div>
                      <span className="text-violet-700 font-mono text-xs flex-shrink-0">
                        {a.allDay ? 'Ganztägig' : `${fmtTime(a.startsAt)}–${fmtTime(a.endsAt)}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600" style={{ fontSize: 11 }}>
                      {location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={10} className="text-slate-400" />
                          {location}
                        </span>
                      )}
                      {employeeNames.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users size={10} className="text-slate-400" />
                          {employeeNames.join(', ')}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {leaves.length === 0 && appointments.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p style={{ fontSize: 12 }}>Nichts geplant an diesem Tag.</p>
            </div>
          ) : leaves.length === 0 ? null : (
            <ul className="divide-y divide-slate-100">
              {leaves.map((req) => {
                const emp = employees.get(req.employeeId);
                const type = leaveTypes.get(req.leaveTypeCode);
                const sub = req.substituteId ? employees.get(req.substituteId) : undefined;
                const dot = TYPE_DOT_COLORS[req.leaveTypeCode] ?? 'bg-slate-400';
                return (
                  <li key={req.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <User size={12} className="text-slate-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-700 truncate" style={{ fontSize: 13 }}>
                          {emp?.name ?? req.employeeId}
                        </span>
                      </div>
                      <LeaveStatusBadge status={req.status ?? 'pending'} />
                    </div>
                    <div className="flex items-center gap-2 text-slate-600" style={{ fontSize: 12 }}>
                      <span className={`inline-block rounded-full ${dot}`} style={{ width: 8, height: 8 }} />
                      <span className="font-medium text-slate-700">{type?.label ?? req.leaveTypeCode}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{formatRange(req.startDate, req.endDate, req.halfDayStart, req.halfDayEnd)}</span>
                    </div>
                    {(req.reason || sub) && (
                      <div className="mt-1.5 space-y-0.5 text-slate-500" style={{ fontSize: 11 }}>
                        {req.reason && <div className="italic">„{req.reason}"</div>}
                        {sub && (
                          <div>
                            Vertretung: <span className="font-medium text-slate-600">{sub.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
