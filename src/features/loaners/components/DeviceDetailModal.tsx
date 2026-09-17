import { useCallback, useEffect, useState } from 'react';
import { X, Pencil, Loader2, ArrowRightLeft, Undo2, Tag } from 'lucide-react';
import { getDevice, checkInDevice } from '../api/loanerApi';
import { computeDeviceMetrics, type LoanSpan } from '../lib/loanMetrics';
import { postLoanCheckInCrmNote } from '../lib/loanCrmNote';
import { downloadBlob } from '../lib/download';
import { importWithReload } from '../../../lib/lazyWithReload';
import { mesonicImport, TYPES, TEMPLATES } from '../../../lib/mesonicApi';
import { STATUS_LABEL, STATUS_PILL, STANDORT_LABEL, formatEuro, formatDateDe, todayIso } from '../lib/loanerFormat';
import { tagLabel } from '../lib/deviceTags';
import type { Loan, LoanDevice, LoanerDevice } from '../types';

// Device detail: facts, Deckungsbeitrag/utilization, loan history, and the
// check-out / check-in actions. Check-in posts a best-effort CRM note (no
// Mesonic Beleg — that's the check-out side, Phase 4). Siehe docs/leihstellungen.md.

interface Props {
  deviceId: string;
  onClose: () => void;
  onEdit: (device: LoanerDevice) => void;
  onCheckOut: (device: LoanerDevice) => void;
  onChanged: () => void; // parent reloads the fleet list after a check-in
}

type HistoryRow = LoanDevice & { loan: Loan };

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function DeviceDetailModal({ deviceId, onClose, onEdit, onCheckOut, onChanged }: Props) {
  const [device, setDevice] = useState<LoanerDevice | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDevice(deviceId);
      if (!res) {
        setError('Gerät nicht gefunden.');
      } else {
        setDevice(res.device);
        setHistory(res.history);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const spans: LoanSpan[] = history.map((h) => ({ startedAt: h.loan.startedAt, returnedAt: h.returnedAt }));
  const metrics = device ? computeDeviceMetrics(device, spans, todayIso()) : null;
  const openRow = history.find((h) => h.returnedAt == null);

  async function handlePrintSticker() {
    if (!device || printing) return;
    setPrinting(true);
    setError(null);
    try {
      const { generateLoanerStickersBlob } = await importWithReload(
        () => import('../../../pdf/generateLoanerStickers'),
      );
      const blob = await generateLoanerStickersBlob([
        { bezeichnung: device.bezeichnung, serialNumber: device.serialNumber, inventoryNo: device.inventoryNo },
      ]);
      downloadBlob(blob, `Etikett-${device.serialNumber}.pdf`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPrinting(false);
    }
  }

  async function handleCheckIn() {
    if (!device || !openRow) return;
    setCheckingIn(true);
    setError(null);
    try {
      await checkInDevice(openRow.id, { returnedAt: todayIso() });
      // Best-effort CRM note on the customer's Mesonic account — a Mesonic
      // hang/failure must not block the return.
      void postLoanCheckInCrmNote(openRow.loan, [device], {
        importCrm: (xml) => mesonicImport(TYPES.CRM, TEMPLATES.CRM, xml, { actionCode: 1 }),
      });
      onChanged();
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="font-bold truncate">{device?.bezeichnung ?? 'Gerät'}</div>
            {device && <div className="text-white/60 text-xs font-mono truncate">{device.serialNumber}</div>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {device && (
              <button
                onClick={handlePrintSticker}
                disabled={printing}
                aria-label="Etikett drucken"
                title="Etikett drucken"
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50"
              >
                {printing ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />}
              </button>
            )}
            {device && (
              <button
                onClick={() => onEdit(device)}
                aria-label="Bearbeiten"
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              >
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} aria-label="Schließen" className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="animate-spin" size={22} />
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {device && !loading && (
            <>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_PILL[device.status]}`}>
                  {STATUS_LABEL[device.status]}
                </span>
                {device.standort && (
                  <span className="text-xs text-slate-500">{STANDORT_LABEL[device.standort]}</span>
                )}
              </div>

              {device.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {device.tags.map((t) => (
                    <span key={t} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">
                      {tagLabel(t)}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Fact label="Inventarnr." value={device.inventoryNo || '–'} />
                <Fact label="Anschaffung" value={`${formatEuro(device.acquisitionCost)} · ${formatDateDe(device.acquiredAt)}`} />
              </div>

              {device.note && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Notiz</div>
                  <div className="text-sm text-amber-900 whitespace-pre-wrap break-words">{device.note}</div>
                </div>
              )}

              {/* Deckungsbeitrag / Auslastung */}
              {metrics && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Deckungsbeitrag / Auslastung
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Verleihungen" value={metrics.loanCount} />
                    <Metric label="Tage verliehen" value={metrics.totalDaysOnLoan} />
                    <Metric
                      label="Auslastung"
                      value={metrics.utilization != null ? `${Math.round(metrics.utilization * 100)} %` : '–'}
                    />
                    <Metric
                      label="Kosten je Verleih"
                      value={metrics.amortizedCostPerLoan != null ? formatEuro(metrics.amortizedCostPerLoan) : '–'}
                    />
                  </div>
                </div>
              )}

              {/* Verlauf */}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Verlauf</div>
                {history.length === 0 ? (
                  <p className="text-sm text-slate-400">Noch nie verliehen.</p>
                ) : (
                  <div className="border border-slate-100 rounded-lg divide-y divide-slate-100">
                    {history.map((h) => (
                      <div key={h.id} className="px-3 py-2 flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-sm text-slate-700 truncate">
                            {h.loan.customerName}
                            {h.loan.customerKdnr && (
                              <span className="text-xs text-slate-400 font-normal"> · #{h.loan.customerKdnr}</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {formatDateDe(h.loan.startedAt)} – {h.returnedAt ? formatDateDe(h.returnedAt) : 'offen'}
                          </div>
                          {!h.returnedAt && h.loan.expectedReturn && (
                            <div className="text-xs text-slate-400">
                              Rückgabe erwartet: {formatDateDe(h.loan.expectedReturn)}
                            </div>
                          )}
                          {(h.note || h.loan.note) && (
                            <div className="text-xs text-slate-500 whitespace-pre-wrap break-words">
                              {h.note || h.loan.note}
                            </div>
                          )}
                        </div>
                        {!h.returnedAt && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                            verliehen
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {device && !loading && (device.status === 'available' || (device.status === 'on_loan' && openRow)) && (
          <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
            {device.status === 'available' && (
              <button
                onClick={() => onCheckOut(device)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                <ArrowRightLeft size={15} /> Verleihen
              </button>
            )}
            {device.status === 'on_loan' && openRow && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm text-slate-500">
                  <div>
                    Verliehen an <span className="text-slate-700">{openRow.loan.customerName}</span> seit {formatDateDe(openRow.loan.startedAt)}
                  </div>
                  {openRow.loan.expectedReturn && (
                    <div className="text-xs text-slate-400">Rückgabe erwartet: {formatDateDe(openRow.loan.expectedReturn)}</div>
                  )}
                  {(openRow.note || openRow.loan.note) && (
                    <div className="text-xs text-slate-500 whitespace-pre-wrap break-words">{openRow.note || openRow.loan.note}</div>
                  )}
                </div>
                <button
                  onClick={handleCheckIn}
                  disabled={checkingIn}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 flex-shrink-0"
                >
                  <Undo2 size={15} /> {checkingIn ? 'Rückgabe…' : 'Rückgabe'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
