import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Receipt, X } from 'lucide-react';
import { calculateTicketBilling, setTicketStatus } from '../api/ticketApi';
import { runTicketBelegExport } from '../lib/runTicketBelegExport';
import { useAuth } from '../../../lib/auth';
import type { BillingSummary, Ticket } from '../types';

type BelegExportResult = Awaited<ReturnType<typeof runTicketBelegExport>>;

interface TicketBillingPreviewProps {
  ticket: Ticket;
  currentEmployeeId?: string | null;
  onClosed: (updated: Ticket) => void;
  onCancel: () => void;
}

function eur(n: number): string {
  return `€${n.toFixed(2)}`;
}

export default function TicketBillingPreview({
  ticket,
  currentEmployeeId = null,
  onClosed,
  onCancel,
}: TicketBillingPreviewProps) {
  const { isAdmin } = useAuth() as { isAdmin: boolean };
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  // Mesonic-Beleg-Export (Reparaturscheine → WinLine-Belege → Sammel-Faktura).
  const [belegBusy, setBelegBusy] = useState(false);
  const [belegResult, setBelegResult] = useState<BelegExportResult | null>(null);
  const [belegError, setBelegError] = useState<string | null>(null);

  async function handleCreateBelege() {
    setBelegBusy(true);
    setBelegError(null);
    try {
      setBelegResult(await runTicketBelegExport(ticket.id));
    } catch (e) {
      setBelegError(e instanceof Error ? e.message : String(e));
    } finally {
      setBelegBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !closing) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, closing]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    calculateTicketBilling(ticket.id)
      .then((s) => {
        if (!cancelled) setSummary(s);
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
  }, [ticket.id]);

  async function handleConfirmClose() {
    // Absicherung: Schließen ist Admin-Sache (Georg + Herbert). Die Einstiege
    // sind für Techniker bereits ausgeblendet — hier der zweite Riegel.
    if (!isAdmin) {
      setError('Nur Admins können ein Ticket schließen.');
      return;
    }
    setClosing(true);
    setError(null);
    try {
      const updated = await setTicketStatus(ticket.id, 'closed', {
        closedBy: currentEmployeeId ?? undefined,
        resolutionNote: resolutionNote.trim() || undefined,
      });
      onClosed(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClosing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-auto"
      onClick={() => !closing && onCancel()}
      data-testid="billing-preview-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl mt-8 mb-8 w-full max-w-2xl mx-3 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-slate-500" />
            <h2 className="font-bold text-slate-800" style={{ fontSize: 16 }}>
              Ticket abschließen — {ticket.ticketNumber}
            </h2>
          </div>
          <button onClick={onCancel} disabled={closing} className="rounded p-1.5 hover:bg-slate-100">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : error && !summary ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={14} />
              {error}
            </div>
          ) : summary ? (
            <>
              {summary.repairOrders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                  Keine verrechenbaren Reparaturscheine. Ticket kann ohne Abrechnung geschlossen werden.
                </div>
              ) : (
                <div className="space-y-3" data-testid="billing-summary">
                  {summary.repairOrders.map((ro) => (
                    <div key={ro.repairOrderId} className="rounded-lg border border-slate-200">
                      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700 text-sm">
                            Rep.schein #{ro.seqNumber}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(ro.performedAt).toLocaleDateString('de-AT')}
                          </span>
                          {!ro.signed && (
                            <span className="rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 text-xs border border-amber-200">
                              nicht unterschrieben
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-semibold text-slate-800 text-sm">
                          {eur(ro.subtotal)}
                        </span>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {ro.positions.map((p, i) => (
                          <li key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                            <span className="flex-1 truncate">
                              {p.employeeName && (
                                <span className="text-slate-500">{p.employeeName} · </span>
                              )}
                              <span className="text-slate-700">{p.label}</span>
                            </span>
                            <span className="text-slate-500 hidden sm:inline">
                              {p.quantity}
                              {p.unit === 'h' ? 'h' : p.unit === 'km' ? ' km' : p.unit === 'Stk' ? ` Stk` : ''}
                              {p.unit !== 'pauschale' && ` × ${eur(p.unitPrice)}`}
                            </span>
                            <span className="font-mono text-slate-800 w-20 text-right">
                              {eur(p.total)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {/* Grand totals */}
                  <div className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 space-y-1 text-sm">
                    {summary.laborTotal > 0 && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Arbeit</span>
                        <span className="font-mono">{eur(summary.laborTotal)}</span>
                      </div>
                    )}
                    {summary.travelTotal > 0 && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Anfahrt / Wegzeit</span>
                        <span className="font-mono">{eur(summary.travelTotal)}</span>
                      </div>
                    )}
                    {summary.serviceTotal > 0 && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Service-Pauschalen</span>
                        <span className="font-mono">{eur(summary.serviceTotal)}</span>
                      </div>
                    )}
                    {summary.materialTotal > 0 && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Material</span>
                        <span className="font-mono">{eur(summary.materialTotal)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1.5 mt-1.5">
                      <span>Summe netto</span>
                      <span className="font-mono">{eur(summary.subtotalNet)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-xs">
                      <span>+ {summary.vatPercent}% MWSt.</span>
                      <span className="font-mono">{eur(summary.vatAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5 mt-1.5" data-testid="billing-grand-total">
                      <span>Gesamt brutto</span>
                      <span className="font-mono">{eur(summary.grandTotalGross)}</span>
                    </div>
                  </div>

                  {isAdmin && (
                    !ticket.mesonicCustomerId ? (
                      <div className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                        <AlertCircle size={14} />
                        Kein WinLine-Konto am Ticket — Kunde erst verknüpfen, um Belege anzulegen.
                      </div>
                    ) : belegResult ? (
                      <div className="w-full rounded-lg border border-slate-200 px-3 py-2 space-y-1 text-xs" data-testid="beleg-export-result">
                        {belegResult.created.length > 0 && (
                          <div className="flex items-start gap-1.5 text-emerald-700">
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                            <span>
                              {belegResult.created.length} Beleg{belegResult.created.length === 1 ? '' : 'e'} in WinLine angelegt:{' '}
                              <span className="font-mono">{belegResult.created.map((c) => c.belegKey).join(', ')}</span>
                            </span>
                          </div>
                        )}
                        {belegResult.skipped.length > 0 && (
                          <div className="text-slate-500">
                            {belegResult.skipped.length} übersprungen (bereits verrechnet / leer)
                          </div>
                        )}
                        {belegResult.failed.length > 0 && (
                          <div className="text-rose-700">
                            {belegResult.failed.map((f) => `Rep.schein #${f.seqNumber}: ${f.error}`).join(' · ')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleCreateBelege()}
                        disabled={belegBusy}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        data-testid="create-belege"
                        title="Je Reparaturschein einen WinLine-Beleg (Belegart 12/16) anlegen. Mesonic fasst sie zur Sammel-Faktura zusammen."
                      >
                        {belegBusy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Belege in WinLine anlegen
                      </button>
                    )
                  )}
                  {belegError && (
                    <div className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                      <AlertCircle size={14} /> {belegError}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Lösungsnotiz (optional)
                </label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Was wurde gelöst? Für den späteren Verlauf."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>
            </>
          ) : null}

          {error && summary && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={closing}
            className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirmClose}
            disabled={closing || loading || !isAdmin}
            title={!isAdmin ? 'Nur Admins können Tickets schließen' : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            data-testid="billing-confirm-close"
          >
            {closing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Ticket schließen
          </button>
        </div>
      </div>
    </div>
  );
}
