import { useState } from 'react';
import { ArrowLeft, Calculator, Clock, Printer, ShoppingBag, X } from 'lucide-react';

// Shown when the rep starts a new offer: pick the product family up front via
// tiles. The choice sets the offer type, which drives the builder tabs and the
// PDF/summary layout. Picking PoS opens a second step — Kauf (the normal cart
// flow) vs Leihstellung (the rental calculator, offer type 'rental').

type OfferType = 'pos' | 'sharp' | 'brother' | 'rental';

interface Props {
  onSelect: (type: OfferType) => void;
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
      <span className="text-slate-500 text-center" style={{ fontSize: 12 }}>{subtitle}</span>
    </button>
  );
}

export default function NewOfferTypeModal({ onSelect, onClose }: Props) {
  const [step, setStep] = useState<'type' | 'pos-mode'>('type');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {step === 'pos-mode' && (
              <button onClick={() => setStep('type')} className="rounded-full bg-slate-100 p-1.5 hover:bg-slate-200" aria-label="Zurück"><ArrowLeft size={16} /></button>
            )}
            <span className="font-bold text-slate-800" style={{ fontSize: 16 }}>Neues Angebot</span>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-1.5 hover:bg-slate-200" aria-label="Schließen"><X size={18} /></button>
        </div>
        <div className="p-5">
          {step === 'type' ? (
            <>
              <p className="text-slate-500 mb-4" style={{ fontSize: 13 }}>Welche Art von Angebot möchtest du erstellen?</p>
              <div className="grid grid-cols-3 gap-3">
                <Tile icon={<Calculator size={26} />} title="PoS" subtitle="Kasse" onClick={() => setStep('pos-mode')} />
                <Tile icon={<Printer size={26} />} title="Sharp MFP" subtitle="Kopiersystem" onClick={() => onSelect('sharp')} />
                <Tile icon={<Printer size={26} />} title="Brother" subtitle="Drucker" onClick={() => onSelect('brother')} />
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-500 mb-4" style={{ fontSize: 13 }}>Kauf oder Leihstellung?</p>
              <div className="grid grid-cols-2 gap-3">
                <Tile icon={<ShoppingBag size={26} />} title="Kauf" subtitle="Verkauf / Miete der Kassenlösung" onClick={() => onSelect('pos')} />
                <Tile icon={<Clock size={26} />} title="Leihstellung" subtitle="Zeitlich befristete Vermietung" onClick={() => onSelect('rental')} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
