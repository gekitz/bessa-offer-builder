import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, Loader2, MapPin, Trash2, User, X } from 'lucide-react';
import {
  createAppointment,
  deleteAppointment,
  setAppointmentAssignees,
  updateAppointment,
} from '../api/ticketApi';
import { listEmployees, listStandorte, type Standort } from '../../vacation/api/vacationApi';
import Select from '../../../components/Select';
import type { Employee } from '../../vacation/types';
import type {
  Appointment,
  AppointmentInput,
  AppointmentKind,
  AppointmentStatus,
  AssigneeRole,
  Ticket,
} from '../types';

interface AppointmentFormProps {
  appointment?: Appointment | null;
  // When opened from a ticket, pre-fills customer + ticketId. Otherwise standalone.
  fromTicket?: Ticket | null;
  // Default starts_at when creating (e.g. clicked day in calendar). ISO.
  defaultStartsAt?: string;
  onSaved: (a: Appointment) => void;
  onDeleted?: () => void;
  onClose: () => void;
  currentEmployeeId?: string | null;
}

const KIND_LABEL: Record<AppointmentKind, string> = {
  installation: 'Installation',
  reparatur: 'Reparatur',
  wartung: 'Wartung',
  beratung: 'Beratung',
  abholung: 'Abholung',
  lieferung: 'Lieferung',
  intern: 'Intern',
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  geplant: 'Geplant',
  bestaetigt: 'Bestätigt',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
  abgesagt: 'Abgesagt',
};

const ROLE_LABEL: Record<AssigneeRole, string> = {
  lead: 'Lead',
  techniker: 'Techniker',
  lehrling: 'Lehrling',
};

// HTML5 <input type="datetime-local"> expects 'YYYY-MM-DDTHH:mm' in local time.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(value: string): string {
  // datetime-local has no tz suffix → interpret as local and convert.
  const d = new Date(value);
  return d.toISOString();
}

interface AssigneeRow {
  employeeId: string;
  role: AssigneeRole;
}

function defaultStarts(): string {
  // Next full hour, default duration 1h.
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export default function AppointmentForm({
  appointment = null,
  fromTicket = null,
  defaultStartsAt,
  onSaved,
  onDeleted,
  onClose,
  currentEmployeeId = null,
}: AppointmentFormProps) {
  const isEdit = !!appointment;

  // Form fields
  const [title, setTitle] = useState(
    appointment?.title ?? (fromTicket ? `Termin — ${fromTicket.title}` : ''),
  );
  const [description, setDescription] = useState(appointment?.description ?? '');
  const [kind, setKind] = useState<AppointmentKind>(appointment?.kind ?? 'reparatur');
  const [status, setStatus] = useState<AppointmentStatus>(appointment?.status ?? 'geplant');
  const [location, setLocation] = useState(appointment?.location ?? fromTicket?.customerAddress ?? '');
  const [standortId, setStandortId] = useState<number | null>(
    appointment?.standortId ?? fromTicket?.standortId ?? null,
  );
  const [customerName, setCustomerName] = useState(
    appointment?.customerName ?? fromTicket?.customerName ?? '',
  );
  const [mesonicCustomerId, setMesonicCustomerId] = useState(
    appointment?.mesonicCustomerId ?? fromTicket?.mesonicCustomerId ?? '',
  );
  const [notes, setNotes] = useState(appointment?.notes ?? '');

  const initialStarts = appointment?.startsAt ?? defaultStartsAt ?? defaultStarts();
  const initialEnds = appointment?.endsAt
    ?? new Date(new Date(initialStarts).getTime() + 60 * 60 * 1000).toISOString();
  const [startsAtLocal, setStartsAtLocal] = useState(isoToLocalInput(initialStarts));
  const [endsAtLocal, setEndsAtLocal] = useState(isoToLocalInput(initialEnds));

  const [assignees, setAssignees] = useState<AssigneeRow[]>(() => {
    if (appointment?.assignees?.length) {
      return appointment.assignees.map((a) => ({ employeeId: a.employeeId, role: a.role }));
    }
    if (currentEmployeeId) {
      return [{ employeeId: currentEmployeeId, role: 'lead' }];
    }
    return [];
  });

  // Lookups
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  // Submission
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listEmployees({ activeOnly: true }), listStandorte()])
      .then(([e, s]) => {
        if (cancelled) return;
        setEmployees(e);
        setStandorte(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLookupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees]);
  const availableEmployees = useMemo(() => {
    const taken = new Set(assignees.map((a) => a.employeeId));
    return employees.filter((e) => !taken.has(e.id));
  }, [employees, assignees]);

  function handleAddAssignee(employeeId: string) {
    if (!employeeId) return;
    setAssignees((prev) => [...prev, { employeeId, role: 'techniker' }]);
  }

  function handleChangeRole(idx: number, role: AssigneeRole) {
    setAssignees((prev) => prev.map((a, i) => (i === idx ? { ...a, role } : a)));
  }

  function handleRemoveAssignee(idx: number) {
    setAssignees((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Bitte einen Titel eingeben.');
      return;
    }
    const startsIso = localInputToIso(startsAtLocal);
    const endsIso = localInputToIso(endsAtLocal);
    if (!(new Date(endsIso).getTime() > new Date(startsIso).getTime())) {
      setError('Ende muss nach dem Start liegen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: AppointmentInput = {
        ticketId: fromTicket?.id ?? appointment?.ticketId ?? null,
        title: title.trim(),
        description: description.trim() || null,
        kind,
        status,
        startsAt: startsIso,
        endsAt: endsIso,
        allDay: false,
        location: location.trim() || null,
        standortId,
        customerName: customerName.trim() || null,
        mesonicCustomerId: mesonicCustomerId.trim() || null,
        notes: notes.trim() || null,
      };

      let saved: Appointment;
      if (isEdit) {
        saved = await updateAppointment(appointment!.id, input);
        await setAppointmentAssignees(saved.id, assignees);
      } else {
        saved = await createAppointment({ ...input, createdBy: currentEmployeeId ?? null }, assignees);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!appointment) return;
    if (!window.confirm('Termin wirklich löschen?')) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAppointment(appointment.id);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-auto"
      // No backdrop close — see TicketForm rationale (data loss).
      data-testid="appointment-form-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl mt-10 mb-10 w-full max-w-2xl mx-3 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-violet-600" />
            <h2 className="font-bold text-slate-800" style={{ fontSize: 16 }}>
              {isEdit ? 'Termin bearbeiten' : 'Neuer Termin'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="Schließen">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Titel *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Drucker-Reparatur vor Ort"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start</label>
              <input
                type="datetime-local"
                value={startsAtLocal}
                onChange={(e) => setStartsAtLocal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                required
                data-testid="appointment-starts-at"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ende</label>
              <input
                type="datetime-local"
                value={endsAtLocal}
                onChange={(e) => setEndsAtLocal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                required
                data-testid="appointment-ends-at"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Art</label>
              <Select
                value={kind}
                onChange={(v) => setKind(v as AppointmentKind)}
                options={(Object.keys(KIND_LABEL) as AppointmentKind[]).map((k) => ({
                  value: k,
                  label: KIND_LABEL[k],
                }))}
                ariaLabel="Art"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <Select
                value={status}
                onChange={(v) => setStatus(v as AppointmentStatus)}
                options={(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                }))}
                ariaLabel="Status"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ort</label>
            <div className="relative">
              <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={fromTicket?.customerAddress ?? 'Adresse oder Standort'}
                className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
          </div>

          {/* Customer (only editable if not from ticket) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kunde</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name / Firma"
              disabled={!!fromTicket}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {fromTicket && (
              <div className="text-xs text-slate-400 mt-0.5">
                Aus Ticket {fromTicket.ticketNumber}
              </div>
            )}
          </div>

          {/* Assignees */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Techniker</span>
            </div>
            {assignees.length === 0 && (
              <div className="text-xs text-slate-400">Noch niemand zugewiesen.</div>
            )}
            <ul className="space-y-1" data-testid="assignee-list">
              {assignees.map((a, idx) => {
                const emp = employeesById.get(a.employeeId);
                return (
                  <li key={a.employeeId} className="flex items-center gap-2 text-sm">
                    <User size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="font-medium text-slate-700 flex-1">{emp?.name ?? a.employeeId}</span>
                    <Select
                      value={a.role}
                      onChange={(v) => handleChangeRole(idx, v as AssigneeRole)}
                      options={(Object.keys(ROLE_LABEL) as AssigneeRole[]).map((r) => ({
                        value: r,
                        label: ROLE_LABEL[r],
                      }))}
                      size="sm"
                      className="inline-block w-28"
                      ariaLabel="Rolle"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveAssignee(idx)}
                      className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="Entfernen"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div data-testid="assignee-add">
              <Select
                value=""
                onChange={(v) => handleAddAssignee(v)}
                options={[
                  { value: '', label: '+ Techniker hinzufügen…' },
                  ...availableEmployees.map((emp) => ({ value: emp.id, label: emp.name })),
                ]}
                disabled={lookupsLoading || availableEmployees.length === 0}
                placeholder="+ Techniker hinzufügen…"
                ariaLabel="Techniker hinzufügen"
              />
            </div>
          </div>

          {/* Description + Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Beschreibung</label>
            <textarea
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Was ist zu tun?"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          {!lookupsLoading && standorte.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Standort (für Kalender-Filterung)</label>
              <Select
                value={standortId != null ? String(standortId) : ''}
                onChange={(v) => setStandortId(v ? Number(v) : null)}
                options={[
                  { value: '', label: '—' },
                  ...standorte.map((s) => ({ value: String(s.id), label: s.name })),
                ]}
                ariaLabel="Standort"
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {isEdit && onDeleted ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={12} />
                Termin löschen
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || deleting}
                className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving || deleting || !title.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isEdit ? 'Speichern' : 'Termin anlegen'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
