import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cpu, Download, Loader2, Mail, Megaphone, Phone, Plus, RefreshCw, Search, Send, UserPlus } from 'lucide-react';

import { useAuth } from '../../../lib/auth';
import Select from '../../../components/Select';
import {
  createCampaign,
  dryRunSend,
  enrollRecipients,
  getFunnelCounts,
  listCampaigns,
  listRecipients,
  sendCampaign,
} from '../api/campaignApi';
import { filterLicensesForSegment, licenseToEnrollSubject, type ViertlSegmentFilter } from '../lib/rksvEnroll';
import { listLicenses } from '../../viertl/api/viertlApi';
import type { ViertlCustomerStatus, ViertlLicense } from '../../viertl/types';
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

  // ── Neue Kampagne (M1) ──
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newTemplate, setNewTemplate] = useState('');

  // ── Enrol aus dem Viertl-Segment (M1) ──
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [licenses, setLicenses] = useState<ViertlLicense[] | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [segSearch, setSegSearch] = useState('');
  const [segCustomer, setSegCustomer] = useState<ViertlCustomerStatus | 'all'>('active');
  const [segHwOnly, setSegHwOnly] = useState(false);
  const [segWithEmail, setSegWithEmail] = useState(false); // default false → Druck-Segment mit erfassen (C3)
  const [enrollBatch, setEnrollBatch] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const campaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? null, [campaigns, campaignId]);

  const segmentFilter = useMemo<ViertlSegmentFilter>(() => ({
    search: segSearch,
    customerStatus: segCustomer,
    hardwareNeeded: segHwOnly,
    withEmailOnly: segWithEmail,
  }), [segSearch, segCustomer, segHwOnly, segWithEmail]);

  const segment = useMemo(
    () => (licenses ? filterLicensesForSegment(licenses, segmentFilter) : []),
    [licenses, segmentFilter],
  );
  const segmentNoEmail = useMemo(() => segment.filter((l) => !l.email).length, [segment]);

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

  // ── Neue Kampagne anlegen (Type A) ──
  async function handleCreateCampaign() {
    if (!newKey.trim() || !newTitle.trim()) {
      setError('Key und Titel sind erforderlich.');
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      // Type ist in diesem Scope fix rksv_signature (Type B out of scope).
      const created = await createCampaign(
        {
          type: 'rksv_signature',
          key: newKey.trim(),
          title: newTitle.trim(),
          emailSubject: newSubject.trim() || null,
          emailTemplate: newTemplate.trim() || null,
        },
        actor,
      );
      setCreateOpen(false);
      setNewKey(''); setNewTitle(''); setNewSubject(''); setNewTemplate('');
      await loadCampaigns();
      setCampaignId(created.id);
      setFlash(`Kampagne „${created.title}" angelegt.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  // ── Enrol-Panel öffnen: Lizenzen laden ──
  async function openEnroll() {
    setEnrollOpen(true);
    if (licenses) return;
    setEnrollBusy(true);
    setError(null);
    try {
      setLicenses(await listLicenses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Viertl-Lizenzen konnten nicht geladen werden');
    } finally {
      setEnrollBusy(false);
    }
  }

  // ── Segment enrollen: pro Lizenz payload-Snapshot (knownHardwareNeeded +
  //    versionOk), dann idempotenter upsert (enrollRecipients). ──
  async function handleEnroll() {
    if (!campaign) return;
    const batch = enrollBatch.trim() || new Date().toISOString().slice(0, 10);
    const subjects = segment.map((l) => licenseToEnrollSubject(l, batch));
    const ok = window.confirm(
      `Enrolle ${subjects.length} Empfänger (${segmentNoEmail} ohne E-Mail) in Welle „${batch}".\nBereits enrollte werden per Idempotenz übersprungen.\n\nFortfahren?`,
    );
    if (!ok) return;
    setEnrollBusy(true);
    setError(null);
    setFlash(null);
    try {
      const res = await enrollRecipients(campaign.id, subjects);
      setFlash(`Enrolled: ${res.enrolled.length} · übersprungen: ${res.skipped}`);
      setEnrollOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrol fehlgeschlagen');
    } finally {
      setEnrollBusy(false);
    }
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
          <button
            onClick={() => { setCreateOpen((v) => !v); setEnrollOpen(false); }}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
          >
            <Plus size={14} /> Neue Kampagne
          </button>
        </div>

        {createOpen && (
          <CreateCampaignPanel
            newKey={newKey} setNewKey={setNewKey}
            newTitle={newTitle} setNewTitle={setNewTitle}
            newSubject={newSubject} setNewSubject={setNewSubject}
            newTemplate={newTemplate} setNewTemplate={setNewTemplate}
            busy={busy}
            onSubmit={() => void handleCreateCampaign()}
            onCancel={() => setCreateOpen(false)}
          />
        )}

        {campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-500 text-sm">
            Noch keine Kampagne angelegt. Legen Sie oben eine <strong>Neue Kampagne</strong> an
            (Type A: RKSV-Signaturkarte) und enrollen Sie anschließend Empfänger aus dem
            Viertl-Segment.
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
                {campaign?.type === 'rksv_signature' && (
                  <button
                    onClick={() => void openEnroll()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
                    title="Empfänger aus dem Viertl-Segment enrollen"
                  >
                    <UserPlus size={14} /> Empfänger enrollen
                  </button>
                )}
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

            {enrollOpen && campaign?.type === 'rksv_signature' && (
              <EnrollPanel
                segSearch={segSearch} setSegSearch={setSegSearch}
                segCustomer={segCustomer} setSegCustomer={setSegCustomer}
                segHwOnly={segHwOnly} setSegHwOnly={setSegHwOnly}
                segWithEmail={segWithEmail} setSegWithEmail={setSegWithEmail}
                enrollBatch={enrollBatch} setEnrollBatch={setEnrollBatch}
                loading={enrollBusy && licenses === null}
                busy={enrollBusy}
                segmentCount={segment.length}
                segmentNoEmail={segmentNoEmail}
                onEnroll={() => void handleEnroll()}
                onClose={() => setEnrollOpen(false)}
              />
            )}

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

// ── Neue-Kampagne-Panel (inline, im ViertlPage-Stil) ──
const CAMPAIGN_TYPE_OPTIONS = [{ value: 'rksv_signature', label: 'RKSV-Signaturkarte (Type A)' }];

function CreateCampaignPanel({
  newKey, setNewKey,
  newTitle, setNewTitle,
  newSubject, setNewSubject,
  newTemplate, setNewTemplate,
  busy,
  onSubmit,
  onCancel,
}: {
  newKey: string; setNewKey: (v: string) => void;
  newTitle: string; setNewTitle: (v: string) => void;
  newSubject: string; setNewSubject: (v: string) => void;
  newTemplate: string; setNewTemplate: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none';
  return (
    <div className="mb-4 bg-white rounded-xl border border-slate-200 p-4">
      <h2 className="font-semibold text-slate-800 mb-3">Neue Kampagne</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Typ</span>
          {/* Nur Type A anbieten; Type B (PoS) ist in diesem Scope ausgeschlossen. */}
          <Select value="rksv_signature" onChange={() => {}} options={CAMPAIGN_TYPE_OPTIONS} ariaLabel="Kampagnentyp" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Key (eindeutig)</span>
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="z. B. 2026-acos" className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-500 mb-1">Titel</span>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="RKSV-Signaturkartentausch 2026" className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-500 mb-1">E-Mail-Betreff</span>
          <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Ihre RKSV-Signaturkarte muss getauscht werden" className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-500 mb-1">E-Mail-Text (HTML, {'{name}'} wird ersetzt)</span>
          <textarea value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} rows={4} placeholder="<p>Guten Tag {name},</p> …" className={inputCls} />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm disabled:opacity-40">Abbrechen</button>
        <button onClick={onSubmit} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
          {busy && <Loader2 className="animate-spin" size={14} />} Anlegen
        </button>
      </div>
    </div>
  );
}

const CUSTOMER_SEG_OPTIONS: { value: ViertlCustomerStatus | 'all'; label: string }[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'closing', label: 'Sperrt zu' },
  { value: 'closed', label: 'Geschlossen' },
  { value: 'all', label: 'Alle Kunden' },
];

// ── Enrol-aus-Viertl-Panel (inline) ──
function EnrollPanel({
  segSearch, setSegSearch,
  segCustomer, setSegCustomer,
  segHwOnly, setSegHwOnly,
  segWithEmail, setSegWithEmail,
  enrollBatch, setEnrollBatch,
  loading,
  busy,
  segmentCount,
  segmentNoEmail,
  onEnroll,
  onClose,
}: {
  segSearch: string; setSegSearch: (v: string) => void;
  segCustomer: ViertlCustomerStatus | 'all'; setSegCustomer: (v: ViertlCustomerStatus | 'all') => void;
  segHwOnly: boolean; setSegHwOnly: (v: boolean) => void;
  segWithEmail: boolean; setSegWithEmail: (v: boolean) => void;
  enrollBatch: string; setEnrollBatch: (v: string) => void;
  loading: boolean;
  busy: boolean;
  segmentCount: number;
  segmentNoEmail: number;
  onEnroll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mb-4 bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">Empfänger aus Viertl-Segment enrollen</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">Schließen</button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <Loader2 className="animate-spin" size={16} /> Viertl-Lizenzen laden …
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={segSearch}
                onChange={(e) => setSegSearch(e.target.value)}
                placeholder="Name, Ort, Kd.Nr., Hardware …"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-100"
              />
            </div>
            <Select
              value={segCustomer}
              onChange={(v) => setSegCustomer(v as ViertlCustomerStatus | 'all')}
              options={CUSTOMER_SEG_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              className="inline-block min-w-[150px]"
              ariaLabel="Kundenstatus"
            />
            <button
              onClick={() => setSegHwOnly(!segHwOnly)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${
                segHwOnly ? 'bg-rose-50 border-rose-200 text-rose-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Cpu className="w-4 h-4" /> Neue HW nötig
            </button>
            <button
              onClick={() => setSegWithEmail(!segWithEmail)}
              title="Nur Lizenzen mit hinterlegter E-Mail"
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${
                segWithEmail ? 'bg-sky-50 border-sky-200 text-sky-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Mail className="w-4 h-4" /> Nur mit E-Mail
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Welle</span>
              <input
                value={enrollBatch}
                onChange={(e) => setEnrollBatch(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              />
            </label>
            <div className="text-sm text-slate-500">
              Segment: <strong className="text-slate-800">{segmentCount}</strong> Lizenzen · {segmentNoEmail} ohne E-Mail
            </div>
            <button
              onClick={onEnroll}
              disabled={busy || segmentCount === 0}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="animate-spin" size={14} />}
              <UserPlus size={14} /> {segmentCount} enrollen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
