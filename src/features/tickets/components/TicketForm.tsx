import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Search, User, X } from 'lucide-react';
import { createTicket, updateTicket } from '../api/ticketApi';
import {
  listAbteilungen,
  listEmployees,
  listStandorte,
  type Abteilung,
  type Standort,
} from '../../vacation/api/vacationApi';
import CustomerPicker from '../../../components/CustomerPicker';
import type { Employee } from '../../vacation/types';
import type { Ticket, TicketKind, TicketPriority } from '../types';

interface TicketFormProps {
  // null = create mode, otherwise edit
  ticket?: Ticket | null;
  // Optional initial customer (e.g. when opening from CRM)
  initialCustomer?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    mesonicId?: string | null;
    hasWartungsvertrag?: boolean;
  };
  onSaved: (ticket: Ticket) => void;
  onClose: () => void;
  currentEmployeeId?: string | null;
}

const KINDS: Array<{ id: TicketKind; label: string }> = [
  { id: 'support', label: 'Support' },
  { id: 'installation', label: 'Installation' },
  { id: 'reparatur', label: 'Reparatur' },
  { id: 'wartung', label: 'Wartung' },
  { id: 'beratung', label: 'Beratung' },
  { id: 'intern', label: 'Intern' },
];

const PRIORITIES: Array<{ id: TicketPriority; label: string; cls: string }> = [
  { id: 'low',    label: 'Niedrig',  cls: 'text-slate-500' },
  { id: 'normal', label: 'Normal',   cls: 'text-slate-700' },
  { id: 'high',   label: 'Hoch',     cls: 'text-amber-600' },
  { id: 'urgent', label: 'Dringend', cls: 'text-red-600' },
];

export default function TicketForm({
  ticket = null,
  initialCustomer,
  onSaved,
  onClose,
  currentEmployeeId = null,
}: TicketFormProps) {
  const isEdit = !!ticket;

  // Form state
  const [title, setTitle] = useState(ticket?.title ?? '');
  const [description, setDescription] = useState(ticket?.description ?? '');
  const [kind, setKind] = useState<TicketKind>(ticket?.kind ?? 'support');
  const [priority, setPriority] = useState<TicketPriority>(ticket?.priority ?? 'normal');
  const [poolAbteilungId, setPoolAbteilungId] = useState<number | null>(ticket?.poolAbteilungId ?? null);
  const [standortId, setStandortId] = useState<number | null>(ticket?.standortId ?? null);
  const [assignedTo, setAssignedTo] = useState<string | null>(
    ticket?.assignedTo ?? currentEmployeeId,
  );
  const [billable, setBillable] = useState(ticket?.billable ?? true);

  const [customerName, setCustomerName] = useState(ticket?.customerName ?? initialCustomer?.name ?? '');
  const [customerPhone, setCustomerPhone] = useState(ticket?.customerPhone ?? initialCustomer?.phone ?? '');
  const [customerEmail, setCustomerEmail] = useState(ticket?.customerEmail ?? initialCustomer?.email ?? '');
  const [customerAddress, setCustomerAddress] = useState(
    ticket?.customerAddress ?? initialCustomer?.address ?? '',
  );
  const [mesonicCustomerId, setMesonicCustomerId] = useState(
    ticket?.mesonicCustomerId ?? initialCustomer?.mesonicId ?? '',
  );
  const [hasWartungsvertrag, setHasWartungsvertrag] = useState(
    ticket?.customerHasWartungsvertrag ?? initialCustomer?.hasWartungsvertrag ?? false,
  );

  // Lookups
  const [abteilungen, setAbteilungen] = useState<Abteilung[]>([]);
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  // Submission
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLookupsLoading(true);
    Promise.all([listAbteilungen(), listStandorte(), listEmployees({ activeOnly: true })])
      .then(([a, s, e]) => {
        if (cancelled) return;
        setAbteilungen(a);
        setStandorte(s);
        setEmployees(e);
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

  function handleCustomerPick(c: {
    name?: string;
    company?: string;
    email?: string;
    phone?: string;
    address?: string;
    mesonicId?: string;
  }) {
    setCustomerName(c.company || c.name || '');
    setCustomerPhone(c.phone ?? '');
    setCustomerEmail(c.email ?? '');
    setCustomerAddress(c.address ?? '');
    setMesonicCustomerId(c.mesonicId ?? '');
    setShowCustomerPicker(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Bitte einen Titel eingeben.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        kind,
        priority,
        poolAbteilungId,
        standortId,
        assignedTo,
        billable,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        customerEmail: customerEmail.trim() || null,
        customerAddress: customerAddress.trim() || null,
        mesonicCustomerId: mesonicCustomerId.trim() || null,
        customerHasWartungsvertrag: hasWartungsvertrag,
      };
      const saved = isEdit
        ? await updateTicket(ticket!.id, input)
        : await createTicket({ ...input, createdBy: currentEmployeeId ?? null });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-auto"
      onClick={onClose}
      data-testid="ticket-form-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl mt-10 mb-10 w-full max-w-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800" style={{ fontSize: 16 }}>
            {isEdit ? `Ticket bearbeiten — ${ticket?.ticketNumber}` : 'Neues Ticket'}
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="Schließen">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Titel *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Drucker druckt nicht mehr"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Beschreibung</label>
            <textarea
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details zum Problem, Anweisungen für den Techniker…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>

          {/* Kind + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Art</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as TicketKind)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Priorität</label>
              <div className="flex flex-wrap gap-1">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriority(p.id)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition ${
                      priority === p.id
                        ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Kunde</span>
              <button
                type="button"
                onClick={() => setShowCustomerPicker(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-600 hover:bg-slate-100"
              >
                <Search size={12} />
                Bestandskunde
              </button>
            </div>
            <input
              type="text"
              value={customerName ?? ''}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name / Firma"
              className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-red-500/30"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="tel"
                value={customerPhone ?? ''}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Telefon"
                className="px-2.5 py-1.5 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-red-500/30"
              />
              <input
                type="email"
                value={customerEmail ?? ''}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="E-Mail"
                className="px-2.5 py-1.5 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-red-500/30"
              />
            </div>
            <input
              type="text"
              value={customerAddress ?? ''}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Adresse"
              className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-red-500/30"
            />
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={hasWartungsvertrag}
                onChange={(e) => setHasWartungsvertrag(e.target.checked)}
                className="rounded text-red-600"
              />
              Mesonic-Wartungsvertrag (Stundensatz €138 statt €183)
            </label>
            {mesonicCustomerId && (
              <div className="text-xs text-slate-400">Mesonic-Nr: {mesonicCustomerId}</div>
            )}
          </div>

          {/* Zuweisung */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Standort</label>
              <select
                value={standortId ?? ''}
                onChange={(e) => setStandortId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                disabled={lookupsLoading}
              >
                <option value="">—</option>
                {standorte.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Pool / Abteilung</label>
              <select
                value={poolAbteilungId ?? ''}
                onChange={(e) => setPoolAbteilungId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                disabled={lookupsLoading}
              >
                <option value="">—</option>
                {abteilungen.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Zugewiesen an</label>
              <select
                value={assignedTo ?? ''}
                onChange={(e) => setAssignedTo(e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                disabled={lookupsLoading}
              >
                <option value="">—</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Verrechnung */}
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="rounded text-red-600"
            />
            Verrechenbar (Reparaturscheine werden bei Abschluss summiert)
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              disabled={saving}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              disabled={saving || !title.trim()}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Speichern' : 'Ticket erstellen'}
            </button>
          </div>
        </form>

        {showCustomerPicker && (
          <CustomerPicker
            onSelect={handleCustomerPick}
            onClose={() => setShowCustomerPicker(false)}
          />
        )}
      </div>
    </div>
  );
}
