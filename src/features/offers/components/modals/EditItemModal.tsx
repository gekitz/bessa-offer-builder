import { useState, type FormEvent } from 'react';
import { Check, Minus, Plus, Trash2, X } from 'lucide-react';
import { price, hasDiscount, type Item } from '../../../../lib/pricing';
import type { CartItem } from '../../../../lib/totals';
import type { TierKey } from '../../../../data/tiers';
import { isCustomItem } from '../../data/catalogs';
import Select from '../../../../components/Select';

export interface EditItemSave {
  qty: number;
  discountQty: number;
  price?: number;
  description?: string;
  /** Option-group label, '' to remove from any group. */
  optionGroup?: string;
  /** Whether this item is the recommended (counted) member of its group. */
  optionSelected?: boolean;
}

interface EditItemModalProps {
  item: Item;
  cartItem: CartItem;
  globalTier?: TierKey;
  monthly: boolean;
  /** Existing option-group labels in the cart, for the group picker. */
  availableGroups?: string[];
  onSave: (result: EditItemSave) => void;
  onRemove: () => void;
  onClose: () => void;
}

const NEW_GROUP = '__new__';

export default function EditItemModal({ item, cartItem, monthly, availableGroups = [], onSave, onRemove, onClose }: EditItemModalProps) {
  const [qty, setQty] = useState(cartItem.qty || 0);
  const [discountQty, setDiscountQty] = useState(cartItem.discountQty || 0);
  const currentPrice = price(item, cartItem.tier, cartItem.mode);
  const [itemPrice, setItemPrice] = useState(String(currentPrice ?? 0));
  const isCustom = isCustomItem(item.id);
  const [description, setDescription] = useState(item.description ?? '');
  // Option group: the Select holds '' (none), an existing label, or NEW_GROUP.
  const [groupChoice, setGroupChoice] = useState(cartItem.optionGroup || '');
  const [newGroupName, setNewGroupName] = useState('');
  const [optionSelected, setOptionSelected] = useState(cartItem.optionSelected ?? false);
  const resolvedGroup = groupChoice === NEW_GROUP ? newGroupName.trim() : groupChoice;
  const totalQty = qty + discountQty;

  const groupOptions = [
    { value: '', label: 'Keine Wahlgruppe' },
    ...availableGroups.map((g) => ({ value: g, label: g })),
    { value: NEW_GROUP, label: '+ Neue Wahlgruppe…' },
  ];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (totalQty < 1) { onRemove(); return; }
    const result: EditItemSave = { qty, discountQty };
    if (!monthly) {
      const p = parseFloat(itemPrice);
      if (isNaN(p) || p < 0) return;
      result.price = p;
    }
    if (isCustom) {
      result.description = description.trim();
    }
    result.optionGroup = resolvedGroup;
    result.optionSelected = resolvedGroup ? optionSelected : false;
    onSave(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold truncate mr-2" style={{ fontSize: 16 }}>{item.name}</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20 flex-shrink-0"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Menge</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setQty(Math.max(0, qty - 1))} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Minus size={16} /></button>
              <input type="number" min="0" value={qty} onChange={e => setQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 text-center border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
              <button type="button" onClick={() => setQty(qty + 1)} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Plus size={16} /></button>
            </div>
          </div>
          {hasDiscount(item) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rabatt-Menge ({item.discount?.label})</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setDiscountQty(Math.max(0, discountQty - 1))} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Minus size={16} /></button>
                <input type="number" min="0" value={discountQty} onChange={e => setDiscountQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 text-center border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
                <button type="button" onClick={() => setDiscountQty(discountQty + 1)} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Plus size={16} /></button>
              </div>
            </div>
          )}
          {!monthly && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preis netto (€)</label>
              <input type="number" step="0.01" min="0" value={itemPrice} onChange={e => setItemPrice(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
            </div>
          )}
          {isCustom && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Beschreibung <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
                placeholder={'Eine Zeile pro Spezifikation'}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-y" />
              <p className="text-xs text-slate-400 mt-1">Erscheint als Aufzählung unter dem Artikel im PDF.</p>
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Wahlgruppe <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Select
              value={groupChoice}
              onChange={setGroupChoice}
              options={groupOptions}
              ariaLabel="Wahlgruppe"
            />
            {groupChoice === NEW_GROUP && (
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="Name der Gruppe, z.B. PC-Auswahl"
                autoFocus
                className="w-full mt-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
            )}
            {resolvedGroup ? (
              <>
                <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                  <input type="checkbox" checked={optionSelected} onChange={e => setOptionSelected(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                  <span className="text-sm text-slate-700">Empfohlene Option (wird in der Summe gezählt)</span>
                </label>
                <p className="text-xs text-slate-400 mt-1">
                  Artikel derselben Gruppe stehen als Alternative zur Wahl; nur die empfohlene zählt zur Summe, die übrigen werden als Mehr-/Minderpreis angezeigt.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Gruppiere Artikel, zwischen denen der Kunde wählt (z.B. zwei PC-Varianten).
              </p>
            )}
          </div>
          <button type="submit"
            className={`w-full flex items-center justify-center gap-2 rounded-xl font-semibold py-3 active:scale-[0.98] transition-all ${totalQty < 1 ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-600 text-white hover:bg-red-700'}`}
            style={{ fontSize: 14 }}>
            {totalQty < 1 ? <><Trash2 size={18} /> Entfernen</> : <><Check size={18} /> Übernehmen</>}
          </button>
        </form>
      </div>
    </div>
  );
}
