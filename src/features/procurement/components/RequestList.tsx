import { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import type { OrderRequest, OrderRequestStatus } from '../types';

const STATUS_LABEL: Record<OrderRequestStatus, string> = {
  open: 'Offen',
  ordered: 'Bestellt',
  received: 'Erhalten',
  cancelled: 'Storniert',
};

const STATUS_CLASS: Record<OrderRequestStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  ordered: 'bg-blue-50 text-blue-700 border-blue-200',
  received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function StatusBadge({ status }: { status: OrderRequestStatus }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// Flache Liste aller Anfragen (mit Status). Offene Anfragen lassen sich
// stornieren; der Rest ist read-only.
export default function RequestList({
  requests,
  cancellingId,
  onCancel,
  highlightId = null,
}: {
  requests: OrderRequest[];
  cancellingId: string | null;
  onCancel: (id: string) => void;
  highlightId?: string | null; // Deep-link aus dem Dashboard: hervorheben + hinscrollen
}) {
  const highlightRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [highlightId, requests]);

  if (requests.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        Noch keine Bestellanfragen.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {requests.map((r) => (
        <li
          key={r.id}
          ref={r.id === highlightId ? highlightRef : undefined}
          data-testid="request-row"
          className={`rounded-lg border bg-white px-3 py-2 flex items-center gap-2.5 text-sm ${
            r.id === highlightId ? 'border-sky-300 ring-2 ring-inset ring-sky-200' : 'border-slate-200'
          }`}
        >
          <span className="font-semibold text-slate-800 w-8 text-right flex-shrink-0">{r.qty}×</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-800 truncate">
              {r.productCode && <span className="font-mono text-xs text-slate-400 mr-1.5">{r.productCode}</span>}
              {r.productName}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {[r._supplierName, r._requesterName, r.customerName ? `für ${r.customerName}` : null, r.note]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <StatusBadge status={r.status} />
          {r.status === 'open' && (
            <button
              type="button"
              onClick={() => onCancel(r.id)}
              disabled={cancellingId === r.id}
              className="text-slate-300 hover:text-red-500 flex-shrink-0 disabled:opacity-50"
              aria-label="Anfrage stornieren"
              title="Stornieren"
            >
              {cancellingId === r.id ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
