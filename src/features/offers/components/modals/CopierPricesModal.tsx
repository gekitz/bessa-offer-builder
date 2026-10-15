import { useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { Item } from '../../../../lib/pricing';
import type { CartItem } from '../../../../lib/totals';

// Editable per-device copier prices: the one-time Lieferung/Installation/
// Einschulung fee and the three All-in per-page maintenance rates (s/w, Farbe,
// Scan). Everything defaults to the catalog device; an override is stored only
// when the rep changes a value, so future price-list updates still propagate to
// untouched fields. Reads/writes CartItem override fields consumed by
// copierOffer.ts (install line + maintenance block → UI summary + PDF).

interface Props {
  item: Item;
  cartItem: CartItem;
  onSave: (patch: Partial<CartItem>) => void;
  onClose: () => void;
}

// Parse an input value; blank/invalid → undefined (keep the catalog default).
const parseNum = (s: string): number | undefined => {
  const v = Number(s);
  return s.trim() === '' || !Number.isFinite(v) || v < 0 ? undefined : v;
};
// Store the override only when it deviates from the catalog default.
const overrideVs = (v: number | undefined, def: number): number | undefined =>
  v == null || Math.abs(v - def) < 1e-9 ? undefined : v;

export default function CopierPricesModal({ item, cartItem, onSave, onClose }: Props) {
  const defInstall = item.install ?? 0;
  const defBw = item.pageBw ?? 0;
  const defColor = item.pageColor ?? 0;
  const defScan = item.pageScan ?? 0;

  const [install, setInstall] = useState(String(cartItem.installOverride ?? defInstall));
  const [bw, setBw] = useState(String(cartItem.pageBwOverride ?? defBw));
  const [color, setColor] = useState(String(cartItem.pageColorOverride ?? defColor));
  const [scan, setScan] = useState(String(cartItem.pageScanOverride ?? defScan));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      installOverride: overrideVs(parseNum(install), defInstall),
      pageBwOverride: overrideVs(parseNum(bw), defBw),
      pageColorOverride: overrideVs(parseNum(color), defColor),
      pageScanOverride: overrideVs(parseNum(scan), defScan),
    });
  }

  const field = 'w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500';
  const row = 'flex items-center justify-between gap-3';
  const label = 'text-sm text-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold truncate mr-2" style={{ fontSize: 16 }}>Lieferung &amp; Kopienpreise</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20 flex-shrink-0" aria-label="Schließen"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className={row}>
            <span className={label}>Lieferung, Installation &amp; Einschulung (€)</span>
            <input type="number" step="0.01" min="0" value={install} onChange={(e) => setInstall(e.target.value)} className={field} aria-label="Lieferung, Installation und Einschulung" />
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500 mb-2">All-in Kopienpreiswartung (netto, pro Seite)</p>
            <div className="space-y-3">
              <div className={row}>
                <span className={label}>Preis pro Kopie s/w (€)</span>
                <input type="number" step="0.0001" min="0" value={bw} onChange={(e) => setBw(e.target.value)} className={field} aria-label="Preis pro Kopie s/w" />
              </div>
              <div className={row}>
                <span className={label}>Preis pro Kopie Farbe (€)</span>
                <input type="number" step="0.0001" min="0" value={color} onChange={(e) => setColor(e.target.value)} className={field} aria-label="Preis pro Kopie Farbe" />
              </div>
              <div className={row}>
                <span className={label}>Preis pro Scan (€)</span>
                <input type="number" step="0.0001" min="0" value={scan} onChange={(e) => setScan(e.target.value)} className={field} aria-label="Preis pro Scan" />
              </div>
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
