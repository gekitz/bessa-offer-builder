import { Loader2, PackageCheck, Truck } from 'lucide-react';
import type { PurchaseOrder } from '../types';

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

// Ausgelöste Sammelbestellungen. Offene (ordered) lassen sich als
// erhalten markieren (Wareneingang → zieht die enthaltenen Anfragen mit).
export default function PurchaseOrderList({
  orders,
  receivingId,
  onReceive,
}: {
  orders: PurchaseOrder[];
  receivingId: string | null;
  onReceive: (id: string) => void;
}) {
  if (orders.length === 0) {
    return <div className="text-center py-8 text-slate-400 text-sm">Noch keine Bestellungen ausgelöst.</div>;
  }

  return (
    <ul className="space-y-2">
      {orders.map((po) => {
        const items = po._requests ?? [];
        const totalQty = items.reduce((n, r) => n + r.qty, 0);
        const isReceived = po.status === 'received';
        return (
          <li
            key={po.id}
            data-testid="po-row"
            className="rounded-xl border border-slate-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {isReceived ? (
                  <PackageCheck size={16} className="text-emerald-600 flex-shrink-0" />
                ) : (
                  <Truck size={16} className="text-blue-600 flex-shrink-0" />
                )}
                <span className="font-semibold text-slate-700 truncate" style={{ fontSize: 14 }}>
                  {po._supplierName ?? 'Lieferant'}
                </span>
                <span className="text-[11px] text-slate-400 flex-shrink-0">
                  {totalQty} Stück · bestellt {fmtDate(po.orderedAt)}
                  {isReceived ? ` · erhalten ${fmtDate(po.receivedAt)}` : ''}
                </span>
              </div>
              {po.status === 'ordered' && (
                <button
                  type="button"
                  onClick={() => onReceive(po.id)}
                  disabled={receivingId === po.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 flex-shrink-0"
                >
                  {receivingId === po.id ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />}
                  Erhalten
                </button>
              )}
            </div>
            {items.length > 0 && (
              <ul className="mt-2 pl-6 space-y-0.5">
                {items.map((r) => (
                  <li key={r.id} className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="font-medium text-slate-600">{r.qty}×</span>
                    {r.productCode && <span className="font-mono text-slate-400">{r.productCode}</span>}
                    <span className="truncate">{r.productName}</span>
                    {r.unitPrice != null && (
                      <span className="text-slate-400 ml-auto">
                        € {r.unitPrice.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/Stk
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
