import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Send, ShoppingCart, X } from 'lucide-react';
import Select from '../../../components/Select';
import { KITZ_STANDORTE, type StandortKey } from '../lib/shipping';
import type { OrderStrategy } from '../lib/orderStrategies';
import type { SupplierGroup } from '../lib/aggregate';
import type { RequestableProduct } from '../types';

// Generic confirm dialog for the automated ordering strategies (api/email).
// The strategy supplies the title, note, orderable/blocked split and the
// place() action; this component only handles the Standort choice + review.
export default function SupplierOrderModal({
  strategy,
  supplierName,
  group,
  productsById,
  placing,
  onConfirm,
  onClose,
}: {
  strategy: OrderStrategy;
  supplierName: string;
  group: SupplierGroup;
  productsById: Map<string, RequestableProduct>;
  placing: boolean;
  onConfirm: (standort: StandortKey) => void;
  onClose: () => void;
}) {
  const [standort, setStandort] = useState<StandortKey>('klagenfurt');

  const { orderable, blocked } = useMemo(
    () => strategy.split(group, productsById),
    [strategy, group, productsById],
  );

  const totalQty = orderable.reduce((n, l) => n + l.totalQty, 0);
  const canConfirm = orderable.length > 0 && !placing;
  const cta = strategy.gated ? 'verbindlich bestellen' : 'bestellen';
  const Icon = strategy.method === 'email' ? Send : ShoppingCart;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-bold text-slate-800 flex items-center gap-2" style={{ fontSize: 16 }}>
            <Icon size={17} className="text-red-600" />
            {strategy.confirmTitle}
          </h3>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="Schließen">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="text-sm text-slate-500">Lieferant: <span className="font-medium text-slate-700">{supplierName}</span></div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Lieferadresse</label>
            <Select
              value={standort}
              onChange={(v) => setStandort(v as StandortKey)}
              options={Object.entries(KITZ_STANDORTE).map(([key, s]) => ({
                value: key,
                label: s.label,
                hint: `${s.address.zip} ${s.address.city}`,
              }))}
              ariaLabel="Lieferadresse"
            />
          </div>

          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">
              {orderable.length} Position(en) · {totalQty} Stück
            </div>
            <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {orderable.map((l) => (
                <li key={l.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800 w-8 text-right">{l.totalQty}×</span>
                  {l.productCode && <span className="font-mono text-[11px] text-slate-400">{l.productCode}</span>}
                  <span className="flex-1 truncate text-slate-700">{l.productName}</span>
                </li>
              ))}
              {orderable.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-400">Keine bestellbaren Positionen.</li>
              )}
            </ul>
          </div>

          {blocked.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium mb-0.5">Nicht bestellt ({blocked[0].reason}):</div>
                <div>{blocked.map((b) => b.line.productName).join(', ')}</div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400">{strategy.confirmNote}</p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={placing} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onConfirm(standort)}
            disabled={!canConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40"
          >
            {placing ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
            {totalQty > 0 ? `${totalQty} Stück ${cta}` : 'Bestellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
