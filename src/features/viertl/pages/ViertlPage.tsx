import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Cpu, Download, ExternalLink, FileText, Loader2, Mail, Phone, Plus, RefreshCw, Search, Send, X } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import Select from '../../../components/Select';
import { addNote, linkOffer, listEvents, listLicenses, notifyViertlClosure, unlinkOffer, updateLicense } from '../api/viertlApi';
import { fetchMesonicContact } from '../lib/mesonicContact';
import { getOfferSummary, offerImpliesStatus, suggestOffersForLicense, type OfferSummary } from '../lib/offerLink';
import type {
  ViertlActor,
  ViertlCustomerStatus,
  ViertlEvent,
  ViertlLicense,
  ViertlStatus,
  ViertlWartung,
} from '../types';

// ─────────────────────────────────────────────────────────────────────
// Label-/Farb-Metadaten
// ─────────────────────────────────────────────────────────────────────

const STATUS_META: Record<ViertlStatus, { label: string; cls: string }> = {
  new:           { label: 'Neu',            cls: 'bg-slate-100 text-slate-600' },
  waiting:       { label: 'Wartet',         cls: 'bg-amber-100 text-amber-700' },
  offer_created: { label: 'Angebot',        cls: 'bg-indigo-100 text-indigo-700' },
  mailed:        { label: 'Versendet',      cls: 'bg-sky-100 text-sky-700' },
  replied:       { label: 'Retour',         cls: 'bg-violet-100 text-violet-700' },
  done:          { label: 'Neue A-Trust ✓', cls: 'bg-emerald-100 text-emerald-700' },
};

const CUSTOMER_META: Record<ViertlCustomerStatus, { label: string; cls: string }> = {
  active:  { label: 'Aktiv',       cls: 'bg-emerald-50 text-emerald-700' },
  closing: { label: 'Sperrt zu',   cls: 'bg-amber-50 text-amber-700' },
  closed:  { label: 'Geschlossen', cls: 'bg-rose-50 text-rose-700' },
};

const WARTUNG_LABEL: Record<ViertlWartung, string> = {
  none: '—',
  sww: 'SW-Wartung',
  sw_hww: 'SW+HW-Wartung',
  miete: 'Miete',
};

const STATUS_OPTIONS = (['new', 'waiting', 'offer_created', 'mailed', 'replied', 'done'] as ViertlStatus[])
  .map((v) => ({ value: v, label: STATUS_META[v].label }));
const CUSTOMER_OPTIONS = (['active', 'closing', 'closed'] as ViertlCustomerStatus[])
  .map((v) => ({ value: v, label: CUSTOMER_META[v].label }));
const WARTUNG_OPTIONS = (['none', 'sww', 'sw_hww', 'miete'] as ViertlWartung[])
  .map((v) => ({ value: v, label: WARTUNG_LABEL[v] }));

// Angebotsstatus (aus dem offers-System) → Label/Farbe für die Viertl-Ansicht.
function offerBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'draft':     return { label: 'Entwurf',    cls: 'bg-slate-100 text-slate-600' };
    case 'sent':      return { label: 'Gesendet',   cls: 'bg-sky-100 text-sky-700' };
    case 'delivered': return { label: 'Zugestellt', cls: 'bg-sky-100 text-sky-700' };
    case 'opened':    return { label: 'Geöffnet',   cls: 'bg-violet-100 text-violet-700' };
    case 'accepted':  return { label: 'Angenommen', cls: 'bg-emerald-100 text-emerald-700' };
    case 'rejected':  return { label: 'Abgelehnt',  cls: 'bg-rose-100 text-rose-700' };
    case 'bounced':   return { label: 'Bounce',     cls: 'bg-rose-100 text-rose-700' };
    default:          return { label: status,       cls: 'bg-slate-100 text-slate-600' };
  }
}

function eventActionLabel(type: string): string {
  switch (type) {
    case 'offer_attached':  return 'Angebot verknüpft';
    case 'email_sent':      return 'Info-Mail versendet';
    case 'email_opened':    return 'Info-Mail geöffnet';
    case 'viertl_notified': return 'Viertl informiert';
    default:                return type;
  }
}

function fieldLabel(field: string | null): string {
  switch (field) {
    case 'status': return 'Status';
    case 'customer_status': return 'Kundenstatus';
    case 'wartung': return 'Wartung';
    case 'gastrotouch_version': return 'Version';
    case 'hardware_model': return 'Hardware';
    case 'hardware_needed': return 'Neue Hardware nötig';
    case 'email': return 'E-Mail';
    case 'closed_reason': return 'Schließungsgrund';
    case 'notes': return 'Notizen';
    default: return field ?? '';
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-AT');
}

// ═══════════════════════════════════════════════════════════════════
// Viertl (Gastrotouch) Lizenz-Tracking — ersetzt die Excel-Liste.
// ═══════════════════════════════════════════════════════════════════
export default function ViertlPage({
  onOpenOffer,
  onCreateOffer,
}: {
  onOpenOffer?: (offerId: string) => void;
  onCreateOffer?: (license: ViertlLicense) => void;
} = {}) {
  const { profile, isAdmin } = useAuth() as {
    profile: { id?: string; display_name?: string } | null;
    isAdmin: boolean;
  };
  const actor: ViertlActor = { id: profile?.id ?? null, name: profile?.display_name ?? null };

  const [licenses, setLicenses] = useState<ViertlLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ViertlStatus | 'all'>('all');
  const [custFilter, setCustFilter] = useState<ViertlCustomerStatus | 'all'>('all');
  const [hwOnly, setHwOnly] = useState(false);
  const [noEmailOnly, setNoEmailOnly] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLicenses(await listLicenses());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return licenses.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (custFilter !== 'all' && l.customerStatus !== custFilter) return false;
      if (hwOnly && !l.hardwareNeeded) return false;
      if (noEmailOnly && l.email) return false;
      if (q) {
        const hay = `${l.name} ${l.contact ?? ''} ${l.ort ?? ''} ${l.mesonicKdnr} ${l.hardwareModel ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [licenses, search, statusFilter, custFilter, hwOnly, noEmailOnly]);

  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const l of licenses) by[l.status] = (by[l.status] ?? 0) + 1;
    const hw = licenses.filter((l) => l.hardwareNeeded).length;
    const done = by.done ?? 0;
    return { total: licenses.length, done, hw, open: licenses.length - done };
  }, [licenses]);

  const selected = licenses.find((l) => l.id === selectedId) ?? null;

  // Patch anwenden + lokalen State aktualisieren.
  const applyPatch = useCallback(
    async (id: string, patch: Parameters<typeof updateLicense>[1]) => {
      const updated = await updateLicense(id, patch, actor);
      setLicenses((prev) => prev.map((l) => (l.id === id ? updated : l)));
      return updated;
    },
    [actor],
  );

  // E-Mail einer einzelnen Installation aus Mesonic ziehen (Kd.Nr → Konto).
  const fetchEmail = useCallback(
    async (license: ViertlLicense): Promise<string | null> => {
      const { email } = await fetchMesonicContact(license.mesonicKdnr);
      if (email && email !== license.email) {
        await applyPatch(license.id, { email });
      }
      return email;
    },
    [applyPatch],
  );

  // Angebot ver-/entknüpfen (spiegelt Sende-/Öffnungsstatus in Viertl).
  const linkOfferToLicense = useCallback(
    async (licenseId: string, offer: OfferSummary) => {
      const updated = await linkOffer(licenseId, offer.id, actor, offerImpliesStatus(offer.status));
      setLicenses((prev) => prev.map((l) => (l.id === licenseId ? updated : l)));
    },
    [actor],
  );
  const unlinkOfferFromLicense = useCallback(
    async (licenseId: string) => {
      const updated = await unlinkOffer(licenseId, actor);
      setLicenses((prev) => prev.map((l) => (l.id === licenseId ? updated : l)));
    },
    [actor],
  );

  // Bulk-Backfill (Admin): alle Installationen ohne E-Mail sequenziell aus
  // Mesonic nachladen. Sequenziell wegen WORKER_LIMIT/30s-Hänger des
  // Mesonic-Proxys; überspringt bereits befüllte Zeilen → wiederholbar.
  const missingEmail = useMemo(() => licenses.filter((l) => !l.email), [licenses]);
  const [backfill, setBackfill] = useState<{ running: boolean; done: number; total: number; found: number } | null>(null);
  const abortRef = useRef(false);

  const runBackfill = useCallback(async () => {
    const targets = licenses.filter((l) => !l.email);
    abortRef.current = false;
    setBackfill({ running: true, done: 0, total: targets.length, found: 0 });
    let found = 0;
    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break;
      try {
        const email = await fetchEmail(targets[i]);
        if (email) found++;
      } catch {
        // einzelne Fehlschläge überspringen — Backfill ist wiederholbar
      }
      setBackfill({ running: true, done: i + 1, total: targets.length, found });
    }
    setBackfill((b) => (b ? { ...b, running: false } : b));
  }, [licenses, fetchEmail]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Viertl / Gastrotouch</h1>
          <p className="text-xs text-slate-500">
            {counts.total} Installationen · {counts.open} offen · {counts.done} erledigt · {counts.hw} × neue HW nötig · {missingEmail.length} ohne E-Mail
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            backfill?.running ? (
              <button
                onClick={() => { abortRef.current = true; }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-700"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                {backfill.done}/{backfill.total} · {backfill.found} gefunden — Stopp
              </button>
            ) : missingEmail.length > 0 ? (
              <button
                onClick={() => void runBackfill()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="E-Mails aus Mesonic nachladen (Kd.Nr → Konto)"
              >
                <Download className="w-4 h-4" /> E-Mails laden ({missingEmail.length})
              </button>
            ) : null
          )}
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" /> Aktualisieren
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Ort, Kd.Nr., Hardware …"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ViertlStatus | 'all')}
          options={[{ value: 'all', label: 'Alle Status' }, ...STATUS_OPTIONS]}
          className="inline-block min-w-[150px]"
          ariaLabel="Status filtern"
        />
        <Select
          value={custFilter}
          onChange={(v) => setCustFilter(v as ViertlCustomerStatus | 'all')}
          options={[{ value: 'all', label: 'Alle Kunden' }, ...CUSTOMER_OPTIONS]}
          className="inline-block min-w-[150px]"
          ariaLabel="Kundenstatus filtern"
        />
        <button
          onClick={() => setHwOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${
            hwOnly ? 'bg-rose-50 border-rose-200 text-rose-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Cpu className="w-4 h-4" /> Neue HW nötig
        </button>
        <button
          onClick={() => setNoEmailOnly((v) => !v)}
          title="Nur Kunden ohne hinterlegte E-Mail — die anzurufen sind"
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${
            noEmailOnly ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Phone className="w-4 h-4" /> Ohne E-Mail
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 m-4 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-12">Keine Einträge</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">Kunde</th>
                <th className="text-left font-medium px-3 py-2">Ort</th>
                <th className="text-left font-medium px-3 py-2">Version</th>
                <th className="text-left font-medium px-3 py-2">Letztes Update</th>
                <th className="text-left font-medium px-3 py-2">Hardware</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-center font-medium px-3 py-2">E-Mail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelectedId(l.id)}
                  className="border-b border-slate-50 hover:bg-indigo-50/40 cursor-pointer"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{l.name}</span>
                      {l.customerStatus !== 'active' && (
                        <span className={`inline-block px-1.5 py-0.5 rounded-full text-[11px] font-medium ${CUSTOMER_META[l.customerStatus].cls}`}>
                          {CUSTOMER_META[l.customerStatus].label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {l.contact ? `${l.contact} · ` : ''}Kd. {l.mesonicKdnr}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{l.plz} {l.ort}</td>
                  <td className="px-3 py-2 text-slate-600">{l.gastrotouchVersion ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{fmtDate(l.lastUpdate)}</td>
                  <td className="px-3 py-2">
                    {l.hardwareNeeded && (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-600" title="Neue Hardware nötig">
                        <Cpu className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span className="text-slate-500 text-xs">{l.hardwareModel ?? ''}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[l.status].cls}`}>
                      {STATUS_META[l.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {l.email ? (
                      <span className="inline-flex items-center justify-center text-emerald-600" title={l.email}>
                        <Mail className="w-4 h-4" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center text-amber-500" title="Keine E-Mail – anrufen">
                        <Phone className="w-4 h-4" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <LicenseDetail
          license={selected}
          actor={actor}
          onClose={() => setSelectedId(null)}
          onPatch={applyPatch}
          onFetchEmail={fetchEmail}
          onLinkOffer={linkOfferToLicense}
          onUnlinkOffer={unlinkOfferFromLicense}
          onOpenOffer={onOpenOffer}
          onCreateOffer={onCreateOffer}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Detail-Panel: Felder editieren + Historie
// ═══════════════════════════════════════════════════════════════════
function LicenseDetail({
  license,
  actor,
  onClose,
  onPatch,
  onFetchEmail,
  onLinkOffer,
  onUnlinkOffer,
  onOpenOffer,
  onCreateOffer,
}: {
  license: ViertlLicense;
  actor: ViertlActor;
  onClose: () => void;
  onPatch: (id: string, patch: Parameters<typeof updateLicense>[1]) => Promise<ViertlLicense>;
  onFetchEmail: (license: ViertlLicense) => Promise<string | null>;
  onLinkOffer: (licenseId: string, offer: OfferSummary) => Promise<void>;
  onUnlinkOffer: (licenseId: string) => Promise<void>;
  onOpenOffer?: (offerId: string) => void;
  onCreateOffer?: (license: ViertlLicense) => void;
}) {
  const [events, setEvents] = useState<ViertlEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [noteDraft, setNoteDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetchingEmail, setFetchingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [linkedOffer, setLinkedOffer] = useState<OfferSummary | null>(null);
  const [suggestions, setSuggestions] = useState<OfferSummary[] | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyReason, setNotifyReason] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  const reloadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      setEvents(await listEvents(license.id));
    } finally {
      setLoadingEvents(false);
    }
  }, [license.id]);

  useEffect(() => { void reloadEvents(); }, [reloadEvents]);

  // Verknüpftes Angebot laden (Sende-/Öffnungsstatus live aus offers).
  useEffect(() => {
    let cancelled = false;
    if (!license.linkedOfferId) { setLinkedOffer(null); return; }
    void getOfferSummary(license.linkedOfferId).then((o) => { if (!cancelled) setLinkedOffer(o); });
    return () => { cancelled = true; };
  }, [license.linkedOfferId]);

  const patch = async (p: Parameters<typeof updateLicense>[1]) => {
    setBusy(true);
    try {
      await onPatch(license.id, p);
      await reloadEvents();
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    const msg = noteDraft.trim();
    if (!msg) return;
    setBusy(true);
    try {
      await addNote(license.id, msg, actor);
      setNoteDraft('');
      await reloadEvents();
    } finally {
      setBusy(false);
    }
  };

  const fetchEmail = async () => {
    setFetchingEmail(true);
    setEmailMsg(null);
    try {
      const email = await onFetchEmail(license);
      setEmailMsg(email ? null : 'Keine E-Mail in Mesonic hinterlegt');
      await reloadEvents();
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : 'Mesonic-Abruf fehlgeschlagen');
    } finally {
      setFetchingEmail(false);
    }
  };

  const loadSuggestions = async () => {
    setSuggestions([]);
    setSuggestions(await suggestOffersForLicense(license));
  };
  const doLink = async (offer: OfferSummary) => {
    setBusy(true);
    try {
      await onLinkOffer(license.id, offer);
      setLinkedOffer(offer);
      setSuggestions(null);
      await reloadEvents();
    } finally {
      setBusy(false);
    }
  };
  const doUnlink = async () => {
    setBusy(true);
    try {
      await onUnlinkOffer(license.id);
      setLinkedOffer(null);
      await reloadEvents();
    } finally {
      setBusy(false);
    }
  };

  // Viertl-Benachrichtigung (manuell bestätigt).
  const alreadyNotified = events.find((e) => e.type === 'viertl_notified') ?? null;
  const openNotify = () => {
    setNotifyReason(license.closedReason || license.notes || '');
    setNotifyResult(null);
    setNotifyError(null);
    setNotifyOpen(true);
  };
  const changeCustomerStatus = async (v: ViertlCustomerStatus) => {
    await patch({ customerStatus: v });
    if (v === 'closed') openNotify();       // Schließung erfasst → Viertl-Info anbieten
  };
  const sendNotify = async () => {
    setNotifyBusy(true);
    setNotifyError(null);
    try {
      const reason = notifyReason.trim();
      if (reason && reason !== (license.closedReason || '')) {
        await onPatch(license.id, { closedReason: reason });
      }
      const { to } = await notifyViertlClosure(license.id, reason);
      setNotifyResult(to);
      await reloadEvents();
    } catch (e) {
      setNotifyError(e instanceof Error ? e.message : 'Versand fehlgeschlagen');
    } finally {
      setNotifyBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-slate-800">{license.name}</h2>
            <p className="text-xs text-slate-400">
              {license.contact ? `${license.contact} · ` : ''}Kd. {license.mesonicKdnr}
            </p>
            <p className="text-xs text-slate-400">
              {[license.street, `${license.plz ?? ''} ${license.ort ?? ''}`.trim()].filter(Boolean).join(', ')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <Field label="Status">
            <Select value={license.status} onChange={(v) => void patch({ status: v as ViertlStatus })} options={STATUS_OPTIONS} disabled={busy} />
          </Field>
          <Field label="Kundenstatus">
            <Select value={license.customerStatus} onChange={(v) => void changeCustomerStatus(v as ViertlCustomerStatus)} options={CUSTOMER_OPTIONS} disabled={busy} />
          </Field>

          {(license.customerStatus === 'closing' || license.customerStatus === 'closed') && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              {alreadyNotified ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  Viertl informiert{alreadyNotified.actorName ? ` · ${alreadyNotified.actorName}` : ''} · {new Date(alreadyNotified.createdAt).toLocaleDateString('de-AT')}
                  <button onClick={openNotify} className="ml-auto text-slate-500 underline">Erneut</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-amber-800">Viertl über die Schließung informieren?</span>
                  <button onClick={openNotify} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-700">
                    <Send className="w-3.5 h-3.5" /> Viertl informieren
                  </button>
                </div>
              )}
            </div>
          )}
          <Field label="Wartung">
            <Select value={license.wartung} onChange={(v) => void patch({ wartung: v as ViertlWartung })} options={WARTUNG_OPTIONS} disabled={busy} />
          </Field>

          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Neue Hardware nötig</span>
            <button
              onClick={() => void patch({ hardwareNeeded: !license.hardwareNeeded })}
              disabled={busy}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                license.hardwareNeeded ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {license.hardwareNeeded ? 'Ja' : 'Nein'}
            </button>
          </div>

          <Field label="Hardware-Modell">
            <BlurInput value={license.hardwareModel ?? ''} disabled={busy} onCommit={(v) => void patch({ hardwareModel: v || null })} />
          </Field>
          <Field label="Version">
            <BlurInput value={license.gastrotouchVersion ?? ''} disabled={busy} onCommit={(v) => void patch({ gastrotouchVersion: v || null })} />
          </Field>
          <Field label="E-Mail">
            <div className="flex gap-2">
              <div className="flex-1">
                <BlurInput value={license.email ?? ''} disabled={busy} placeholder="—" onCommit={(v) => void patch({ email: v || null })} />
              </div>
              <button
                onClick={() => void fetchEmail()}
                disabled={busy || fetchingEmail}
                title="Aus Mesonic laden (Kd.Nr → Konto)"
                className="shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {fetchingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="text-xs">Mesonic</span>
              </button>
            </div>
            {emailMsg && <span className="block mt-1 text-xs text-amber-600">{emailMsg}</span>}
          </Field>
          <Field label="Notizen">
            <BlurInput value={license.notes ?? ''} disabled={busy} multiline onCommit={(v) => void patch({ notes: v || null })} />
          </Field>

          {/* Angebot: ATrust-/Hardware-Kosten. Erstellt/versendet wird im
              normalen Angebots-Builder (getrackt); hier nur Verknüpfung +
              Status. */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Angebot</span>
              {license.hardwareNeeded && (
                <span className="inline-flex items-center gap-1 text-xs text-rose-600"><Cpu className="w-3.5 h-3.5" /> neue HW</span>
              )}
            </div>

            {license.linkedOfferId && linkedOffer ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${offerBadge(linkedOffer.status).cls}`}>
                    {offerBadge(linkedOffer.status).label}
                  </span>
                  <span className="text-xs text-slate-500">
                    {linkedOffer.totalOnce ? `€ ${linkedOffer.totalOnce.toLocaleString('de-AT', { minimumFractionDigits: 2 })}` : ''}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {linkedOffer.sentAt ? `Gesendet ${new Date(linkedOffer.sentAt).toLocaleDateString('de-AT')}` : 'Noch nicht gesendet'}
                  {linkedOffer.openedAt ? ` · Geöffnet ${new Date(linkedOffer.openedAt).toLocaleDateString('de-AT')}` : ''}
                </div>
                <div className="mt-2 flex gap-2">
                  {onOpenOffer && (
                    <button onClick={() => onOpenOffer(linkedOffer.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                      <ExternalLink className="w-3.5 h-3.5" /> Öffnen
                    </button>
                  )}
                  <button onClick={() => void doUnlink()} disabled={busy} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
                    Entfernen
                  </button>
                </div>
              </div>
            ) : license.linkedOfferId ? (
              <p className="text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Angebot lädt …</p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {onCreateOffer && (
                    <button onClick={() => onCreateOffer(license)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                      <Plus className="w-3.5 h-3.5" /> Neues Angebot
                    </button>
                  )}
                  <button onClick={() => void loadSuggestions()} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                    <FileText className="w-3.5 h-3.5" /> Bestehendes verknüpfen
                  </button>
                </div>
                {suggestions && (
                  suggestions.length === 0 ? (
                    <p className="text-xs text-slate-400">Keine passenden Angebote (nach Kd.Nr. / E-Mail)</p>
                  ) : (
                    <ul className="space-y-1">
                      {suggestions.map((o) => (
                        <li key={o.id}>
                          <button onClick={() => void doLink(o)} disabled={busy} className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-indigo-50/40 disabled:opacity-40">
                            <span className={`inline-block px-1.5 py-0.5 rounded-full mr-1.5 ${offerBadge(o.status).cls}`}>{offerBadge(o.status).label}</span>
                            {o.customerCompany ?? o.customerEmail ?? o.id.slice(0, 8)}
                            <span className="text-slate-400"> · {new Date(o.createdAt).toLocaleDateString('de-AT')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            )}
          </div>

          {/* Notiz zur Historie */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex gap-2">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveNote(); }}
                placeholder="Notiz zur Historie …"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                onClick={() => void saveNote()}
                disabled={busy || !noteDraft.trim()}
                className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-40"
              >
                Notiz
              </button>
            </div>
          </div>

          {/* Historie */}
          <div className="pt-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Historie</h3>
            {loadingEvents ? (
              <div className="text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
            ) : events.length === 0 ? (
              <p className="text-sm text-slate-400">Noch keine Änderungen</p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li key={ev.id} className="text-xs text-slate-600 border-l-2 border-slate-200 pl-2">
                    <div className="text-slate-400">
                      {new Date(ev.createdAt).toLocaleString('de-AT')}{ev.actorName ? ` · ${ev.actorName}` : ''}
                    </div>
                    <div>
                      {ev.type === 'note'
                        ? ev.message
                        : ev.type === 'field_change'
                        ? <>{fieldLabel(ev.field)}: <span className="text-slate-400 line-through">{ev.oldValue ?? '—'}</span> → <span className="font-medium">{ev.newValue ?? '—'}</span></>
                        : eventActionLabel(ev.type)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Bestätigungsdialog: Viertl über Schließung informieren */}
      {notifyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => { e.stopPropagation(); if (!notifyBusy) setNotifyOpen(false); }}
        >
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Viertl informieren</h3>
            <p className="mt-1 text-xs text-slate-500">
              E-Mail an Viertl, dass <strong>{license.name}</strong> (Kd. {license.mesonicKdnr}) geschlossen hat.
              Empfänger ist die hinterlegte Viertl-Adresse.
            </p>
            {notifyResult ? (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> Gesendet an {notifyResult}
              </div>
            ) : (
              <>
                <label className="block mt-3 text-xs font-medium text-slate-500 mb-1">Grund</label>
                <textarea
                  value={notifyReason}
                  onChange={(e) => setNotifyReason(e.target.value)}
                  rows={3}
                  placeholder="z. B. Betrieb eingestellt / Konkurs / verkauft"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
                {notifyError && <p className="mt-1 text-xs text-rose-600">{notifyError}</p>}
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setNotifyOpen(false)}
                disabled={notifyBusy}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"
              >
                {notifyResult ? 'Schließen' : 'Abbrechen'}
              </button>
              {!notifyResult && (
                <button
                  onClick={() => void sendNotify()}
                  disabled={notifyBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-40"
                >
                  {notifyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Senden
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Input, das erst beim Verlassen (Blur) committet — vermeidet einen
// Update+Audit-Eintrag pro Tastenanschlag.
function BlurInput({
  value,
  onCommit,
  disabled,
  placeholder,
  multiline,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  const cls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50';
  return multiline ? (
    <textarea value={draft} disabled={disabled} placeholder={placeholder} rows={2}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} className={cls} />
  ) : (
    <input value={draft} disabled={disabled} placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} className={cls} />
  );
}
