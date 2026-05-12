import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  FileSignature,
  Loader2,
  Package,
  PenTool,
  Plus,
  Receipt,
  Trash2,
  User,
} from 'lucide-react';
import {
  addMaterial,
  getRepairOrder,
  listServiceRates,
  listTravelZones,
  removeMaterial,
  signRepairOrder,
  updateRepairOrder,
} from '../api/ticketApi';
import { listEmployees } from '../../vacation/api/vacationApi';
import { calcRepairOrderBilling } from '../lib/billing';
import type { Employee } from '../../vacation/types';
import type {
  RepairOrder,
  RepairOrderEntry,
  RepairOrderMaterial,
  ServiceRate,
  Ticket,
  TravelZone,
} from '../types';
import AttachmentsPanel from './AttachmentsPanel';
import MaterialPicker from './MaterialPicker';
import SignatureCapture from './SignatureCapture';
import TimeEntryForm from './TimeEntryForm';

interface RepairOrderDetailProps {
  ticket: Ticket;
  repairOrderId: string;
  onBack: () => void;
  onChanged?: () => void;
  currentEmployeeId?: string | null;
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

function eur(n: number): string {
  return `€${n.toFixed(2)}`;
}

export default function RepairOrderDetail({
  ticket,
  repairOrderId,
  onBack,
  onChanged,
  currentEmployeeId = null,
}: RepairOrderDetailProps) {
  const [order, setOrder] = useState<RepairOrder | null>(null);
  const [entries, setEntries] = useState<RepairOrderEntry[]>([]);
  const [materials, setMaterials] = useState<RepairOrderMaterial[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rates, setRates] = useState<ServiceRate[]>([]);
  const [zones, setZones] = useState<TravelZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline-editor state
  const [downloading, setDownloading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RepairOrderEntry | null>(null);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  // Inline description / gps-travel editing
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [draftGpsTravel, setDraftGpsTravel] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRepairOrder(repairOrderId);
      if (!res) {
        setError('Reparaturschein nicht gefunden');
        return;
      }
      setOrder(res.repairOrder);
      setEntries(res.entries);
      setMaterials(res.materials);
      setDraftDescription(res.repairOrder.workDescription ?? '');
      setDraftGpsTravel(res.repairOrder.gpsTravelNote ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [repairOrderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listEmployees({ activeOnly: true }), listServiceRates(), listTravelZones()])
      .then(([emps, r, z]) => {
        if (cancelled) return;
        setEmployees(emps);
        setRates(r);
        setZones(z);
      })
      .catch(() => {
        /* not fatal */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rateByCode = useMemo(() => new Map(rates.map((r) => [r.code, r] as const)), [rates]);
  const zoneByCode = useMemo(() => new Map(zones.map((z) => [z.code, z] as const)), [zones]);
  const employeeNameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name] as const)), [employees]);

  // Live billing preview for this repair order
  const billing = useMemo(() => {
    if (!order) return null;
    if (rateByCode.size === 0) return null;
    return calcRepairOrderBilling({
      repairOrder: order,
      entries,
      materials,
      rateByCode,
      zoneByCode,
      employeeNameById,
      customerHasWartungsvertrag: ticket.customerHasWartungsvertrag,
    });
  }, [order, entries, materials, rateByCode, zoneByCode, employeeNameById, ticket.customerHasWartungsvertrag]);

  const locked = order?.status === 'signed' || order?.status === 'cancelled';

  async function handleSaveMeta() {
    if (!order) return;
    setSavingMeta(true);
    setError(null);
    try {
      const updated = await updateRepairOrder(order.id, {
        workDescription: draftDescription.trim() || null,
        gpsTravelNote: draftGpsTravel.trim() || null,
      });
      setOrder(updated);
      setEditingMeta(false);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleMarkCompleted() {
    if (!order) return;
    setError(null);
    try {
      const updated = await updateRepairOrder(order.id, { status: 'completed' });
      setOrder(updated);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveMaterial(id: string) {
    if (!window.confirm('Material entfernen?')) return;
    try {
      await removeMaterial(id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDownloadPdf() {
    if (!order || !billing) return;
    setDownloading(true);
    setError(null);
    try {
      const { generateRepairOrderPdfBlob } = await import('../../../pdf/generateRepairOrderPdf');
      const employeesByEntry: Record<string, string> = {};
      for (const e of entries) {
        const name = employeeNameById.get(e.employeeId);
        if (name) employeesByEntry[e.id] = name;
      }
      const blob = await generateRepairOrderPdfBlob({
        ticket,
        repairOrder: order,
        billing,
        employeesByEntry,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ticket.ticketNumber}-Rep-${order.seqNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function handleSignConfirm(input: { signatureDataUrl: string; signedByName: string }) {
    if (!order) return;
    const updated = await signRepairOrder(order.id, input.signatureDataUrl, input.signedByName);
    setOrder(updated);
    setShowSignature(false);
    onChanged?.();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-red-400" />
      </div>
    );
  }
  if (error && !order) {
    return (
      <div className="space-y-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800">
          <ArrowLeft size={12} />
          Zurück
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      </div>
    );
  }
  if (!order) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800">
        <ArrowLeft size={12} />
        Zurück zur Liste
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-slate-500" />
            <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>
              Reparaturschein #{order.seqNumber}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_CLS[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            durchgeführt am {new Date(order.performedAt).toLocaleDateString('de-AT')}
          </div>
        </div>

        {/* Description + GPS note */}
        {editingMeta ? (
          <div className="space-y-2 mt-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Arbeitsbeschreibung</label>
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">GPS-/Anfahrts-Notiz</label>
              <input
                type="text"
                value={draftGpsTravel}
                onChange={(e) => setDraftGpsTravel(e.target.value)}
                placeholder='z.B. "Anfahrt wird nach GPS verrechnet"'
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftDescription(order.workDescription ?? '');
                  setDraftGpsTravel(order.gpsTravelNote ?? '');
                  setEditingMeta(false);
                }}
                className="px-2.5 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-100"
                disabled={savingMeta}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSaveMeta}
                disabled={savingMeta}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 disabled:opacity-50"
              >
                {savingMeta && <Loader2 size={12} className="animate-spin" />}
                Speichern
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {order.workDescription && (
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{order.workDescription}</div>
            )}
            {order.gpsTravelNote && (
              <div className="text-xs text-slate-500 italic">{order.gpsTravelNote}</div>
            )}
            {!locked && (
              <button
                type="button"
                onClick={() => setEditingMeta(true)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <Edit2 size={10} />
                Beschreibung / GPS-Notiz bearbeiten
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Entries */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Zeiteinträge</span>
            <span className="text-xs text-slate-400">({entries.length})</span>
          </div>
          {!locked && !showEntryForm && !editingEntry && (
            <button
              type="button"
              onClick={() => setShowEntryForm(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100"
            >
              <Plus size={12} />
              Eintrag
            </button>
          )}
        </div>

        {entries.length === 0 && !showEntryForm && (
          <div className="text-xs text-slate-400 text-center py-3">Noch keine Zeiteinträge.</div>
        )}

        <ul className="space-y-2">
          {entries.map((e) => {
            if (editingEntry?.id === e.id) {
              return (
                <li key={e.id}>
                  <TimeEntryForm
                    repairOrderId={order.id}
                    entry={e}
                    employees={employees}
                    onSaved={(saved) => {
                      setEntries((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
                      setEditingEntry(null);
                      onChanged?.();
                    }}
                    onDeleted={() => {
                      setEntries((prev) => prev.filter((x) => x.id !== e.id));
                      setEditingEntry(null);
                      onChanged?.();
                    }}
                    onCancel={() => setEditingEntry(null)}
                  />
                </li>
              );
            }
            const rate = rateByCode.get(e.serviceRateCode);
            const empName = employeeNameById.get(e.employeeId) ?? 'Unbekannt';
            const workH = (e.workMinutes / 60).toFixed(2);
            return (
              <li
                key={e.id}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm flex items-center gap-2 hover:border-slate-300"
                data-testid="entry-row"
              >
                <User size={12} className="text-slate-400 flex-shrink-0" />
                <span className="font-medium text-slate-700 flex-shrink-0">{empName}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 truncate flex-1">
                  {workH}h {rate?.label ?? e.serviceRateCode}
                </span>
                {e.travelMode && e.travelMode !== 'none' && (
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    {e.travelMode === 'pauschale' && e.travelZoneCode && `Anfahrt ${zoneByCode.get(e.travelZoneCode)?.label}`}
                    {e.travelMode === 'km_plus_wegzeit' && `${e.travelKm} km +Wegzeit`}
                    {e.travelMode === 'km_inkl_wegzeit' && `${e.travelKm} km inkl.`}
                  </span>
                )}
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setEditingEntry(e)}
                    className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    aria-label="Bearbeiten"
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {showEntryForm && (
          <div className="mt-2">
            <TimeEntryForm
              repairOrderId={order.id}
              employees={employees}
              defaultEmployeeId={currentEmployeeId}
              onSaved={(saved) => {
                setEntries((prev) => [...prev, saved]);
                setShowEntryForm(false);
                onChanged?.();
              }}
              onCancel={() => setShowEntryForm(false)}
            />
          </div>
        )}
      </div>

      {/* Materials */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Material</span>
            <span className="text-xs text-slate-400">({materials.length})</span>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => setShowMaterialPicker(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100"
            >
              <Plus size={12} />
              Material
            </button>
          )}
        </div>
        {materials.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-3">Kein Material erfasst.</div>
        ) : (
          <ul className="space-y-1">
            {materials.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm flex items-center gap-2"
                data-testid="material-row"
              >
                <span className="font-medium text-slate-700 truncate flex-1">{m.bezeichnung}</span>
                <span className="text-xs text-slate-400 hidden sm:inline">Nr. {m.mesonicArtikelNr}</span>
                <span className="text-slate-500">{m.quantity} ×</span>
                <span className="text-slate-700 font-mono">{eur(m.unitPrice)}</span>
                <span className="text-slate-300">=</span>
                <span className="text-slate-800 font-mono font-medium">{eur(m.total)}</span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMaterial(m.id)}
                    className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Entfernen"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Attachments specific to this repair order (photos of the
          fault, screenshots of error codes, etc.). Read-only once
          the rep-order is signed or cancelled. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <AttachmentsPanel
          scope={{ repairOrderId: order.id }}
          currentEmployeeId={currentEmployeeId}
          editable={!locked}
        />
      </div>

      {/* Billing preview */}
      {billing && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Receipt size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Zwischensumme (netto)</span>
          </div>
          <ul className="space-y-1 text-xs">
            {billing.laborTotal > 0 && (
              <li className="flex items-center justify-between">
                <span className="text-slate-600">Arbeit</span>
                <span className="font-mono text-slate-800">{eur(billing.laborTotal)}</span>
              </li>
            )}
            {billing.travelTotal > 0 && (
              <li className="flex items-center justify-between">
                <span className="text-slate-600">Anfahrt / Wegzeit</span>
                <span className="font-mono text-slate-800">{eur(billing.travelTotal)}</span>
              </li>
            )}
            {billing.serviceTotal > 0 && (
              <li className="flex items-center justify-between">
                <span className="text-slate-600">Service-Pauschalen</span>
                <span className="font-mono text-slate-800">{eur(billing.serviceTotal)}</span>
              </li>
            )}
            {billing.materialTotal > 0 && (
              <li className="flex items-center justify-between">
                <span className="text-slate-600">Material</span>
                <span className="font-mono text-slate-800">{eur(billing.materialTotal)}</span>
              </li>
            )}
            <li className="flex items-center justify-between border-t border-slate-200 pt-1.5 mt-1.5">
              <span className="font-semibold text-slate-700">Summe netto</span>
              <span className="font-mono font-semibold text-slate-900">{eur(billing.subtotal)}</span>
            </li>
          </ul>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {order.status === 'draft' && (
          <button
            type="button"
            onClick={handleMarkCompleted}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
          >
            <CheckCircle2 size={12} />
            Als abgeschlossen markieren
          </button>
        )}
        {order.status !== 'signed' && order.status !== 'cancelled' && (
          <button
            type="button"
            onClick={() => setShowSignature(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <PenTool size={14} />
            Kunde unterschreiben lassen
          </button>
        )}
        {order.status === 'signed' && (
          <div className="ml-auto flex items-center gap-1.5 text-sm text-emerald-700">
            <FileSignature size={14} />
            {order.signedByName ? `Unterschrieben von ${order.signedByName}` : 'Unterschrieben'}
            {order.signedAt && (
              <span className="text-xs text-emerald-600">
                am {new Date(order.signedAt).toLocaleDateString('de-AT')}
              </span>
            )}
          </div>
        )}
        {/* PDF download available once the rep-order has any positions
            to print. Lazy-loads the @react-pdf chunk on first click. */}
        {billing && billing.subtotal > 0 && (
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            data-testid="download-repair-order-pdf"
          >
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            PDF herunterladen
          </button>
        )}
      </div>

      {showMaterialPicker && (
        <MaterialPicker
          onClose={() => setShowMaterialPicker(false)}
          onSelect={async (input) => {
            const created = await addMaterial(order.id, input);
            setMaterials((prev) => [...prev, created]);
            onChanged?.();
          }}
        />
      )}

      {showSignature && (
        <SignatureCapture
          suggestedName={ticket.customerName}
          onConfirm={handleSignConfirm}
          onClose={() => setShowSignature(false)}
        />
      )}
    </div>
  );
}
