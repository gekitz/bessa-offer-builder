import { useEffect, useState } from 'react';
import { Loader2, Printer, X } from 'lucide-react';
import { generateQrDataUrl } from '../../../lib/qr';

interface OfficeQrModalProps {
  // The deep-link URL the QR should encode. Typically something like
  // https://bessa.kitz.co.at/#/leaves so a phone scan lands directly
  // on the Urlaubsplaner.
  url: string;
  onClose: () => void;
  // Optional override for tests so we don't need to mock the qrcode
  // library in basic interaction tests.
  initialQrDataUrl?: string;
}

// Approver-only modal that renders a printable card: KITZ logo,
// short German caption, large QR, and the URL spelled out below it
// for anyone who can't scan. The .qr-print-area class is the only
// thing visible in print thanks to the embedded @media print rules.
export default function OfficeQrModal({ url, onClose, initialQrDataUrl }: OfficeQrModalProps) {
  const [qr, setQr] = useState<string | null>(initialQrDataUrl ?? null);
  const [loading, setLoading] = useState(!initialQrDataUrl);

  useEffect(() => {
    if (initialQrDataUrl) return;
    let cancelled = false;
    setLoading(true);
    generateQrDataUrl(url, { width: 480, errorCorrectionLevel: 'M' })
      .then((dataUrl) => {
        if (cancelled) return;
        setQr(dataUrl);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url, initialQrDataUrl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Print-only stylesheet: hide everything except the .qr-print-area
          and stretch it to fill the printed page. We scope this to
          the modal so we don't fight the offer-builder's existing
          .no-print rules. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .qr-print-area, .qr-print-area * { visibility: visible !important; }
          .qr-print-area {
            position: absolute !important;
            inset: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 32px !important;
          }
          .qr-print-hide { display: none !important; }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 qr-print-hide" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between qr-print-hide">
            <span className="font-bold" style={{ fontSize: 16 }}>Office-QR drucken</span>
            <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="Dialog schließen">
              <X size={18} />
            </button>
          </div>

          <div className="qr-print-area p-6 flex flex-col items-center text-center">
            <div
              className="inline-block bg-red-600 text-white font-bold rounded-md mb-3"
              style={{ padding: '6px 14px', fontSize: 14, letterSpacing: '0.5px' }}
            >
              KITZ
            </div>
            <div className="font-bold text-slate-800 mb-1" style={{ fontSize: 18 }}>
              Urlaub einreichen
            </div>
            <div className="text-slate-500 mb-4" style={{ fontSize: 12 }}>
              Scanne den Code, um einen Antrag zu stellen oder den Stand zu sehen.
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200 mb-3" data-testid="office-qr-image-frame">
              {loading && (
                <div className="flex items-center justify-center text-slate-400" style={{ width: 240, height: 240 }}>
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )}
              {!loading && qr && (
                <img
                  src={qr}
                  alt={`QR-Code zu ${url}`}
                  data-testid="office-qr-image"
                  style={{ width: 240, height: 240, display: 'block' }}
                />
              )}
              {!loading && !qr && (
                <div className="text-red-600 px-4" style={{ width: 240, fontSize: 12 }}>
                  QR konnte nicht erzeugt werden.
                </div>
              )}
            </div>

            <code
              className="font-mono text-slate-600 break-all px-2"
              data-testid="office-qr-url"
              style={{ fontSize: 11 }}
            >
              {url}
            </code>
          </div>

          <div className="border-t border-slate-200 p-4 flex gap-2 qr-print-hide">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3 hover:bg-slate-200 transition-colors"
              style={{ fontSize: 14 }}
            >
              Schließen
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white font-semibold py-3 hover:bg-red-700 disabled:opacity-50 transition-colors"
              style={{ fontSize: 14 }}
            >
              <Printer size={16} />
              Drucken
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
