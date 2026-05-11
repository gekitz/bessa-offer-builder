import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react';
import SignaturePad, { type SignaturePadHandle } from '../../offers/components/SignaturePad';

interface SignatureCaptureProps {
  // Pre-fill suggestion for the signed-by-name field (e.g. ticket.customerName).
  suggestedName?: string | null;
  onConfirm: (input: { signatureDataUrl: string; signedByName: string }) => Promise<void> | void;
  onClose: () => void;
}

export default function SignatureCapture({
  suggestedName = null,
  onConfirm,
  onClose,
}: SignatureCaptureProps) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(suggestedName ?? '');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClear() {
    padRef.current?.clear();
  }

  async function handleConfirm() {
    if (!name.trim()) {
      setError('Name des Unterzeichners erforderlich.');
      return;
    }
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Bitte unterschreiben.');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await onConfirm({
        signatureDataUrl: padRef.current.toDataURL(),
        signedByName: name.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3"
      onClick={onClose}
      data-testid="signature-capture-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800" style={{ fontSize: 16 }}>
            Kundenunterschrift
          </h3>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="Schließen">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Mit der Unterschrift bestätigt der Kunde die durchgeführte Arbeit, Anfahrt und das verbaute Material.
        </p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-1">
          <SignaturePad ref={padRef} width={500} height={180} />
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 mt-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <RotateCcw size={10} />
          Zurücksetzen
        </button>
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Name des Unterzeichners
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vor- und Nachname"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
            autoComplete="off"
          />
        </div>
        {error && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {confirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}
