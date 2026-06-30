import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { fmt } from '../../../lib/format';
import type { Item } from '../../../lib/pricing';
import type { CartItem } from '../../../lib/totals';
import { buildCopierOffer, type SaleMode } from '../../../lib/copierOffer';

// Card for a Sharp/MFP copier device (t='copier'). Unlike ItemCard it has no
// tiers; instead a Kauf/Leasing toggle, an optional trade-in, and (under
// Leasing) the Mietsonderzahlung + manual rate override. The Kauf net and the
// Grenke leasing rate shown are computed by the same engine the offer uses, so
// the card and the final offer always agree for this device.

interface Handlers {
  onAddCopier: (id: string) => void;
  onRemove: (id: string) => void;
  onQty: (id: string, delta: number) => void;
  onCopierField: (id: string, patch: Partial<CartItem>) => void;
}

interface Props extends Partial<Handlers> {
  item: Item;
  cartItem?: CartItem;
}

export default function CopierItemCard({ item, cartItem, onAddCopier, onRemove, onQty, onCopierField }: Props) {
  const inCart = !!cartItem;
  const [tradeInOpen, setTradeInOpen] = useState(!!cartItem?.tradeIn);

  const saleMode: SaleMode = cartItem?.saleMode === 'leasing' ? 'leasing' : 'kauf';
  const qty = cartItem?.qty ?? 0;

  // Device-only computation (no accessories) for display on the card.
  const probe: CartItem = cartItem ?? { qty: 1, saleMode: 'kauf' };
  const single = buildCopierOffer({ [item.id]: probe }, { [item.id]: item });

  const patch = (p: Partial<CartItem>) => onCopierField?.(item.id, p);

  return (
    <div
      className={`rounded-xl border-2 transition-all ${inCart ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
      style={{ padding: '12px 14px' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.code && (
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded" style={{ fontSize: 11 }}>{item.code}</span>
            )}
            <span className="font-semibold text-slate-800" style={{ fontSize: 13 }}>{item.name}</span>
          </div>
          {item.info && <p className="text-red-600 font-medium" style={{ fontSize: 11, marginTop: 2 }}>{item.info}</p>}
        </div>
        {!inCart ? (
          <button
            onClick={() => onAddCopier?.(item.id)}
            className="flex-shrink-0 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 active:scale-95 transition-transform"
            style={{ width: 40, height: 40 }}
            aria-label="Hinzufügen"
          >
            <Plus size={18} />
          </button>
        ) : (
          <button
            onClick={() => onRemove?.(item.id)}
            className="flex-shrink-0 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-95 transition-transform"
            style={{ width: 32, height: 32 }}
            aria-label="Entfernen"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {!inCart && (
        <div className="text-right mt-1 text-slate-500" style={{ fontSize: 12 }}>
          Kauf € {fmt(item.vk ?? 0)} · Leasing € {fmt(single.leasing.rate)}/Mo
        </div>
      )}

      {inCart && (
        <div className="mt-2 pt-2 border-t border-red-200">
          {/* Kauf / Leasing toggle */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => patch({ saleMode: 'kauf' })}
              className={`rounded-full border transition-colors ${saleMode === 'kauf' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              Kauf € {fmt(single.net)}
            </button>
            <button
              onClick={() => patch({ saleMode: 'leasing' })}
              className={`rounded-full border transition-colors ${saleMode === 'leasing' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              Leasing € {fmt(single.leasing.rate)}/Mo
            </button>
          </div>

          {/* Quantity */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => onQty?.(item.id, -1)} className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform" style={{ width: 32, height: 32 }} aria-label="Menge verringern">
                <Minus size={14} />
              </button>
              <span className="font-bold text-slate-800 text-center" style={{ width: 28, fontSize: 14 }}>{qty}</span>
              <button onClick={() => onQty?.(item.id, 1)} className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform" style={{ width: 32, height: 32 }} aria-label="Menge erhöhen">
                <Plus size={14} />
              </button>
            </div>
            <span className="font-bold text-red-700" style={{ fontSize: 14 }}>
              {saleMode === 'leasing' ? `€ ${fmt(single.leasing.rate)}/Mo` : `€ ${fmt(single.net)}`}
            </span>
          </div>

          {/* Trade-in (Eintauschgerät) */}
          <div className="mt-2">
            <label className="flex items-center gap-2 text-slate-600" style={{ fontSize: 11 }}>
              <input
                type="checkbox"
                checked={tradeInOpen}
                onChange={(e) => {
                  setTradeInOpen(e.target.checked);
                  if (!e.target.checked) patch({ tradeIn: undefined });
                }}
              />
              Eintauschgerät (Gutschrift)
            </label>
            {tradeInOpen && (
              <div className="flex gap-1 mt-1">
                <input
                  type="text"
                  placeholder="Gerät (z.B. Sharp MX 2651)"
                  value={cartItem?.tradeIn?.name ?? ''}
                  onChange={(e) => patch({ tradeIn: { name: e.target.value, value: cartItem?.tradeIn?.value ?? 0 } })}
                  className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-500"
                />
                <input
                  type="number"
                  placeholder="€"
                  value={cartItem?.tradeIn?.value ?? ''}
                  onChange={(e) => patch({ tradeIn: { name: cartItem?.tradeIn?.name ?? '', value: Number(e.target.value) || 0 } })}
                  className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-500"
                />
              </div>
            )}
          </div>

          {/* Leasing details (only relevant under Leasing) */}
          {saleMode === 'leasing' && (
            <div className="mt-2 rounded-lg bg-white border border-slate-200 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500" style={{ fontSize: 11 }}>Mietsonderzahlung</span>
                <input
                  type="number"
                  placeholder="0"
                  value={cartItem?.mietsonderzahlung ?? ''}
                  onChange={(e) => patch({ mietsonderzahlung: Number(e.target.value) || 0 })}
                  className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500" style={{ fontSize: 11 }}>Leasingrate überschreiben</span>
                <input
                  type="number"
                  placeholder={fmt(single.leasing.rate)}
                  value={cartItem?.leasingRateOverride ?? ''}
                  onChange={(e) => patch({ leasingRateOverride: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-red-500"
                />
              </div>
              <p className="text-slate-400" style={{ fontSize: 10 }}>
                Restwert € {fmt(single.leasing.restwert)} · Bearbeitungsgebühr € {fmt(single.leasing.bearbeitungsgebuehr)} · GRENKE, 60 Mo.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
