import { useRef, useState } from 'react';
import { Loader2, Pen, Trash2, X } from 'lucide-react';
import SignaturePad, { type SignaturePadHandle } from '../SignaturePad';
import { fmt } from '../../../../lib/format';
import type { OfferTotals } from '../../../../lib/totals';
import type { TierKey } from '../../../../data/tiers';

const TIER_LABEL_MAP: Record<TierKey, string> = {
  '12mo': '12 Monate',
  '6mo': '6 Monate',
  '2mo': '2 Monate',
  event: '1-3 Tage',
};

export interface SignSignatures {
  offer: string;
  sepa?: string;
}

interface Customer {
  name?: string;
  company?: string;
}

interface SignModalProps {
  customer: Customer;
  totals: OfferTotals;
  finanzOpen: boolean;
  globalTier: TierKey;
  onConfirm: (signatures: SignSignatures) => Promise<void> | void;
  onClose: () => void;
}

export default function SignModal({ customer, totals, finanzOpen, globalTier, onConfirm, onClose }: SignModalProps) {
  const offerPadRef = useRef<SignaturePadHandle>(null);
  const sepaPadRef = useRef<SignaturePadHandle>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showSepa = finanzOpen && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0);

  async function handleConfirm() {
    if (offerPadRef.current?.isEmpty()) { setError('Bitte Auftragsbestätigung unterschreiben.'); return; }
    if (showSepa && sepaPadRef.current?.isEmpty()) { setError('Bitte SEPA-Mandat unterschreiben.'); return; }
    setError(null);
    setSigning(true);
    try {
      const signatures: SignSignatures = { offer: offerPadRef.current!.toDataURL() };
      if (showSepa) signatures.sepa = sepaPadRef.current!.toDataURL();
      await onConfirm(signatures);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSigning(false);
    }
  }

  function handleClear() {
    offerPadRef.current?.clear();
    sepaPadRef.current?.clear();
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ overflowY: 'auto' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="font-bold" style={{ fontSize: 18 }}>Vertrag unterschreiben</div>
          <div className="text-slate-400" style={{ fontSize: 12 }}>KITZ Computer + Office GmbH</div>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20"><X size={20} /></button>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-6 space-y-6 max-w-lg mx-auto w-full">
        {/* Offer summary */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="font-bold text-slate-800 mb-1" style={{ fontSize: 15 }}>{customer.company || customer.name || 'Kunde'}</div>
          {customer.company && customer.name && <div className="text-slate-500 text-sm">{customer.name}</div>}
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-200">
            {totals.monthly > 0 && (
              <div>
                <div className="text-slate-400" style={{ fontSize: 11 }}>Monatlich</div>
                <div className="font-bold text-slate-800">€ {fmt(totals.monthly * 1.2)} brutto</div>
              </div>
            )}
            {totals.once > 0 && (
              <div>
                <div className="text-slate-400" style={{ fontSize: 11 }}>Einmalig</div>
                <div className="font-bold text-slate-800">€ {fmt(totals.once * 1.2)} brutto</div>
              </div>
            )}
            <div>
              <div className="text-slate-400" style={{ fontSize: 11 }}>Laufzeit</div>
              <div className="font-bold text-slate-800">{TIER_LABEL_MAP[globalTier] || globalTier}</div>
            </div>
          </div>
        </div>

        {/* Signature 1: Auftragsbestätigung */}
        <div>
          <div className="font-bold text-slate-700 mb-2" style={{ fontSize: 14 }}>Auftragsbestätigung</div>
          <div className="text-slate-500 mb-3" style={{ fontSize: 12 }}>
            Mit meiner Unterschrift bestätige ich die Annahme dieses Angebots.
          </div>
          <SignaturePad ref={offerPadRef} width={Math.min(400, window.innerWidth - 40)} height={150} />
        </div>

        {/* Signature 2: SEPA (conditional) */}
        {showSepa && (
          <div>
            <div className="font-bold text-slate-700 mb-2" style={{ fontSize: 14 }}>SEPA Lastschrift-Mandat</div>
            <div className="text-slate-500 mb-3" style={{ fontSize: 12 }}>
              Ich ermächtige die Kitz Computer + Office GmbH, Zahlungen mittels SEPA-Lastschrift einzuziehen.
            </div>
            <SignaturePad ref={sepaPadRef} width={Math.min(400, window.innerWidth - 40)} height={150} />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{error}</div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="border-t border-slate-200 px-5 py-4 flex gap-3 flex-shrink-0" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={handleClear} disabled={signing}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 transition-all disabled:opacity-50"
          style={{ fontSize: 14 }}>
          <Trash2 size={16} /> Löschen
        </button>
        <button onClick={handleConfirm} disabled={signing}
          className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold py-3.5 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200 disabled:opacity-70"
          style={{ fontSize: 14 }}>
          {signing ? <Loader2 size={18} className="animate-spin" /> : <Pen size={18} />}
          {signing ? 'Wird verarbeitet...' : 'Unterschreiben & Abschließen'}
        </button>
      </div>
    </div>
  );
}
