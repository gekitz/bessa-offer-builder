import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import {
  availableTiers,
  bestTier,
  discountedPrice,
  hasDiscount,
  isMonthly,
  price,
  yearlyServicePerUnit,
} from '../../../lib/pricing';
import { TIER_SHORT, TKEY_REV } from '../../../data/tiers';
import { fmt } from '../../../lib/format';

export default function ItemCard({ item, cartItem, globalTier, onAdd, onRemove, onQty, onSetQty, onDiscountQty, onTier, onMode }) {
  const inCart = !!cartItem;
  const tier = cartItem?.tier || bestTier(item, globalTier);
  const mode = cartItem?.mode || 'rent';
  const p = price(item, tier, mode, cartItem?.priceOverride);
  const dp = discountedPrice(item, tier, mode, cartItem?.priceOverride);
  const av = availableTiers(item);
  const monthly = isMonthly(item, mode);
  const hasDiscountOption = hasDiscount(item);
  const fullQty = cartItem?.qty || 0;
  const discQty = cartItem?.discountQty || 0;
  const lineTotal = (p * fullQty) + (dp * discQty);
  const isHourly = item.t === 'h';

  // Editable text for hourly items so fractional hours (3.5) can be typed.
  // Kept local while focused; re-synced from the cart when not editing.
  const [hoursText, setHoursText] = useState(String(fullQty));
  const [editingHours, setEditingHours] = useState(false);
  useEffect(() => {
    if (!editingHours) setHoursText(String(fullQty));
  }, [fullQty, editingHours]);

  if (p === null && !inCart) return null;

  return (
    <div className={`rounded-xl border-2 transition-all ${inCart ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
      style={{ padding: '12px 14px' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.code && <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded" style={{ fontSize: 11 }}>{item.code}</span>}
            <span className="font-semibold text-slate-800" style={{ fontSize: 13 }}>{item.name}</span>
          </div>
          {item.note && <p className="text-slate-400" style={{ fontSize: 11, marginTop: 2 }}>{item.note}</p>}
          {item.info && <p className="text-red-600 font-medium" style={{ fontSize: 11, marginTop: 2 }}>{item.info}</p>}
          {item.description && <p className="text-slate-500" style={{ fontSize: 11, marginTop: 2 }}>{item.description}</p>}
        </div>
        {!inCart ? (
          <button onClick={() => onAdd(item.id, item.t === 'm' ? bestTier(item, globalTier) : undefined, item.t === 'term' ? 'rent' : undefined)}
            className="flex-shrink-0 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 active:scale-95 transition-transform"
            style={{ width: 40, height: 40 }}>
            <Plus size={18} />
          </button>
        ) : (
          <button onClick={() => onRemove(item.id)}
            className="flex-shrink-0 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-95 transition-transform"
            style={{ width: 32, height: 32 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {inCart && (
        <div className="mt-2 pt-2 border-t border-red-200">
          {av.length > 1 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {av.map(ti => (
                <button key={ti} onClick={() => onTier(item.id, ti)}
                  className={`rounded-full border transition-colors ${tier === ti ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
                  style={{ fontSize: 11, padding: '3px 8px' }}>
                  {TIER_SHORT[ti]} €{fmt(item.p[TKEY_REV[ti]])}
                </button>
              ))}
            </div>
          )}
          {item.t === 'term' && (
            <div className="flex gap-1 mb-2">
              <button onClick={() => onMode(item.id, 'rent')}
                className={`rounded-full border transition-colors ${mode === 'rent' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300'}`}
                style={{ fontSize: 11, padding: '3px 8px' }}>
                Miete €{item.rent !== null ? fmt(item.rent) + '/Mo' : 'n.v.'}
              </button>
              {item.buy !== null && (
                <button onClick={() => onMode(item.id, 'buy')}
                  className={`rounded-full border transition-colors ${mode === 'buy' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300'}`}
                  style={{ fontSize: 11, padding: '3px 8px' }}>
                  Kauf €{fmt(item.buy)}
                </button>
              )}
            </div>
          )}

          {/* Regular quantity row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {hasDiscountOption && <span className="text-slate-500 mr-1" style={{ fontSize: 11, minWidth: 70 }}>Voller Preis:</span>}
              <button onClick={() => (isHourly ? onSetQty(item.id, Math.max(0, fullQty - 0.5)) : onQty(item.id, -1))}
                className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
                style={{ width: 32, height: 32 }}>
                <Minus size={14} />
              </button>
              {isHourly ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={hoursText}
                  onFocus={() => setEditingHours(true)}
                  onChange={(e) => {
                    setHoursText(e.target.value);
                    const n = parseFloat(e.target.value.replace(',', '.'));
                    onSetQty(item.id, Number.isFinite(n) && n >= 0 ? n : 0);
                  }}
                  onBlur={() => setEditingHours(false)}
                  className="font-bold text-slate-800 text-center rounded-lg border border-slate-300 focus:border-red-400 focus:outline-none"
                  style={{ width: 52, height: 32, fontSize: 14 }}
                  aria-label="Stunden"
                />
              ) : (
                <span className="font-bold text-slate-800 text-center" style={{ width: 28, fontSize: 14 }}>{fullQty}</span>
              )}
              <button onClick={() => (isHourly ? onSetQty(item.id, fullQty + 0.5) : onQty(item.id, 1))}
                className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
                style={{ width: 32, height: 32 }}>
                <Plus size={14} />
              </button>
              {isHourly && <span className="text-slate-400 ml-1" style={{ fontSize: 11 }}>Stunden</span>}
            </div>
            {!hasDiscountOption && (
              <span className="font-bold text-red-700" style={{ fontSize: 14 }}>
                € {fmt(lineTotal)}{monthly ? '/Mo' : ''}
              </span>
            )}
            {hasDiscountOption && (
              <span className="text-slate-600" style={{ fontSize: 12 }}>
                € {fmt(p)}{monthly ? '/Mo' : ''}
              </span>
            )}
          </div>

          {/* Discounted quantity row */}
          {hasDiscountOption && (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <span className="text-green-600 mr-1" style={{ fontSize: 11, minWidth: 70 }}>{item.discount.label}:</span>
                <button onClick={() => onDiscountQty(item.id, -1)}
                  className="rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 active:scale-95 transition-transform"
                  style={{ width: 32, height: 32 }}>
                  <Minus size={14} />
                </button>
                <span className="font-bold text-green-700 text-center" style={{ width: 28, fontSize: 14 }}>{discQty}</span>
                <button onClick={() => onDiscountQty(item.id, 1)}
                  className="rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 active:scale-95 transition-transform"
                  style={{ width: 32, height: 32 }}>
                  <Plus size={14} />
                </button>
              </div>
              <span className="text-green-600" style={{ fontSize: 12 }}>
                € {fmt(dp)}{monthly ? '/Mo' : ''}
              </span>
            </div>
          )}

          {/* Total for discount items */}
          {hasDiscountOption && (
            <div className="flex justify-end mt-2 pt-2 border-t border-red-200">
              <span className="font-bold text-red-700" style={{ fontSize: 14 }}>
                Gesamt: € {fmt(lineTotal)}{monthly ? '/Mo' : ''}
              </span>
            </div>
          )}

          {/* Melzer Wartung pro Jahr */}
          {item.servicePercent > 0 && (
            <div className="flex justify-end mt-1 text-amber-700" style={{ fontSize: 11 }}>
              + € {fmt(yearlyServicePerUnit(item) * (fullQty + discQty))} Wartung/Jahr
              <span className="text-slate-400 ml-1">({item.servicePercent}%)</span>
            </div>
          )}
        </div>
      )}

      {!inCart && p !== null && (
        <div className="text-right mt-1">
          <span className="text-slate-500" style={{ fontSize: 12 }}>
            € {fmt(p)}{monthly ? '/Mo' : item.t === 'h' ? '/h' : ''}
          </span>
          {item.servicePercent > 0 && (
            <span className="text-amber-700 ml-2" style={{ fontSize: 11 }}>
              + € {fmt(yearlyServicePerUnit(item))}/Jahr Wartung
            </span>
          )}
        </div>
      )}
    </div>
  );
}
