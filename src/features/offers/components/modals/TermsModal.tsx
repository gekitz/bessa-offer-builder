import { useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import {
  lieferungLabel,
  DEFAULT_LIEFERUNG,
  DEFAULT_ZAHLUNGSZIEL,
  STANDARD_LIEFERZEIT,
  STANDARD_ZAHLUNGSZIEL,
} from '../../../../data/autoTermRules';

// Edits the two rep-adjustable Bedingungen lines (Lieferzeit, Zahlungsziel).
// Reached via the pencil on the Bedingungen block, mirroring the copier
// "Lieferung & Kopienpreise" editor so the UX is consistent across offers.
// A blank field falls back to the offer-type default (handled by
// computeAutoTerms), so we show that default as the placeholder rather than
// pre-filling it — this keeps "empty = use default" intact.

interface Props {
  lieferung: string;
  zahlungsziel: string;
  offerType?: string;
  onSave: (terms: { lieferung: string; zahlungsziel: string }) => void;
  onClose: () => void;
}

export default function TermsModal({ lieferung, zahlungsziel, offerType, onSave, onClose }: Props) {
  const isBrother = offerType === 'brother';
  // Normalise a stored legacy enum ('ruecksprache') to its label for editing;
  // leave blank blank so the placeholder shows the default.
  const [lief, setLief] = useState(lieferung ? lieferungLabel(lieferung) : '');
  const [zahl, setZahl] = useState(zahlungsziel);

  const lieferPlaceholder = isBrother ? lieferungLabel(DEFAULT_LIEFERUNG) : STANDARD_LIEFERZEIT;
  const zahlPlaceholder = isBrother ? DEFAULT_ZAHLUNGSZIEL : STANDARD_ZAHLUNGSZIEL;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({ lieferung: lief.trim(), zahlungsziel: zahl.trim() });
  }

  const field = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold truncate mr-2" style={{ fontSize: 16 }}>Lieferung &amp; Zahlung</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20 flex-shrink-0" aria-label="Schließen"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-slate-500 mb-1.5" style={{ fontSize: 12 }} htmlFor="terms-lieferzeit">Lieferzeit</label>
            <input
              id="terms-lieferzeit"
              type="text"
              value={lief}
              onChange={(e) => setLief(e.target.value)}
              placeholder={lieferPlaceholder}
              className={field}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1.5" style={{ fontSize: 12 }} htmlFor="terms-zahlungsziel">Zahlungsziel</label>
            <input
              id="terms-zahlungsziel"
              type="text"
              value={zahl}
              onChange={(e) => setZahl(e.target.value)}
              placeholder={zahlPlaceholder}
              className={field}
            />
          </div>

          <button type="submit" className="w-full flex items-center justify-center gap-2 rounded-xl font-semibold py-3 bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] transition-all" style={{ fontSize: 14 }}>
            <Check size={18} /> Übernehmen
          </button>
        </form>
      </div>
    </div>
  );
}
