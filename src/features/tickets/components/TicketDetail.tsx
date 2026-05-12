import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Edit2,
  Link as LinkIcon,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  User,
} from 'lucide-react';
import { getTicket, setTicketStatus, updateTicket } from '../api/ticketApi';
import { listAbteilungen, listEmployees } from '../../vacation/api/vacationApi';
import type { Abteilung } from '../../vacation/api/vacationApi';
import type { Employee } from '../../vacation/types';
import type { Ticket, TicketPriority, TicketStatus } from '../types';
import TicketForm from './TicketForm';
import TicketComments from './TicketComments';
import RepairOrdersTab from './RepairOrdersTab';
import AppointmentsTab from './AppointmentsTab';
import AttachmentsPanel from './AttachmentsPanel';
import TicketBillingPreview from './TicketBillingPreview';
import Select from '../../../components/Select';

interface TicketDetailProps {
  ticketId: string;
  onBack: () => void;
  currentEmployeeId?: string | null;
}

type DetailTab = 'overview' | 'appointments' | 'repair_orders' | 'history';

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'appointments', label: 'Termine' },
  { id: 'repair_orders', label: 'Reparaturscheine' },
  { id: 'history', label: 'Verlauf' },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  closed: 'Geschlossen',
  cancelled: 'Abgesagt',
};

const STATUS_CLS: Record<TicketStatus, string> = {
  open:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  waiting:     'bg-slate-100 text-slate-600 border-slate-200',
  closed:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:   'bg-rose-50 text-rose-700 border-rose-200',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  urgent: 'Dringend',
};

const PRIORITY_CLS: Record<TicketPriority, string> = {
  low:    'text-slate-500',
  normal: 'text-slate-700',
  high:   'text-amber-600 font-semibold',
  urgent: 'text-red-600 font-semibold',
};

const KIND_LABEL: Record<Ticket['kind'], string> = {
  support: 'Support',
  installation: 'Installation',
  reparatur: 'Reparatur',
  wartung: 'Wartung',
  beratung: 'Beratung',
  intern: 'Intern',
};

export default function TicketDetail({ ticketId, onBack, currentEmployeeId = null }: TicketDetailProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [abteilungen, setAbteilungen] = useState<Abteilung[]>([]);
  const [editing, setEditing] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  function buildPublicShareUrl(t: Ticket): string {
    // The customer-facing flow lives outside the HashRouter at the
    // origin's root, keyed on the share_code query param. Match the
    // ?a= pattern used by offers.
    return `${window.location.origin}${window.location.pathname}?t=${t.shareCode}`;
  }

  async function handleCopyShareLink() {
    if (!ticket) return;
    const url = buildPublicShareUrl(ticket);
    try {
      await navigator.clipboard.writeText(url);
      setShareLinkCopied(true);
      window.setTimeout(() => setShareLinkCopied(false), 1500);
    } catch {
      // Browsers that block clipboard access (HTTP, embedded iframe, …)
      // — fall back to a prompt the user can manually copy from.
      window.prompt('Link manuell kopieren:', url);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getTicket(ticketId);
      if (!t) {
        setError('Ticket nicht gefunden');
        setTicket(null);
        return;
      }
      setTicket(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listEmployees({ activeOnly: true }), listAbteilungen()])
      .then(([e, a]) => {
        if (cancelled) return;
        setEmployees(e);
        setAbteilungen(a);
      })
      .catch(() => {
        /* lookups are optional; detail view still works without them */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees]);
  const abteilungById = useMemo(() => new Map(abteilungen.map((a) => [a.id, a] as const)), [abteilungen]);

  async function handleStatusChange(status: TicketStatus) {
    if (!ticket) return;
    if (status === 'closed') {
      setShowCloseDialog(true);
      return;
    }
    try {
      const updated = await setTicketStatus(ticket.id, status, {
        actorId: currentEmployeeId ?? undefined,
      });
      setTicket(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAssign(employeeId: string | null) {
    if (!ticket) return;
    try {
      const updated = await updateTicket(ticket.id, { assignedTo: employeeId }, {
        actorId: currentEmployeeId ?? undefined,
      });
      setTicket(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-red-400" />
      </div>
    );
  }
  if (error && !ticket) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800 mb-3">
          <ArrowLeft size={14} />
          Zurück zur Liste
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      </div>
    );
  }
  if (!ticket) return null;

  const assignee = ticket.assignedTo ? employeesById.get(ticket.assignedTo) : null;
  const pool = ticket.poolAbteilungId != null ? abteilungById.get(ticket.poolAbteilungId) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 md:px-6 md:py-6">
      {/* Header */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800 mb-3"
      >
        <ArrowLeft size={14} />
        Zurück zur Liste
      </button>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 md:px-5 md:py-4 mb-3">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-mono text-xs text-slate-400">{ticket.ticketNumber}</span>
          <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_CLS[ticket.status]}`}>
            {STATUS_LABEL[ticket.status]}
          </span>
          <span className={`text-xs ${PRIORITY_CLS[ticket.priority]}`}>
            {PRIORITY_LABEL[ticket.priority]}
          </span>
          <span className="text-xs text-slate-400">· {KIND_LABEL[ticket.kind]}</span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="font-bold text-slate-800 leading-tight" style={{ fontSize: 18 }}>
            {ticket.title}
          </h1>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100"
              title="Öffentlichen Auftragsverfolgungs-Link kopieren"
              data-testid="copy-share-link"
            >
              {shareLinkCopied ? (
                <>
                  <Check size={12} className="text-emerald-600" />
                  Kopiert
                </>
              ) : (
                <>
                  <LinkIcon size={12} />
                  Kundenlink
                </>
              )}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100"
            >
              <Edit2 size={12} />
              Bearbeiten
            </button>
          </div>
        </div>
      </div>

      {/* Status & Assignment quick-controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Select
          value={ticket.status}
          onChange={(v) => handleStatusChange(v as TicketStatus)}
          options={(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => ({
            value: s,
            label: STATUS_LABEL[s],
          }))}
          disabled={ticket.status === 'closed'}
          size="sm"
          className="inline-block w-44"
          ariaLabel="Status"
        />
        <Select
          value={ticket.assignedTo ?? ''}
          onChange={(v) => handleAssign(v || null)}
          options={[
            { value: '', label: 'Niemandem zugewiesen' },
            ...employees.map((emp) => ({ value: emp.id, label: emp.name })),
          ]}
          size="sm"
          className="inline-block w-56"
          ariaLabel="Zugewiesen an"
        />
        {ticket.status !== 'closed' && (
          <button
            onClick={() => setShowCloseDialog(true)}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <CheckCircle2 size={14} />
            Ticket schließen
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-3 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm transition border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'border-red-500 text-red-600 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {ticket.description && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500 mb-1">Beschreibung</div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.description}</div>
            </div>
          )}

          {/* Customer */}
          {(ticket.customerName || ticket.customerPhone || ticket.customerEmail || ticket.customerAddress) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500 mb-2">Kunde</div>
              <div className="space-y-1.5 text-sm">
                {ticket.customerName && (
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    {ticket.customerName}
                    {ticket.customerHasWartungsvertrag && (
                      <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-xs border border-emerald-200">
                        Wartungsvertrag
                      </span>
                    )}
                  </div>
                )}
                {ticket.customerPhone && (
                  <a href={`tel:${ticket.customerPhone}`} className="flex items-center gap-2 text-slate-600 hover:text-slate-800">
                    <Phone size={12} className="text-slate-400" />
                    {ticket.customerPhone}
                  </a>
                )}
                {ticket.customerEmail && (
                  <a href={`mailto:${ticket.customerEmail}`} className="flex items-center gap-2 text-slate-600 hover:text-slate-800">
                    <Mail size={12} className="text-slate-400" />
                    {ticket.customerEmail}
                  </a>
                )}
                {ticket.customerAddress && (
                  <div className="flex items-start gap-2 text-slate-600">
                    <MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                    <span>{ticket.customerAddress}</span>
                  </div>
                )}
                {ticket.mesonicCustomerId && (
                  <div className="text-xs text-slate-400">Mesonic-Nr: {ticket.mesonicCustomerId}</div>
                )}
              </div>
            </div>
          )}

          {/* Assignment + meta */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-slate-500">Zugewiesen</div>
                <div className="text-slate-700 flex items-center gap-1">
                  <User size={12} className="text-slate-400" />
                  {assignee?.name ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Pool</div>
                <div className="text-slate-700">{pool?.name ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Verrechenbar</div>
                <div className="text-slate-700">{ticket.billable ? 'Ja' : 'Nein'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Erstellt</div>
                <div className="text-slate-700">
                  {new Date(ticket.createdAt).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              </div>
              {ticket.closedAt && (
                <div>
                  <div className="text-xs font-medium text-slate-500">Geschlossen</div>
                  <div className="text-slate-700">
                    {new Date(ticket.closedAt).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
              )}
            </div>
            {ticket.resolutionNote && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-xs font-medium text-slate-500 mb-1">Lösungsnotiz</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.resolutionNote}</div>
              </div>
            )}
          </div>

          {/* Attachments on the ticket itself (Photos vom Schaden,
              Schriftverkehr, etc.). Per-Reparaturschein-Anhänge
              werden in der jeweiligen RO-Detailansicht verwaltet. */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <AttachmentsPanel
              scope={{ ticketId: ticket.id }}
              currentEmployeeId={currentEmployeeId}
              editable={ticket.status !== 'closed' && ticket.status !== 'cancelled'}
            />
          </div>
        </div>
      )}

      {tab === 'appointments' && (
        <AppointmentsTab ticket={ticket} currentEmployeeId={currentEmployeeId} />
      )}

      {tab === 'repair_orders' && (
        <RepairOrdersTab
          ticket={ticket}
          currentEmployeeId={currentEmployeeId}
        />
      )}

      {tab === 'history' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={14} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-600">Verlauf & Kommentare</span>
          </div>
          <TicketComments ticketId={ticket.id} currentEmployeeId={currentEmployeeId} />
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <TicketForm
          ticket={ticket}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setTicket(updated);
            setEditing(false);
          }}
        />
      )}

      {/* Close-with-billing-preview dialog */}
      {showCloseDialog && (
        <TicketBillingPreview
          ticket={ticket}
          currentEmployeeId={currentEmployeeId}
          onCancel={() => setShowCloseDialog(false)}
          onClosed={(updated) => {
            setTicket(updated);
            setShowCloseDialog(false);
          }}
        />
      )}
    </div>
  );
}
