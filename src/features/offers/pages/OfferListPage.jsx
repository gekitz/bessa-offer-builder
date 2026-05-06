import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlarmClock,
  Archive,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  FileText,
  Loader2,
  Mail,
  MailOpen,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import {
  listOffers,
  deleteOffer,
  getOffer,
  getEmailEvents,
  updateOfferStage,
  markOfferLost,
  listActivities,
  logActivity,
} from '../../../lib/offerApi';
import {
  StatusBadge,
  StageBadge,
  STATUS_CONFIG,
  ActivityKindBadge,
  ActivityOutcomeBadge,
} from '../components/Badges';
import LogActivityModal from '../components/modals/LogActivityModal';
import LostReasonModal from '../components/modals/LostReasonModal';
import OfferDetailsModal from '../components/modals/OfferDetailsModal';
import { lostReasonLabel } from '../data/lostReasons';
import { filterOffersBySearch } from '../lib/offerSearch';
import { bucketize } from '../followUpBuckets';
import { fmt } from '../../../lib/format';

function CreatorDropdown({ value, onChange, creators }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = value !== 'all';
  const label = active ? value : 'Alle';

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function select(v) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium border transition-colors ${active ? 'bg-red-50 text-red-700 border-red-300' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
        style={{ fontSize: 11 }}
      >
        <User size={11} />
        <span className="max-w-[80px] truncate">{label}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 min-w-[160px]">
          <button
            onClick={() => select('all')}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${value === 'all' ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'}`}
            style={{ fontSize: 12 }}
          >
            {value === 'all' && <Check size={12} />}
            <span className={value === 'all' ? 'font-medium' : 'ml-5'}>Alle Ersteller</span>
          </button>
          {creators.map((name) => (
            <button
              key={name}
              onClick={() => select(name)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${value === name ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'}`}
              style={{ fontSize: 12 }}
            >
              {value === name && <Check size={12} />}
              <span className={value === name ? 'font-medium' : 'ml-5'}>{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OfferListPage({ onLoad, onNew, onOpenFollowUps }) {
  const { user, profile } = useAuth();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState('new');
  const [creatorFilter, setCreatorFilter] = useState('all');
  // Free-text search across customer/briefing/creator/Mesonic id.
  // Multi-word ANDs across fields so "müller klagenfurt" narrows
  // both lines of memory.
  const [searchTerm, setSearchTerm] = useState('');
  const [stageLoading, setStageLoading] = useState(null);
  // Verloren routes through a reason modal first. lostTargetId is
  // the offer id pending capture; lostSaving disables the modal
  // while the markOfferLost API call is in flight.
  const [lostTargetId, setLostTargetId] = useState(null);
  const [lostSaving, setLostSaving] = useState(false);
  // OfferDetailsModal state. The list query doesn't include the
  // offer_data JSONB blob (cart, items, notes), so we lazy-load the
  // full row when the rep opens the details modal.
  const [detailsOffer, setDetailsOffer] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [logTargetId, setLogTargetId] = useState(null);
  const [logSaving, setLogSaving] = useState(false);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOffers();
      setOffers(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  async function handleDelete(id) {
    if (!confirm('Angebot wirklich löschen?')) return;
    try {
      await deleteOffer(id);
      setOffers((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message);
    }
  }

  async function openDetailsModal(id) {
    // Snapshot the list-row data as a placeholder so the modal can
    // render the customer card / status while offer_data is in
    // flight, then fill in the rest when getOffer resolves.
    const listRow = offers.find((o) => o.id === id) || null;
    setDetailsOffer(listRow);
    setDetailsLoading(true);
    try {
      // Load the full offer + activities + email events in parallel
      // so the modal can show all of them at once. The expanded-row
      // panel may already have these in its own state but the modal
      // is a separate consumer, so we load fresh to keep coupling
      // minimal.
      const [full, acts, evts] = await Promise.all([
        getOffer(id),
        listActivities(id).catch(() => []),
        getEmailEvents(id).catch(() => []),
      ]);
      setDetailsOffer(full);
      setActivities(acts || []);
      setEvents(evts || []);
    } catch (err) {
      alert('Fehler beim Laden der Details: ' + err.message);
      setDetailsOffer(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function showDetail(id) {
    if (detailId === id) {
      setDetailId(null);
      return;
    }
    setDetailId(id);
    setEventsLoading(true);
    setActivitiesLoading(true);
    try {
      const [evts, acts] = await Promise.all([
        getEmailEvents(id).catch(() => []),
        listActivities(id).catch(() => []),
      ]);
      setEvents(evts || []);
      setActivities(acts || []);
    } finally {
      setEventsLoading(false);
      setActivitiesLoading(false);
    }
  }

  async function handleLogActivity(draft) {
    if (!logTargetId) return;
    setLogSaving(true);
    try {
      const created = await logActivity(logTargetId, {
        kind: draft.kind,
        outcome: draft.outcome,
        note: draft.note,
        nextFollowupAt: draft.nextFollowupAt,
        createdById: user?.id || null,
        createdByName: profile?.mesonic_rep_name || user?.email || null,
      });
      // Mirror the trigger's effect locally so the UI updates without a refetch.
      setOffers((os) => os.map((o) => (
        o.id === logTargetId
          ? { ...o, last_activity_at: created.created_at, next_followup_at: created.next_followup_at }
          : o
      )));
      if (detailId === logTargetId) {
        setActivities((prev) => [created, ...prev]);
      }
      setLogTargetId(null);
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message);
    } finally {
      setLogSaving(false);
    }
  }

  async function handleStageChange(id, newStage) {
    // Verloren goes through LostReasonModal so we capture WHY the
    // deal was lost. Routing it through this generic handler would
    // skip the categorical reason and break the analytics, so guard it.
    if (newStage === 'lost') {
      setLostTargetId(id);
      return;
    }
    setStageLoading(id);
    const prev = offers.find((o) => o.id === id)?.stage;
    setOffers((os) => os.map((o) => (o.id === id ? { ...o, stage: newStage } : o)));
    try {
      await updateOfferStage(id, newStage);
    } catch (err) {
      setOffers((os) => os.map((o) => (o.id === id ? { ...o, stage: prev } : o)));
      alert('Fehler: ' + err.message);
    } finally {
      setStageLoading(null);
    }
  }

  async function handleMarkLost(draft) {
    if (!lostTargetId) return;
    setLostSaving(true);
    const targetId = lostTargetId;
    const prev = offers.find((o) => o.id === targetId)?.stage;
    setOffers((os) => os.map((o) => (
      o.id === targetId
        ? { ...o, stage: 'lost', lost_reason: draft.reason, lost_reason_note: draft.note || null }
        : o
    )));
    try {
      await markOfferLost(targetId, { reason: draft.reason, note: draft.note });
      setLostTargetId(null);
    } catch (err) {
      setOffers((os) => os.map((o) => (o.id === targetId ? { ...o, stage: prev } : o)));
      alert('Fehler: ' + err.message);
    } finally {
      setLostSaving(false);
    }
  }

  // Apply search before the creator/stage filters so the stage tab
  // counts reflect what the rep is actually narrowing toward — if
  // they typed "müller" and 3 of those 4 matches are "Gesendet", the
  // tabs should show that immediately.
  const searched = useMemo(() => filterOffersBySearch(offers, searchTerm), [offers, searchTerm]);
  const creatorFiltered = creatorFilter === 'all' ? searched : searched.filter((o) => o.creator_name === creatorFilter);
  const filteredOffers = stageFilter === 'all' ? creatorFiltered : creatorFiltered.filter((o) => o.stage === stageFilter);
  const stageCounts = { all: creatorFiltered.length };
  for (const s of ['new', 'offer_sent', 'closed', 'lost']) {
    stageCounts[s] = creatorFiltered.filter((o) => o.stage === s).length;
  }
  const uniqueCreators = [...new Set(offers.map((o) => o.creator_name).filter(Boolean))].sort();
  const closedMonthly = offers.filter((o) => o.stage === 'closed').reduce((sum, o) => sum + Number(o.total_monthly || 0), 0);
  // Bounced count across the whole dataset (independent of the
  // current stage filter) so reps see "✉ 3 unzustellbar" even when
  // they're scoped to "Neu" — those offers might be in any stage.
  const bouncedCount = offers.filter((o) => o.status === 'bounced').length;
  const buckets = useMemo(() => bucketize(creatorFiltered), [creatorFiltered]);
  const followUpCount = buckets.overdue.length + buckets.dueToday.length + buckets.stale.length;
  const logTarget = logTargetId ? offers.find((o) => o.id === logTargetId) : null;

  if (!supabase) {
    return (
      <div className="text-center py-12 text-slate-400">
        <AlertCircle size={48} className="mx-auto mb-3 opacity-50" />
        <p className="font-medium">Supabase nicht konfiguriert</p>
        <p style={{ fontSize: 13 }}>Setze VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in der .env Datei.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
        <p style={{ fontSize: 13 }}>Angebote laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-400">
        <AlertCircle size={32} className="mx-auto mb-3" />
        <p className="font-medium">Fehler: {error}</p>
        <button onClick={fetchOffers} className="mt-3 text-sm text-red-600 underline">Erneut versuchen</button>
      </div>
    );
  }

  const EVENT_ICON = {
    sent: <Send size={12} className="text-blue-500" />,
    delivered: <CheckCircle2 size={12} className="text-green-500" />,
    opened: <MailOpen size={12} className="text-yellow-500" />,
    clicked: <Eye size={12} className="text-purple-500" />,
    bounced: <XCircle size={12} className="text-red-500" />,
  };

  return (
    <>
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Archive size={16} className="text-red-600 flex-shrink-0" />
          <span className="font-bold text-slate-700" style={{ fontSize: 14 }}>Angebote</span>
          <span className="text-slate-400" style={{ fontSize: 12 }}>({offers.length})</span>
          <button onClick={fetchOffers} className="rounded-lg bg-slate-100 text-slate-600 p-1.5 hover:bg-slate-200 transition-colors flex-shrink-0 ml-1" title="Aktualisieren">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onOpenFollowUps && followUpCount > 0 && (
            <button
              onClick={onOpenFollowUps}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex-shrink-0"
              style={{ fontSize: 12 }}
              title="Follow-ups öffnen"
            >
              <Phone size={12} />
              <span className="hidden sm:inline">Follow-ups</span>
              <span className="rounded-full bg-blue-600 text-white px-1.5 font-semibold" style={{ fontSize: 10, minWidth: 16, textAlign: 'center' }}>
                {followUpCount}
              </span>
            </button>
          )}
          {uniqueCreators.length > 1 && (
            <CreatorDropdown
              value={creatorFilter}
              onChange={setCreatorFilter}
              creators={uniqueCreators}
            />
          )}
          <button onClick={onNew} className="rounded-lg bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 transition-colors flex items-center gap-1 flex-shrink-0" style={{ fontSize: 12 }}>
            <Plus size={13} /> <span className="hidden sm:inline">Neues</span> Angebot
          </button>
        </div>
      </div>

      {/* Search bar — searches customer / briefing / creator / Mesonic-ID */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Suchen — Kunde, Briefing, Ersteller, Adresse, Mesonic-Nr…"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 py-2 text-slate-800 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          style={{ fontSize: 13 }}
          aria-label="Angebote durchsuchen"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1 transition-colors"
            aria-label="Suche leeren"
            title="Suche leeren"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Stage filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          { key: 'all', label: 'Alle' },
          { key: 'new', label: 'Neu' },
          { key: 'offer_sent', label: 'Gesendet' },
          { key: 'closed', label: 'Abgeschlossen' },
          { key: 'lost', label: 'Verloren' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setStageFilter(t.key)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${stageFilter === t.key ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            style={{ fontSize: 11 }}
          >
            {t.label} ({stageCounts[t.key] || 0})
          </button>
        ))}
      </div>

      {/* Bounced summary — only shown when there's something to act
          on. Clicking the chip scopes the search to bounced offers
          via a magic token so the page filter logic doesn't need a
          new field. */}
      {bouncedCount > 0 && (
        <div className="flex items-center gap-2 mb-3 rounded-lg bg-red-50 border-2 border-red-200 px-3 py-2">
          <AlertCircle size={14} className="text-red-600 flex-shrink-0" />
          <span className="font-medium text-red-700" style={{ fontSize: 12 }}>
            {bouncedCount} {bouncedCount === 1 ? 'Angebot' : 'Angebote'} mit unzustellbarer E-Mail
          </span>
          <span className="text-red-600 ml-auto" style={{ fontSize: 11 }}>
            Adresse prüfen &amp; neu senden
          </span>
        </div>
      )}

      {/* Closed value summary */}
      {closedMonthly > 0 && (
        <div className="flex items-center gap-2 mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span className="font-medium text-emerald-700" style={{ fontSize: 12 }}>
            Abgeschlossen: &euro; {fmt(closedMonthly)}/Mo
          </span>
        </div>
      )}

      {filteredOffers.length === 0 ? (
        searchTerm.trim() ? (
          <div className="text-center py-12 text-slate-400">
            <Search size={40} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium text-slate-600">Keine Treffer</p>
            <p style={{ fontSize: 13 }}>
              Keine Angebote für „{searchTerm}".
            </p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-3 text-red-600 underline hover:text-red-700"
              style={{ fontSize: 12 }}
            >
              Suche zurücksetzen
            </button>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <FileText size={48} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium">Noch keine Angebote</p>
            <p style={{ fontSize: 13 }}>Erstelle ein Angebot und speichere es hier.</p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {filteredOffers.map((o) => (
            <div
              key={o.id}
              className={`bg-white rounded-xl border-2 overflow-hidden transition-colors ${
                o.status === 'bounced'
                  ? 'border-red-400 ring-2 ring-red-100'
                  : detailId === o.id
                    ? 'border-red-200 shadow-sm'
                    : 'border-slate-200'
              }`}
            >
              {/* Loud bounce warning — full-width banner above the
                  collapsed row so a wrong customer email is the
                  first thing the rep sees, not a tiny pill. */}
              {o.status === 'bounced' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white" style={{ fontSize: 12 }}>
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span className="font-semibold">E-Mail unzustellbar</span>
                  {o.customer_email && (
                    <span className="opacity-90 truncate" title={o.customer_email}>
                      <span className="line-through">{o.customer_email}</span>
                    </span>
                  )}
                  <span className="ml-auto opacity-80 hidden sm:inline">→ Adresse prüfen &amp; neu senden</span>
                </div>
              )}

              {/* Collapsed row — three discrete intents:
                    • Tap row body  → open Info modal (read-only deep view)
                    • Tap chevron   → expand inline action panel
                    • Tap Laden     → load offer to edit
                  Each action uses stopPropagation so they don't
                  cascade into the row's primary tap handler. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => openDetailsModal(o.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDetailsModal(o.id);
                  }
                }}
                aria-label={`Details zu ${o.customer_company || o.customer_name || 'Angebot'} öffnen`}
                className="w-full text-left p-3 hover:bg-slate-50/60 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-100 focus:ring-inset"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate" style={{ fontSize: 13 }}>
                      {o.customer_company || o.customer_name || 'Ohne Name'}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5" style={{ fontSize: 10 }}>
                      {/* One context-aware chip per row.
                          For 'offer_sent' offers the email status
                          (Gelesen / Zugestellt / Unzustellbar) is
                          more informative than the literal stage
                          label, which would just say "Angebot
                          gesendet" — redundant with the rep already
                          looking at the Gesendet tab. For every
                          other stage we show the stage label. */}
                      {o.stage === 'offer_sent'
                        ? <StatusBadge status={o.status} />
                        : <StageBadge stage={o.stage} />}
                      {o.stage === 'lost' && lostReasonLabel(o.lost_reason) && (
                        <span
                          className="inline-flex items-center gap-0.5 text-red-700 bg-red-50 border border-red-100 rounded-full px-1.5 py-0.5"
                          title={o.lost_reason_note || lostReasonLabel(o.lost_reason)}
                        >
                          <XCircle size={9} />
                          {lostReasonLabel(o.lost_reason)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-slate-400 truncate" style={{ fontSize: 11 }}>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <Calendar size={11} />
                        {new Date(o.updated_at).toLocaleDateString('de-AT')}
                      </span>
                      {o.creator_name && <span className="truncate">{o.creator_name}</span>}
                      <FollowUpHint offer={o} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {o.total_monthly > 0 && (
                      <div className="font-semibold text-slate-800 whitespace-nowrap" style={{ fontSize: 13 }}>€ {fmt(Number(o.total_monthly))}/Mo</div>
                    )}
                    {o.total_once > 0 && (
                      <div className="text-slate-500 whitespace-nowrap" style={{ fontSize: 11 }}>€ {fmt(Number(o.total_once))} einm.</div>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onLoad(o.id); }}
                        className="flex items-center gap-1 rounded-lg bg-red-50 text-red-700 px-2 py-1 hover:bg-red-100 transition-colors font-medium"
                        style={{ fontSize: 11 }}
                        title="Angebot laden"
                      >
                        <FileText size={12} /> Laden
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); showDetail(o.id); }}
                        className="rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1 transition-colors"
                        title={detailId === o.id ? 'Aktionen ausblenden' : 'Aktionen anzeigen'}
                        aria-expanded={detailId === o.id}
                        aria-label="Aktionen anzeigen"
                      >
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${detailId === o.id ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded panel: action bar + activity timeline + email events */}
              {detailId === o.id && (
                <div className="border-t border-slate-200 bg-slate-50/70">
                  {/* Action bar — all secondary actions live here so
                      the collapsed row stays clean. Grouped left→right:
                      utility · CRM · stage transitions · danger. */}
                  <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-200 bg-white">
                    {/* Info is intentionally NOT here — row-tap on
                        the collapsed cell opens the Info modal
                        directly, which is the same intent. The
                        action panel is dedicated to mutations. */}
                    <button
                      onClick={() => onLoad(o.id, true)}
                      className="flex items-center gap-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-1.5 hover:bg-slate-100 transition-colors"
                      style={{ fontSize: 11 }}
                    >
                      <Copy size={12} /> Duplizieren
                    </button>
                    {(o.stage === 'offer_sent' || o.stage === 'new') && (
                      <button
                        onClick={() => setLogTargetId(o.id)}
                        className="flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1.5 hover:bg-blue-100 transition-colors"
                        style={{ fontSize: 11 }}
                      >
                        <Phone size={12} /> Kontakt
                      </button>
                    )}

                    {/* Visual divider before stage transitions */}
                    <span className="w-px h-5 bg-slate-200 mx-1" aria-hidden="true" />

                    {o.stage === 'new' && (
                      <button
                        disabled={stageLoading === o.id}
                        onClick={() => handleStageChange(o.id, 'offer_sent')}
                        className="flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1.5 hover:bg-blue-100 transition-colors disabled:opacity-50"
                        style={{ fontSize: 11 }}
                      >
                        <Send size={12} /> Gesendet
                      </button>
                    )}
                    {o.stage !== 'closed' && (
                      <button
                        disabled={stageLoading === o.id}
                        onClick={() => handleStageChange(o.id, 'closed')}
                        className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        style={{ fontSize: 11 }}
                      >
                        <CheckCircle2 size={12} /> Abschließen
                      </button>
                    )}
                    {(o.stage === 'new' || o.stage === 'offer_sent') && (
                      <button
                        disabled={stageLoading === o.id}
                        onClick={() => handleStageChange(o.id, 'lost')}
                        className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 border border-red-200 px-2.5 py-1.5 hover:bg-red-100 transition-colors disabled:opacity-50"
                        style={{ fontSize: 11 }}
                      >
                        <XCircle size={12} /> Verloren
                      </button>
                    )}
                    {(o.stage === 'closed' || o.stage === 'lost') && (
                      <button
                        disabled={stageLoading === o.id}
                        onClick={() => handleStageChange(o.id, 'new')}
                        className="flex items-center gap-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1.5 hover:bg-slate-200 transition-colors disabled:opacity-50"
                        style={{ fontSize: 11 }}
                      >
                        <RefreshCw size={12} /> Reaktivieren
                      </button>
                    )}

                    {/* Danger action — pushed to the right so it
                        doesn't sit next to constructive buttons. */}
                    <button
                      onClick={() => handleDelete(o.id)}
                      className="ml-auto flex items-center gap-1 rounded-lg bg-white text-red-500 border border-red-100 px-2.5 py-1.5 hover:bg-red-50 transition-colors"
                      style={{ fontSize: 11 }}
                      title="Angebot löschen"
                    >
                      <Trash2 size={12} /> Löschen
                    </button>
                  </div>

                  {/* Activity timeline + email events live below the
                      action bar, inside the same expanded panel. */}
                  <div className="px-3 py-3 space-y-3">
                    <ActivityTimeline activities={activities} loading={activitiesLoading} />
                    <div>
                      <div className="font-semibold text-slate-600 mb-1" style={{ fontSize: 11 }}>E-Mail Verlauf</div>
                      {eventsLoading ? (
                        <div className="text-slate-400 text-center py-2"><Loader2 size={14} className="animate-spin mx-auto" /></div>
                      ) : events.length === 0 ? (
                        <div className="space-y-1">
                          {o.sent_at && (
                            <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
                              <Send size={12} className="text-blue-500" />
                              <span className="text-slate-600 font-medium">Gesendet</span>
                              <span className="text-slate-400">{new Date(o.sent_at).toLocaleString('de-AT')}</span>
                            </div>
                          )}
                          {o.opened_at && (
                            <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
                              <MailOpen size={12} className="text-yellow-500" />
                              <span className="text-slate-600 font-medium">Gelesen</span>
                              <span className="text-slate-400">{new Date(o.opened_at).toLocaleString('de-AT')}</span>
                            </div>
                          )}
                          {!o.sent_at && !o.opened_at && (
                            <div className="text-slate-400" style={{ fontSize: 11 }}>Noch keine E-Mail-Events</div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {events.map((evt, i) => (
                            <div key={evt.id || i} className="flex items-center gap-2" style={{ fontSize: 11 }}>
                              {EVENT_ICON[evt.event_type] || <Mail size={12} className="text-slate-400" />}
                              <span className="text-slate-600 font-medium">{STATUS_CONFIG[evt.event_type]?.label || evt.event_type}</span>
                              <span className="text-slate-400">{new Date(evt.occurred_at).toLocaleString('de-AT')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    {logTarget && (
      <LogActivityModal
        customerLabel={logTarget.customer_company || logTarget.customer_name || 'Ohne Name'}
        onSubmit={handleLogActivity}
        onClose={() => !logSaving && setLogTargetId(null)}
        saving={logSaving}
      />
    )}
    {lostTargetId && (() => {
      const t = offers.find((o) => o.id === lostTargetId);
      if (!t) return null;
      return (
        <LostReasonModal
          customerLabel={t.customer_company || t.customer_name || 'Ohne Name'}
          onSubmit={handleMarkLost}
          onClose={() => !lostSaving && setLostTargetId(null)}
          saving={lostSaving}
        />
      );
    })()}
    {detailsOffer && (
      <OfferDetailsModal
        offer={detailsOffer}
        activities={activities}
        events={events}
        activitiesLoading={detailsLoading && activities.length === 0}
        eventsLoading={detailsLoading && events.length === 0}
        loading={detailsLoading}
        onEdit={() => {
          // Load the offer into the builder + close the modal in
          // one tap. The list-row's primary tap intent is "show me
          // what this is" (Info), so providing an explicit Edit
          // affordance inside the modal completes the flow.
          const id = detailsOffer.id;
          setDetailsOffer(null);
          setDetailsLoading(false);
          onLoad(id);
        }}
        onClose={() => { setDetailsOffer(null); setDetailsLoading(false); }}
      />
    )}
    </>
  );
}

function FollowUpHint({ offer }) {
  if (offer.next_followup_at) {
    const due = new Date(offer.next_followup_at);
    const now = new Date();
    const overdue = due.getTime() < now.getTime();
    return (
      <span className={`flex items-center gap-1 ${overdue ? 'text-red-600' : 'text-blue-600'}`}>
        <AlarmClock size={11} />
        {overdue ? 'überfällig: ' : 'fällig: '}
        {due.toLocaleDateString('de-AT')}
      </span>
    );
  }
  if (offer.last_activity_at) {
    return (
      <span className="flex items-center gap-1 text-slate-500">
        <Phone size={11} />
        Kontakt {new Date(offer.last_activity_at).toLocaleDateString('de-AT')}
      </span>
    );
  }
  return null;
}

function ActivityTimeline({ activities, loading }) {
  if (loading) {
    return (
      <div>
        <div className="font-semibold text-slate-600 mb-1" style={{ fontSize: 11 }}>Kontaktverlauf</div>
        <div className="text-slate-400 text-center py-2"><Loader2 size={14} className="animate-spin mx-auto" /></div>
      </div>
    );
  }
  if (!activities || activities.length === 0) {
    return (
      <div>
        <div className="font-semibold text-slate-600 mb-1" style={{ fontSize: 11 }}>Kontaktverlauf</div>
        <div className="text-slate-400" style={{ fontSize: 11 }}>Noch keine Kontakte protokolliert.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="font-semibold text-slate-600 mb-1" style={{ fontSize: 11 }}>Kontaktverlauf</div>
      <div className="space-y-1.5">
        {activities.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1" style={{ fontSize: 11 }}>
            <ActivityKindBadge kind={a.kind} />
            {a.outcome && <ActivityOutcomeBadge outcome={a.outcome} />}
            <span className="text-slate-400">
              {new Date(a.created_at).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
            {a.created_by_name && <span className="text-slate-400">· {a.created_by_name}</span>}
            {a.next_followup_at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">
                <AlarmClock size={11} />
                {new Date(a.next_followup_at).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
            {a.note && <span className="text-slate-600">{a.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
