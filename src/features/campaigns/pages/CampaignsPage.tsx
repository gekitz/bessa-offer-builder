import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Mail, Megaphone, Phone, RefreshCw, Send } from 'lucide-react';

import { useAuth } from '../../../lib/auth';
import Select from '../../../components/Select';
import {
  dryRunSend,
  getFunnelCounts,
  listCampaigns,
  listRecipients,
  sendCampaign,
} from '../api/campaignApi';
import type {
  Campaign,
  CampaignActor,
  CampaignFunnelCounts,
  CampaignOutcome,
  CampaignRecipient,
  CampaignRecipientFilter,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
// Kampagnen-Back-Office — Funnel-Rollup + actionable Call-Lists + Versand
// in Wellen. Ein dedizierter Tab (generische Engine; Type B klinkt später
// ein). Muster wie ViertlPage: useAuth() für den Aktor, Select für Picker,
// Badge-/Label-Meta-Maps, Pill-Filter mit Counts.
// ═══════════════════════════════════════════════════════════════════

const OUTCOME_META: Record<CampaignOutcome, { label: string; cls: string }> = {
  authorized:      { label: 'Auftrag erteilt',   cls: 'bg-emerald-100 text-emerald-700' },
  quote_requested: { label: 'Angebot angefordert', cls: 'bg-indigo-100 text-indigo-700' },
  soft_check:      { label: 'OS-Check',          cls: 'bg-amber-100 text-amber-700' },
  offer_accepted:  { label: 'Angebot angenommen', cls: 'bg-emerald-100 text-emerald-700' },
};

const NOT_OPENED_DAYS = 5;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-AT');
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-center min-w-[84px]">
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

export default function CampaignsPage(_props: { onOpenOffer?: (offerId: string) => void } = {}) {
  const { profile } = useAuth() as { profile: { id?: string; display_name?: string } | null };
  const actor: CampaignActor = { id: profile?.id ?? null, name: profile?.display_name ?? null };

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>('');
  const [batch, setBatch] = useState<string>('all');
  const [filter, setFilter] = useState<CampaignRecipientFilter>('all');

  const [counts, setCounts] = useState<CampaignFunnelCounts | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const campaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? null, [campaigns, campaignId]);

  // Distinct Batches der geladenen Empfänger (für den Wellen-Picker).
  const batches = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipients) if (r.batch) set.add(r.batch);
    return Array.from(set).sort();
  }, [recipients]);

  const loadCampaigns = useCallback(async () => {
    try {
      const list = await listCampaigns();
      setCampaigns(list);
      if (list.length && !campaignId) setCampaignId(list[0]!.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  const reload = useCallback(async () => {
    if (!campaignId) { setCounts(null); setRecipients([]); return; }
    setBusy(true);
    setError(null);
    try {
      const batchArg = batch === 'all' ? undefined : batch;
      const [fc, recs] = await Promise.all([
        getFunnelCounts(campaignId, batchArg),
        listRecipients(campaignId, { batch: batchArg, filter, notOpenedDays: NOT_OPENED_DAYS }),
      ]);
      setCounts(fc);
      setRecipients(recs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setBusy(false);
    }
  }, [campaignId, batch, filter]);

  useEffect(() => { void reload(); }, [reload]);

  // ── Versand ──
  const partition = useMemo(
    () => dryRunSend(recipients, recipients.map((r) => r.id), false),
    [recipients],
  );

  async function handleSendWave() {
    if (!campaign) return;
    const ids = recipients.map((r) => r.id);
    const part = dryRunSend(recipients, ids, false);
    const targetBatch = batch === 'all' ? new Date().toISOString().slice(0, 10) : batch;
    const ok = window.confirm(
      `Sende an ${part.toSend.length} · überspringe ${part.skipped.length} (bereits kontaktiert) · ${part.noEmail.length} ohne E-Mail.\n\nWelle: ${targetBatch}\n\nFortfahren?`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const res = await sendCampaign({ campaignId: campaign.id, recipientIds: ids, batch: targetBatch });
      setFlash(`Gesendet: ${res.sent} · übersprungen: ${res.skipped} · ohne E-Mail: ${res.noEmail} · fehlgeschlagen: ${res.failed}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend(recipient: CampaignRecipient) {
    if (!campaign || !recipient.email) return;
    const ok = window.confirm(`E-Mail erneut an ${recipient.name || recipient.email} senden?`);
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sendCampaign({
        campaignId: campaign.id,
        recipientIds: [recipient.id],
        batch: recipient.batch || new Date().toISOString().slice(0, 10),
        resend: true,
      });
      setFlash(`Erneut gesendet: ${res.sent}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  // No-E-Mail-Segment als CSV exportieren (Druck-/Mail-Merge-Fallback).
  function exportPrintList() {
    const noEmail = recipients.filter((r) => !r.email);
    const header = 'Name,Subject-Typ,Subject-ID,Batch\n';
    const rows = noEmail
      .map((r) => [r.name ?? '', r.subjectType, r.subjectId, r.batch ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `druckliste-${campaign?.key ?? 'kampagne'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-red-400" size={24} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone className="text-red-500" size={22} />
          <h1 className="text-xl font-bold text-slate-800">Kampagnen</h1>
        </div>

        {campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-500 text-sm">
            Noch keine Kampagne angelegt. Kampagnen werden über eine Migration bzw. das
            Enrolment (Viertl-Segment) erstellt.
          </div>
        ) : (
          <>
            {/* Picker */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="min-w-[220px]">
                <Select
                  ariaLabel="Kampagne"
                  value={campaignId}
                  onChange={setCampaignId}
                  options={campaigns.map((c) => ({ value: c.id, label: c.title, hint: c.status }))}
                />
              </div>
              <div className="min-w-[160px]">
                <Select
                  ariaLabel="Welle"
                  value={batch}
                  onChange={setBatch}
                  options={[{ value: 'all', label: 'Alle Wellen' }, ...batches.map((b) => ({ value: b, label: b }))]}
                />
              </div>
              <button
                onClick={() => void reload()}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Aktualisieren
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={exportPrintList}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
                  title="Empfänger ohne E-Mail als CSV exportieren"
                >
                  <Download size={14} /> Druckliste
                </button>
                <button
                  onClick={() => void handleSendWave()}
                  disabled={busy || partition.toSend.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  <Send size={14} /> Welle senden ({partition.toSend.length})
                </button>
              </div>
            </div>

            {flash && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{flash}</div>}
            {error && <div className="mb-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

            {/* Funnel-Rollup */}
            {counts && (
              <div className="flex flex-wrap gap-2 mb-5">
                <StatChip label="Gesamt" value={counts.total} />
                <StatChip label="Gesendet" value={counts.sent} />
                <StatChip label="Zugestellt" value={counts.delivered} />
                <StatChip label="Geöffnet" value={counts.opened} />
                <StatChip label="Geklickt" value={counts.clicked} />
                <StatChip label="Gestartet" value={counts.started} />
                <StatChip label="Auftrag" value={counts.outcomeAuthorized} />
                <StatChip label="Angebot" value={counts.outcomeQuoteRequested} />
                <StatChip label="OS-Check" value={counts.outcomeSoftCheck} />
                <StatChip label="Ohne E-Mail" value={counts.noEmail} />
              </div>
            )}

            {/* Call-List-Filter (Pills) */}
            <div className="flex flex-wrap gap-2 mb-3">
              {([
                ['all', 'Alle'],
                ['opened_not_acted', 'Geöffnet, keine Aktion'],
                ['started_unfinished', 'Gestartet, nicht fertig'],
                ['not_opened', `Nicht geöffnet (>${NOT_OPENED_DAYS} Tage)`],
              ] as [CampaignRecipientFilter, string][]).map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    filter === f ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {label}
                  {f === filter && <span className="ml-1.5 text-xs">({recipients.length})</span>}
                </button>
              ))}
            </div>

            {/* Empfänger-Tabelle */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">E-Mail</th>
                    <th className="px-4 py-2 font-medium">Welle</th>
                    <th className="px-4 py-2 font-medium">Gesendet</th>
                    <th className="px-4 py-2 font-medium">Geöffnet</th>
                    <th className="px-4 py-2 font-medium">Ergebnis</th>
                    <th className="px-4 py-2 font-medium text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Keine Empfänger in diesem Filter.</td></tr>
                  )}
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2 text-slate-800">{r.name || '—'}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {r.email ? r.email : <span className="text-[11px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">keine E-Mail</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{r.batch || '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{fmtDate(r.sentAt)}</td>
                      <td className="px-4 py-2 text-slate-500">{fmtDate(r.openedAt)}</td>
                      <td className="px-4 py-2">
                        {r.outcome ? (
                          <span className={`text-[11px] rounded px-1.5 py-0.5 ${OUTCOME_META[r.outcome].cls}`}>{OUTCOME_META[r.outcome].label}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {r.email && (
                            <>
                              <a href={`mailto:${r.email}`} className="text-slate-400 hover:text-red-500" title="E-Mail"><Mail size={15} /></a>
                              <button onClick={() => void handleResend(r)} disabled={busy} className="text-slate-400 hover:text-red-500 disabled:opacity-40" title="Erneut senden"><Send size={15} /></button>
                            </>
                          )}
                          {!r.email && <span className="text-slate-300"><Phone size={15} /></span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
