import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import {
  getPublicSignedRepairOrder,
  type PublicSignedRepairOrder,
} from '../api/publicTicketApi';

interface Props {
  shareCode: string;
  repairOrderId: string;
  onClose: () => void;
}

const eur = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-AT');
}

export default function PublicSignedRepairOrderModal({ shareCode, repairOrderId, onClose }: Props) {
  const [doc, setDoc] = useState<PublicSignedRepairOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPublicSignedRepairOrder(shareCode, repairOrderId)
      .then((d) => {
        if (cancelled) return;
        if (!d) setError('Beleg nicht gefunden.');
        else setDoc(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareCode, repairOrderId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-bold text-slate-800" style={{ fontSize: 16 }}>
            Unterschriebener Reparaturschein
          </h3>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="Schließen">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={22} className="animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={14} />
              {error}
            </div>
          ) : doc ? (
            <div className="space-y-4">
              <div className="text-xs text-slate-500">
                <div>
                  <span className="font-medium text-slate-700">Reparaturschein #{doc.seqNumber}</span>
                  {' · '}Auftrag {doc.ticketNumber}
                </div>
                <div>durchgeführt am {fmtDate(doc.performedAt)}</div>
              </div>

              {doc.workDescription && (
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Durchgeführte Arbeit</div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{doc.workDescription}</div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {doc.positions.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-700">
                          {p.label}
                          {p.quantity !== 1 && (
                            <span className="text-slate-400">
                              {' '}· {p.quantity} {p.unit}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700 tabular-nums whitespace-nowrap">
                          {eur.format(p.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 text-sm">
                    <tr>
                      <td className="px-3 py-1.5 text-slate-500">Summe netto</td>
                      <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{eur.format(doc.subtotalNet)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-slate-500">zzgl. {doc.vatPercent}% USt.</td>
                      <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{eur.format(doc.vatAmount)}</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="px-3 py-2 font-semibold text-slate-800">Gesamt brutto</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{eur.format(doc.grossTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Unterschrift</div>
                {doc.signatureData ? (
                  <img
                    src={doc.signatureData}
                    alt="Unterschrift"
                    className="max-w-full h-24 object-contain border border-slate-200 rounded-lg bg-white"
                  />
                ) : (
                  <div className="text-sm text-slate-400">—</div>
                )}
                <div className="text-xs text-slate-500 mt-1">
                  {doc.signedByName}
                  {doc.signedAt && <> · {fmtDate(doc.signedAt)}</>}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
