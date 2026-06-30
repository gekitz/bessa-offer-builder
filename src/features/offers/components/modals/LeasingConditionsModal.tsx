import { useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import Select from '../../../../components/Select';
import { fmt } from '../../../../lib/format';
import type { Item } from '../../../../lib/pricing';
import type { CartItem } from '../../../../lib/totals';
import { buildCopierOffer, GRENKE } from '../../../../lib/copierOffer';

// Per-offer Grenke leasing conditions. Everything defaults to the GRENKE
// config; the rep overrides only what deviates. The rate is computed from the
// (term-derived) factor unless an absolute rate is entered, which wins. We only
// have validated factors for 36/60 months — for any other deviation the rep
// sets the factor or the absolute rate, both of which are explicit here.

const TERM_OPTIONS = [
  { value: '60', label: '60 Monate' },
  { value: '36', label: '36 Monate' },
];

const factorPctForTerm = (term: number): number =>
  ((GRENKE.factorByTerm as Record<number, number>)[term] ?? GRENKE.factor) * 100;

interface Props {
  item: Item;
  cartItem: CartItem;
  onSave: (patch: Partial<CartItem>) => void;
  onClose: () => void;
}

export default function LeasingConditionsModal({ item, cartItem, onSave, onClose }: Props) {
  const initialTerm = cartItem.leasingTermMonths || GRENKE.termMonths;
  const [term, setTerm] = useState(String(initialTerm));
  const [factorPct, setFactorPct] = useState(
    String(
      cartItem.leasingFactorOverride != null
        ? cartItem.leasingFactorOverride * 100
        : factorPctForTerm(initialTerm),
    ),
  );
  const [restwertPct, setRestwertPct] = useState(String(cartItem.restwertPercentOverride ?? GRENKE.restwertPercent));
  const [bearbeitung, setBearbeitung] = useState(String(cartItem.bearbeitungsgebuehrOverride ?? GRENKE.bearbeitungsgebuehr));
  const [mietsonder, setMietsonder] = useState(cartItem.mietsonderzahlung ? String(cartItem.mietsonderzahlung) : '');
  const [rateOverride, setRateOverride] = useState(cartItem.leasingRateOverride != null ? String(cartItem.leasingRateOverride) : '');

  // Switching the term resets the factor to that term's known default — a term
  // change implies a different factor, so we don't keep a stale one.
  function changeTerm(v: string) {
    setTerm(v);
    setFactorPct(String(factorPctForTerm(Number(v))));
  }

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const factorDec = Number(factorPct) / 100;

  // Live preview via the same engine the offer uses.
  const probe: CartItem = {
    ...cartItem,
    qty: cartItem.qty || 1,
    saleMode: 'leasing',
    leasingTermMonths: Number(term),
    leasingFactorOverride: Number.isFinite(factorDec) ? factorDec : undefined,
    restwertPercentOverride: num(restwertPct),
    bearbeitungsgebuehrOverride: num(bearbeitung),
    mietsonderzahlung: num(mietsonder),
    leasingRateOverride: num(rateOverride),
  };
  const preview = buildCopierOffer({ [item.id]: probe }, { [item.id]: item }).leasing;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const termNum = Number(term);
    const termDefault = factorPctForTerm(termNum) / 100;
    // Store overrides only when they deviate from the default, so future GRENKE
    // config changes still propagate to untouched fields.
    onSave({
      leasingTermMonths: termNum,
      leasingFactorOverride: Math.abs(factorDec - termDefault) < 1e-6 ? undefined : factorDec,
      restwertPercentOverride: Number(restwertPct) === GRENKE.restwertPercent ? undefined : Number(restwertPct),
      bearbeitungsgebuehrOverride: Number(bearbeitung) === GRENKE.bearbeitungsgebuehr ? undefined : Number(bearbeitung),
      mietsonderzahlung: num(mietsonder),
      leasingRateOverride: num(rateOverride),
    });
  }

  const field = 'w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500';
  const row = 'flex items-center justify-between gap-3';
  const label = 'text-sm text-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold truncate mr-2" style={{ fontSize: 16 }}>Leasing-Konditionen</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20 flex-shrink-0" aria-label="Schließen"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className={row}>
            <span className={label}>Laufzeit</span>
            <div className="w-32">
              <Select value={term} onChange={changeTerm} options={TERM_OPTIONS} size="sm" ariaLabel="Laufzeit" />
            </div>
          </div>
          <div className={row}>
            <span className={label}>Leasingfaktor (%)</span>
            <input type="number" step="0.0001" min="0" value={factorPct} onChange={(e) => setFactorPct(e.target.value)} className={field} aria-label="Leasingfaktor" />
          </div>
          <div className={row}>
            <span className={label}>Restwert (%)</span>
            <input type="number" step="0.1" min="0" value={restwertPct} onChange={(e) => setRestwertPct(e.target.value)} className={field} aria-label="Restwert" />
          </div>
          <div className={row}>
            <span className={label}>Bearbeitungsgebühr (€)</span>
            <input type="number" step="0.01" min="0" value={bearbeitung} onChange={(e) => setBearbeitung(e.target.value)} className={field} aria-label="Bearbeitungsgebühr" />
          </div>
          <div className={row}>
            <span className={label}>Mietsonderzahlung (€)</span>
            <input type="number" step="0.01" min="0" placeholder="0" value={mietsonder} onChange={(e) => setMietsonder(e.target.value)} className={field} aria-label="Mietsonderzahlung" />
          </div>
          <div className={`${row} border-t border-slate-100 pt-3`}>
            <span className={label}>Rate überschreiben (€)</span>
            <input type="number" step="0.01" min="0" placeholder={fmt(preview.rate)} value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} className={field} aria-label="Rate überschreiben" />
          </div>

          {/* Live preview */}
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-slate-600">Monatliche Rate</span>
              <span className="text-red-700">€ {fmt(preview.rate)}/Mo{preview.rateOverridden ? ' (manuell)' : ''}</span>
            </div>
            <div className="flex justify-between text-slate-400" style={{ fontSize: 11 }}>
              <span>Restwert € {fmt(preview.restwert)}</span>
              <span>{preview.termMonths} Mo · Faktor {(preview.factor * 100).toLocaleString('de-AT', { maximumFractionDigits: 4 })}%</span>
            </div>
          </div>

          <button type="submit" className="w-full flex items-center justify-center gap-2 rounded-xl font-semibold py-3 bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] transition-all" style={{ fontSize: 14 }}>
            <Check size={18} /> Übernehmen
          </button>
        </form>
      </div>
    </div>
  );
}
