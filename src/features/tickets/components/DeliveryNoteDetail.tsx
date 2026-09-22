import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Edit2,
  FileSignature,
  Hash,
  Loader2,
  PenTool,
  Plus,
  Trash2,
  Truck,
} from 'lucide-react';
import { importWithReload } from '../../../lib/lazyWithReload';
import {
  addDeliveryItem,
  getDeliveryNote,
  removeDeliveryItem,
  signDeliveryNote,
  updateDeliveryItem,
  updateDeliveryNote,
} from '../api/deliveryNoteApi';
import { hydrateCatalog } from '../../offers/data/catalogLoader';
import { ALL } from '../../offers/data/catalogs';
import type { DeliveryNote, DeliveryNoteItem, Ticket } from '../types';
import SignatureCapture from './SignatureCapture';
import BarcodeScanButton from './BarcodeScanButton';
import LoanerScanBanner from '../../loaners/components/LoanerScanBanner';

interface DeliveryNoteDetailProps {
  ticket: Ticket;
  deliveryNoteId: string;
  onBack: () => void;
  onChanged?: () => void;
  currentEmployeeId?: string | null;
}

const STATUS_LABEL: Record<DeliveryNote['status'], string> = {
  draft: 'Entwurf',
  signed: 'Unterschrieben',
  cancelled: 'Storniert',
};

const STATUS_CLS: Record<DeliveryNote['status'], string> = {
  draft:     'bg-amber-50 text-amber-700 border-amber-200',
  signed:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

function eur(n: number): string {
  return `€${n.toFixed(2)}`;
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function DeliveryNoteDetail({
  ticket,
  deliveryNoteId,
  onBack,
  onChanged,
  currentEmployeeId = null,
}: DeliveryNoteDetailProps) {
  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [items, setItems] = useState<DeliveryNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Inline meta editing (Lieferdatum + Kopfnotiz)
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftPerformedAt, setDraftPerformedAt] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // Loaner recognition: last scanned serial, checked against the loaner
  // inventory so a scanned Leihgerät surfaces its status + check-out/in inline.
  const [scannedSerial, setScannedSerial] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDeliveryNote(deliveryNoteId);
      if (!res) {
        setError('Lieferschein nicht gefunden');
        return;
      }
      setNote(res.deliveryNote);
      setItems(res.items);
      setDraftPerformedAt(res.deliveryNote.performedAt);
      setDraftNote(res.deliveryNote.note ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [deliveryNoteId]);

  useEffect(() => {
    load();
  }, [load]);

  // Hydrate the catalog so we can tell which product lines are serialised.
  useEffect(() => {
    let cancelled = false;
    hydrateCatalog().finally(() => {
      if (!cancelled) setCatalogReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const locked = note?.status === 'signed' || note?.status === 'cancelled';
  const total = useMemo(() => items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0), [items]);

  // A line takes serial numbers if its product is flagged serialised, or if it
  // already has serials captured (freetext lines can opt in via that path).
  const isSerialized = useCallback(
    (item: DeliveryNoteItem): boolean => {
      if (item.serialNumbers.length > 0) return true;
      if (!item.productId) return false;
      return !!ALL[item.productId]?.isSerialized;
    },
    // ALL mutates in place on hydrate; catalogReady flips when that's done.
    [catalogReady], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function patchItem(id: string, patch: Parameters<typeof updateDeliveryItem>[1]) {
    setError(null);
    try {
      const updated = await updateDeliveryItem(id, patch);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddFreetext() {
    if (!note) return;
    setError(null);
    try {
      const created = await addDeliveryItem(note.id, {
        bezeichnung: '',
        quantity: 1,
        unitPrice: 0,
        isFreetext: true,
        serialNumbers: [],
        sort: items.length,
      });
      setItems((prev) => [...prev, created]);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveItem(id: string) {
    setError(null);
    try {
      await removeDeliveryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSaveMeta() {
    if (!note) return;
    setSavingMeta(true);
    setError(null);
    try {
      const updated = await updateDeliveryNote(note.id, {
        performedAt: draftPerformedAt || note.performedAt,
        note: draftNote.trim() || null,
      });
      setNote(updated);
      setEditingMeta(false);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleDownloadPdf() {
    if (!note) return;
    setDownloading(true);
    setError(null);
    try {
      const { generateDeliveryNotePdfBlob } = await importWithReload(
        () => import('../../../pdf/generateDeliveryNotePdf'),
      );
      const blob = await generateDeliveryNotePdfBlob({
        ticketNumber: ticket.ticketNumber,
        seqNumber: note.seqNumber,
        performedAt: note.performedAt,
        note: note.note,
        customerName: ticket.customerName,
        customerAddress: ticket.customerAddress,
        customerPhone: ticket.customerPhone,
        customerEmail: ticket.customerEmail,
        mesonicCustomerId: ticket.mesonicCustomerId,
        items: items.map((i) => ({
          bezeichnung: i.bezeichnung,
          mesonicArtikelNr: i.mesonicArtikelNr,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          serialNumbers: i.serialNumbers,
        })),
        signedByName: note.signedByName,
        signedAt: note.signedAt,
        signatureData: note.signatureData,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ticket.ticketNumber}-Lieferschein-${note.seqNumber}.pdf`;
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
    if (!note) return;
    const updated = await signDeliveryNote(note.id, input.signatureDataUrl, input.signedByName);
    setNote(updated);
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
  if (error && !note) {
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
  if (!note) return null;

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800">
        <ArrowLeft size={12} />
        Zurück zur Liste
      </button>

      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-slate-500" />
            <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>
              Lieferschein #{note.seqNumber}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_CLS[note.status]}`}>
              {STATUS_LABEL[note.status]}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            geliefert am {new Date(note.performedAt).toLocaleDateString('de-AT')}
          </div>
        </div>

        {editingMeta ? (
          <div className="space-y-2 mt-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Lieferdatum</label>
              <input
                type="date"
                value={draftPerformedAt}
                onChange={(e) => setDraftPerformedAt(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notiz</label>
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftPerformedAt(note.performedAt);
                  setDraftNote(note.note ?? '');
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
            {note.note && <div className="text-sm text-slate-700 whitespace-pre-wrap">{note.note}</div>}
            {!locked && (
              <button
                type="button"
                onClick={() => setEditingMeta(true)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <Edit2 size={10} />
                Lieferdatum / Notiz bearbeiten
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

      {/* Loaner recognition banner (a scanned serial that belongs to the loaner pool) */}
      {scannedSerial && (
        <LoanerScanBanner
          serial={scannedSerial}
          customerName={ticket.customerName}
          customerKdnr={ticket.mesonicCustomerId ? String(ticket.mesonicCustomerId) : null}
          ticketId={ticket.id}
          createdBy={currentEmployeeId}
          onDismiss={() => setScannedSerial(null)}
        />
      )}

      {/* Positions */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Truck size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Gelieferte Positionen</span>
            <span className="text-xs text-slate-400">({items.length})</span>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={handleAddFreetext}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100"
            >
              <Plus size={12} />
              Position
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-3">Noch keine Positionen.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                locked={!!locked}
                serialized={isSerialized(item)}
                onPatch={(patch) => patchItem(item.id, patch)}
                onRemove={() => handleRemoveItem(item.id)}
                onSerialScanned={setScannedSerial}
              />
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2 text-sm">
            <span className="font-semibold text-slate-700">Summe netto</span>
            <span className="font-mono font-semibold text-slate-900">{eur(total)}</span>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {note.status !== 'signed' && note.status !== 'cancelled' && (
          <button
            type="button"
            onClick={() => setShowSignature(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <PenTool size={14} />
            Kunde unterschreiben lassen
          </button>
        )}
        {note.status === 'signed' && (
          <div className="ml-auto flex items-center gap-1.5 text-sm text-emerald-700">
            <FileSignature size={14} />
            {note.signedByName ? `Unterschrieben von ${note.signedByName}` : 'Unterschrieben'}
            {note.signedAt && (
              <span className="text-xs text-emerald-600">
                am {new Date(note.signedAt).toLocaleDateString('de-AT')}
              </span>
            )}
          </div>
        )}
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            data-testid="download-delivery-note-pdf"
          >
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            PDF herunterladen
          </button>
        )}
      </div>

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

// ─────────────────────────────────────────────────────────────────────
// One editable position. Text/number fields persist on blur; serial fields
// persist immediately on scan and on blur when typed.
// ─────────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: DeliveryNoteItem;
  locked: boolean;
  serialized: boolean;
  onPatch: (patch: { bezeichnung?: string; quantity?: number; unitPrice?: number; serialNumbers?: string[] }) => void;
  onRemove: () => void;
  // Fired with the raw value each time a serial is entered — scanned or typed —
  // so loaner recognition behaves the same either way.
  onSerialScanned?: (serial: string) => void;
}

function ItemRow({ item, locked, serialized, onPatch, onRemove, onSerialScanned }: ItemRowProps) {
  const [bezeichnung, setBezeichnung] = useState(item.bezeichnung);
  const [qty, setQty] = useState(String(item.quantity));
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice));

  // Serial capture is shown automatically for serialised products (or lines
  // that already carry serials), and can be revealed on demand for any other
  // line — the technician can always capture a serial the device happens to have.
  const [showSerials, setShowSerials] = useState(serialized || item.serialNumbers.length > 0);

  useEffect(() => setBezeichnung(item.bezeichnung), [item.bezeichnung]);
  useEffect(() => setQty(String(item.quantity)), [item.quantity]);
  useEffect(() => setUnitPrice(String(item.unitPrice)), [item.unitPrice]);
  // The catalog hydrates async — open the serial section once the flag resolves.
  useEffect(() => {
    if (serialized) setShowSerials(true);
  }, [serialized]);

  // One serial slot per delivered unit (at least one when revealed, and never
  // fewer than what's already captured).
  const slotCount = showSerials ? Math.max(Math.round(item.quantity) || 0, item.serialNumbers.length, 1) : 0;

  function setSerialAt(idx: number, value: string) {
    const next = [...item.serialNumbers];
    while (next.length <= idx) next.push('');
    next[idx] = value;
    onPatch({ serialNumbers: next });
  }

  const lineTotal = item.quantity * item.unitPrice;

  return (
    <li className="rounded-lg border border-slate-200 px-3 py-2.5" data-testid="delivery-item-row">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={bezeichnung}
          disabled={locked}
          placeholder="Bezeichnung"
          onChange={(e) => setBezeichnung(e.target.value)}
          onBlur={() => bezeichnung !== item.bezeichnung && onPatch({ bezeichnung })}
          className="flex-1 min-w-0 px-2 py-1.5 rounded border border-slate-200 text-sm disabled:bg-slate-50 disabled:text-slate-500"
        />
        {!item.isFreetext && item.mesonicArtikelNr && (
          <span className="text-xs text-slate-400 hidden sm:inline">Nr. {item.mesonicArtikelNr}</span>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={qty}
          disabled={locked}
          aria-label="Menge"
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const n = parseNum(qty);
            if (n > 0 && n !== item.quantity) onPatch({ quantity: n });
            else setQty(String(item.quantity));
          }}
          className="w-14 px-2 py-1.5 rounded border border-slate-200 text-sm text-right disabled:bg-slate-50 disabled:text-slate-500"
        />
        <span className="text-slate-400 text-xs">×</span>
        <input
          type="text"
          inputMode="decimal"
          value={unitPrice}
          disabled={locked}
          aria-label="Einzelpreis netto"
          onChange={(e) => setUnitPrice(e.target.value)}
          onBlur={() => {
            const n = parseNum(unitPrice);
            if (n >= 0 && n !== item.unitPrice) onPatch({ unitPrice: n });
            else setUnitPrice(String(item.unitPrice));
          }}
          className="w-20 px-2 py-1.5 rounded border border-slate-200 text-sm text-right disabled:bg-slate-50 disabled:text-slate-500"
        />
        <span className="text-slate-300 text-xs hidden sm:inline">=</span>
        <span className="w-20 text-right font-mono text-sm text-slate-800 hidden sm:inline">{eur(lineTotal)}</span>
        {!locked && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
            aria-label="Position entfernen"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Reveal serial capture on demand for lines that aren't auto-serialised. */}
      {!locked && slotCount === 0 && (
        <button
          type="button"
          onClick={() => setShowSerials(true)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <Hash size={11} />
          Seriennummer erfassen
        </button>
      )}

      {/* Per-unit serial numbers (auto for serialised products, or revealed). */}
      {slotCount > 0 && (
        <div className="mt-2 pl-1 space-y-1.5">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Hash size={11} />
            Seriennummern
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {Array.from({ length: slotCount }).map((_, idx) => (
              // Key includes the persisted serial so a scan/blur remounts the
              // uncontrolled input with the new value.
              <div key={`${idx}:${item.serialNumbers[idx] ?? ''}`} className="flex items-center gap-1">
                <span className="text-xs text-slate-400 w-5 text-right">{idx + 1}.</span>
                <input
                  type="text"
                  defaultValue={item.serialNumbers[idx] ?? ''}
                  disabled={locked}
                  placeholder="Seriennummer"
                  onBlur={(e) => {
                    const v = e.target.value;
                    if ((v ?? '') !== (item.serialNumbers[idx] ?? '')) {
                      setSerialAt(idx, v);
                    }
                    // Same loaner recognition as scanning — a typed serial that
                    // belongs to the loaner pool surfaces the banner too.
                    if (v.trim()) onSerialScanned?.(v);
                  }}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded border border-slate-200 text-sm font-mono disabled:bg-slate-50 disabled:text-slate-500"
                />
                {!locked && (
                  <BarcodeScanButton
                    onScan={(v) => {
                      setSerialAt(idx, v);
                      onSerialScanned?.(v);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
