import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';

interface CustomItemModalProps {
  onConfirm: (item: { name: string; price: number }) => void;
  onClose: () => void;
}

export default function CustomItemModal({ onConfirm, onClose }: CustomItemModalProps) {
  const [name, setName] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const p = parseFloat(itemPrice);
    if (!name.trim() || isNaN(p) || p < 0) return;
    onConfirm({ name: name.trim(), price: p });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold" style={{ fontSize: 16 }}>Freie Position</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bezeichnung</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Spezialgehäuse"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preis netto</label>
            <input type="number" step="0.01" min="0" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder="0,00"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          </div>
          <button type="submit" disabled={!name.trim() || !itemPrice || isNaN(parseFloat(itemPrice))}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white font-semibold py-3 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontSize: 14 }}>
            <Plus size={18} /> Hinzufügen
          </button>
        </form>
      </div>
    </div>
  );
}
