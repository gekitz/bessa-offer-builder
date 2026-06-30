import { Calculator, Printer, X } from 'lucide-react';

// Shown when the rep starts a new offer: pick the product family up front via
// two tiles. The choice sets the offer type, which drives the builder tabs and
// the PDF/summary layout. Brother will add a third tile once its data lands.

interface Props {
  onSelect: (type: 'pos' | 'sharp') => void;
  onClose: () => void;
}

interface TileProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}

function Tile({ icon, title, subtitle, onClick }: TileProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-6 hover:border-red-400 hover:bg-red-50 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-red-200"
    >
      <span className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 text-slate-700">
        {icon}
      </span>
      <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>{title}</span>
      <span className="text-slate-500" style={{ fontSize: 12 }}>{subtitle}</span>
    </button>
  );
}

export default function NewOfferTypeModal({ onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="font-bold text-slate-800" style={{ fontSize: 16 }}>Neues Angebot</span>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-1.5 hover:bg-slate-200" aria-label="Schließen"><X size={18} /></button>
        </div>
        <div className="p-5">
          <p className="text-slate-500 mb-4" style={{ fontSize: 13 }}>Welche Art von Angebot möchtest du erstellen?</p>
          <div className="grid grid-cols-2 gap-3">
            <Tile icon={<Calculator size={26} />} title="PoS" subtitle="Kasse" onClick={() => onSelect('pos')} />
            <Tile icon={<Printer size={26} />} title="Sharp MFP" subtitle="Kopiersystem" onClick={() => onSelect('sharp')} />
          </div>
        </div>
      </div>
    </div>
  );
}
