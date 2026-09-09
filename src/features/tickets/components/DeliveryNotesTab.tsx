import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  FileSignature,
  Loader2,
  Plus,
  Sparkles,
  Truck,
} from 'lucide-react';
import { addDeliveryItems, createDeliveryNote, listDeliveryNotes } from '../api/deliveryNoteApi';
import { buildDeliveryItemsFromOffer } from '../lib/deliveryNoteSeed';
import { getOffer } from '../../../lib/offerApi';
import { hydrateCatalog } from '../../offers/data/catalogLoader';
import { ALL } from '../../offers/data/catalogs';
import type { DeliveryNote, Ticket } from '../types';
import DeliveryNoteDetail from './DeliveryNoteDetail';

interface DeliveryNotesTabProps {
  ticket: Ticket;
  currentEmployeeId?: string | null;
  onChange?: () => void;
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

export default function DeliveryNotesTab({
  ticket,
  currentEmployeeId = null,
  onChange,
}: DeliveryNotesTabProps) {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotes(await listDeliveryNotes(ticket.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const created = await createDeliveryNote({ ticketId: ticket.id, createdBy: currentEmployeeId ?? null });
      setNotes((prev) => [...prev, created]);
      setActiveId(created.id);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  // Seed a fresh Lieferschein from the linked offer's cart (goods only —
  // Arbeitszeit is excluded, see deliveryNoteSeed). Fully editable afterwards.
  async function handleSeedFromOffer() {
    if (!ticket.offerId) return;
    setSeeding(true);
    setError(null);
    try {
      const [offer] = await Promise.all([getOffer(ticket.offerId), hydrateCatalog()]);
      const offerData = (offer as { offer_data?: unknown } | null)?.offer_data ?? null;
      const items = buildDeliveryItemsFromOffer(offerData as never, ALL);
      const created = await createDeliveryNote({ ticketId: ticket.id, createdBy: currentEmployeeId ?? null });
      if (items.length > 0) await addDeliveryItems(created.id, items);
      setNotes((prev) => [...prev, created]);
      setActiveId(created.id);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }

  if (activeId) {
    return (
      <DeliveryNoteDetail
        ticket={ticket}
        deliveryNoteId={activeId}
        currentEmployeeId={currentEmployeeId}
        onBack={() => {
          setActiveId(null);
          reload();
        }}
        onChanged={() => onChange?.()}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Truck size={14} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">
            Lieferscheine ({notes.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {ticket.offerId && (
            <button
              type="button"
              onClick={handleSeedFromOffer}
              disabled={seeding || creating}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="seed-delivery-note"
            >
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Aus Angebot übernehmen
            </button>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || seeding}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Neuer Lieferschein
          </button>
        </div>
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
      ) : notes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
          <Truck size={24} className="mx-auto mb-2 text-slate-300" />
          <div className="text-sm text-slate-500 mb-1">Noch keine Lieferscheine.</div>
          <div className="text-xs text-slate-400">
            Gelieferte Ware erfassen (Seriennummern scannen), Kunde unterschreiben lassen.
            {ticket.offerId && ' „Aus Angebot übernehmen" befüllt die Positionen vor.'}
          </div>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="delivery-notes-list">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 flex items-center gap-3 cursor-pointer hover:border-slate-300 transition"
              onClick={() => setActiveId(n.id)}
              data-testid="delivery-note-card"
            >
              <Truck size={16} className="text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 text-sm">
                    Lieferschein #{n.seqNumber}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-xs border ${STATUS_CLS[n.status]}`}>
                    {STATUS_LABEL[n.status]}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>am {new Date(n.performedAt).toLocaleDateString('de-AT')}</span>
                  {n.status === 'signed' && n.signedByName && (
                    <span className="flex items-center gap-1 text-emerald-700">
                      <FileSignature size={10} />
                      {n.signedByName}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-300" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
