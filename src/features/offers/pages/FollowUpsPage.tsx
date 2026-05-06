import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  Flame,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../../../lib/auth';
import {
  getRecentOpenCounts,
  listOffers,
  logActivity,
  markOfferLost,
  sendFollowup,
  updateOfferStage,
} from '../../../lib/offerApi';
import { fmt } from '../../../lib/format';
import { bucketize, STALE_AFTER_DAYS, type OfferLike } from '../followUpBuckets';
import LogActivityModal, { type ActivityDraft } from '../components/modals/LogActivityModal';
import LostReasonModal, { type LostReasonDraft } from '../components/modals/LostReasonModal';
import SendFollowupModal, { type SendFollowupDraft } from '../components/modals/SendFollowupModal';

// Dedicated workspace for following up on sent offers. Buckets are
// the same as the in-list Hub (overdue / due today / stale) but get
// the whole viewport plus filters (creator, deal-value floor, search).
//
// On top of bucketize() we add a "Heiße Spur" bucket sourced from
// recent open counts: offers with > 2 opens in the last 7 days are
// the strongest buy signal we have, and they jump above Überfällig.

// Threshold for the Heiße Spur bucket. The original spec was "more
// than 2 opens in 7 days", i.e. >= 3.
const HOT_TRAIL_OPEN_THRESHOLD = 3;
const HOT_TRAIL_LOOKBACK_DAYS = 7;

interface OfferRow extends OfferLike {
  customer_name?: string | null;
  customer_company?: string | null;
  customer_email?: string | null;
  creator_id?: string | null;
  creator_name?: string | null;
  creator_email?: string | null;
  email_subject?: string | null;
  briefing?: string | null;
  total_once?: number | string | null;
  pdf_path?: string | null;
  share_code?: string | null;
}

type ValueFilterKey = 'all' | '1k' | '5k' | '10k';

const VALUE_FILTERS: { key: ValueFilterKey; label: string; min?: number }[] = [
  { key: 'all',  label: 'Alle Werte' },
  { key: '1k',   label: '€ 1k+',   min: 1000 },
  { key: '5k',   label: '€ 5k+',   min: 5000 },
  { key: '10k',  label: '€ 10k+',  min: 10000 },
];

interface CreatorFilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  creators: string[];
}

function CreatorFilterDropdown({ value, onChange, creators }: CreatorFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const active = value !== 'all';
  const label = active ? value : 'Alle Ersteller';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium border transition-colors ${active ? 'bg-red-50 text-red-700 border-red-300' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        style={{ fontSize: 12 }}
      >
        <User size={12} />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 min-w-[180px]">
            <button
              onClick={() => { onChange('all'); setOpen(false); }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${value === 'all' ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'}`}
              style={{ fontSize: 12 }}
            >
              {value === 'all' && <Check size={12} />}
              <span className={value === 'all' ? 'font-medium' : 'ml-5'}>Alle Ersteller</span>
            </button>
            {creators.map((name) => (
              <button
                key={name}
                onClick={() => { onChange(name); setOpen(false); }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${value === name ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'}`}
                style={{ fontSize: 12 }}
              >
                {value === name && <Check size={12} />}
                <span className={value === name ? 'font-medium' : 'ml-5'}>{name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type BucketTone = 'red' | 'amber' | 'blue' | 'pink';

interface BucketSectionProps {
  tone: BucketTone;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  offers: OfferRow[];
  opensByOfferId: Map<string, number>;
  onLog: (offerId: string) => void;
  onFollowup: (offerId: string) => void;
  onLoad: (offerId: string) => void;
  onChangeStage: (offerId: string, stage: 'closed' | 'lost') => void;
  stageBusyId?: string | null;
  defaultOpen?: boolean;
}

function BucketSection({ tone, icon, title, subtitle, offers, opensByOfferId, onLog, onFollowup, onLoad, onChangeStage, stageBusyId, defaultOpen = true }: BucketSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const toneCls: Record<BucketTone, string> = {
    red:   'border-red-200 bg-red-50',
    amber: 'border-amber-200 bg-amber-50',
    blue:  'border-blue-200 bg-blue-50',
    pink:  'border-pink-300 bg-pink-50',
  };
  const cls = toneCls[tone] || 'border-slate-200 bg-slate-50';

  if (offers.length === 0) {
    return (
      <div className={`rounded-xl border-2 ${cls} p-3`}>
        <div className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12 }}>
          {icon}
          <span className="font-semibold">{title}</span>
          <span className="text-slate-400">— keine</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${cls}`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2.5">
        {icon}
        <span className="font-semibold text-slate-800" style={{ fontSize: 14 }}>{title}</span>
        <span className="rounded-full bg-white/80 px-2 py-0.5 font-semibold text-slate-700" style={{ fontSize: 11 }}>{offers.length}</span>
        <span className="text-slate-500 truncate" style={{ fontSize: 11 }}>{subtitle}</span>
        <ChevronDown size={14} className={`ml-auto text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-white/60 divide-y divide-white/60 bg-white/40">
          {offers.map((o) => (
            <FollowUpRow
              key={o.id}
              offer={o}
              opens={opensByOfferId.get(o.id) || 0}
              onLog={onLog}
              onFollowup={onFollowup}
              onLoad={onLoad}
              onChangeStage={onChangeStage}
              stageBusy={stageBusyId === o.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FollowUpRowProps {
  offer: OfferRow;
  opens: number;
  onLog: (offerId: string) => void;
  onFollowup: (offerId: string) => void;
  onLoad: (offerId: string) => void;
  onChangeStage: (offerId: string, stage: 'closed' | 'lost') => void;
  stageBusy?: boolean;
}

function FollowUpRow({ offer, opens, onLog, onFollowup, onLoad, onChangeStage, stageBusy }: FollowUpRowProps) {
  const due = offer.next_followup_at ? new Date(offer.next_followup_at) : null;
  const sent = offer.sent_at ? new Date(offer.sent_at) : null;
  return (
    <div className="px-3 py-2.5 space-y-2">
      {/* Top: customer info on the left, value on the right.
          Single horizontal row that fits comfortably on a phone — the
          actions live on their own row below so they don't fight for
          width with the customer name. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 truncate flex items-center gap-2" style={{ fontSize: 13 }}>
            <span className="truncate">{offer.customer_company || offer.customer_name || 'Ohne Name'}</span>
            {opens > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-pink-100 text-pink-700 px-1.5 py-0.5 font-medium flex-shrink-0" style={{ fontSize: 10 }} title={`${opens}× geöffnet in den letzten ${HOT_TRAIL_LOOKBACK_DAYS} Tagen`}>
                <Eye size={10} /> {opens}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 mt-0.5" style={{ fontSize: 11 }}>
            {due && (
              <span className="flex items-center gap-1">
                <AlarmClock size={11} />
                Fällig {due.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
            {!due && sent && <span>Gesendet {sent.toLocaleDateString('de-AT')}</span>}
            {offer.creator_name && <span className="text-slate-400">{offer.creator_name}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0" style={{ fontSize: 11 }}>
          {Number(offer.total_monthly) > 0 && (
            <div className="font-semibold text-slate-700 whitespace-nowrap" style={{ fontSize: 12 }}>€ {fmt(Number(offer.total_monthly))}/Mo</div>
          )}
          {Number(offer.total_period) > 0 && Number(offer.total_monthly) === 0 && (
            <div className="text-slate-500 whitespace-nowrap">€ {fmt(Number(offer.total_period))}</div>
          )}
        </div>
      </div>

      {/* Bottom: action buttons. Icon-only on mobile to fit all 5
          on one row; labels expand on sm+ where there's room. Each
          button has an aria-label/title so the icon-only state stays
          accessible. Öffnen ml-auto separates "open the offer" from
          the CRM-state actions. */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        <button
          onClick={() => onLog(offer.id)}
          className="flex items-center gap-1 rounded-lg bg-blue-600 text-white p-2 sm:px-2.5 sm:py-1 hover:bg-blue-700 transition-colors"
          style={{ fontSize: 11 }}
          aria-label="Kontakt"
          title="Anruf / Notiz protokollieren"
        >
          <Phone size={14} /> <span className="hidden sm:inline">Kontakt</span>
        </button>
        <button
          onClick={() => onFollowup(offer.id)}
          className="flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 p-2 sm:px-2.5 sm:py-1 hover:bg-blue-100 transition-colors"
          style={{ fontSize: 11 }}
          aria-label="Folgemail"
          title="Folgemail senden"
        >
          <Mail size={14} /> <span className="hidden sm:inline">Folgemail</span>
        </button>
        <button
          onClick={() => onChangeStage(offer.id, 'closed')}
          disabled={stageBusy}
          className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 p-2 sm:px-2.5 sm:py-1 hover:bg-emerald-100 transition-colors disabled:opacity-50"
          style={{ fontSize: 11 }}
          aria-label="Gewonnen"
          title="Als gewonnen markieren"
        >
          <CheckCircle2 size={14} /> <span className="hidden sm:inline">Gewonnen</span>
        </button>
        <button
          onClick={() => onChangeStage(offer.id, 'lost')}
          disabled={stageBusy}
          className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 border border-red-200 p-2 sm:px-2.5 sm:py-1 hover:bg-red-100 transition-colors disabled:opacity-50"
          style={{ fontSize: 11 }}
          aria-label="Verloren"
          title="Als verloren markieren"
        >
          <XCircle size={14} /> <span className="hidden sm:inline">Verloren</span>
        </button>
        <button
          onClick={() => onLoad(offer.id)}
          className="ml-auto flex items-center gap-1 rounded-lg bg-white text-slate-600 border border-slate-200 p-2 sm:px-2.5 sm:py-1 hover:bg-slate-50 transition-colors"
          style={{ fontSize: 11 }}
          aria-label="Öffnen"
          title="Angebot öffnen"
        >
          <FileText size={14} /> <span className="hidden sm:inline">Öffnen</span>
        </button>
      </div>
    </div>
  );
}

export interface FollowUpsPageProps {
  onBack: () => void;
  onLoad: (offerId: string) => void;
  // When set, the page auto-opens SendFollowupModal for this offer
  // once data has loaded. Used by the digest deep-link in App-level
  // routing — the parent clears it via onAutoOpenConsumed so the
  // modal doesn't reopen when the user navigates back manually.
  autoOpenFollowupOfferId?: string | null;
  onAutoOpenConsumed?: () => void;
}

interface AuthShape {
  user: { id: string; email?: string | null } | null;
  profile: { mesonic_rep_name?: string | null } | null;
}

export default function FollowUpsPage({ onBack, onLoad, autoOpenFollowupOfferId, onAutoOpenConsumed }: FollowUpsPageProps) {
  const { user, profile } = useAuth() as AuthShape;
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [opensByOfferId, setOpensByOfferId] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatorFilter, setCreatorFilter] = useState<string>('all');
  const [valueFilter, setValueFilter] = useState<ValueFilterKey>('all');
  const [logTargetId, setLogTargetId] = useState<string | null>(null);
  const [logSaving, setLogSaving] = useState(false);
  const [followupTargetId, setFollowupTargetId] = useState<string | null>(null);
  const [followupSaving, setFollowupSaving] = useState(false);
  const [stageBusyId, setStageBusyId] = useState<string | null>(null);
  // Verloren now goes through a reason modal first. The id is the
  // offer pending a "why" capture; lostSaving is true while the
  // markOfferLost call is in flight so the modal can disable inputs.
  const [lostTargetId, setLostTargetId] = useState<string | null>(null);
  const [lostSaving, setLostSaving] = useState(false);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch offers and recent open counts in parallel — they're
      // independent and the opens query is cheap (one indexed scan).
      // If opens fails we still want to render the page, so we
      // swallow that error and degrade to empty counts.
      const [offerRows, opens] = await Promise.all([
        listOffers(),
        getRecentOpenCounts(HOT_TRAIL_LOOKBACK_DAYS).catch((err) => {
          console.warn('FollowUpsPage: getRecentOpenCounts failed, falling back to empty', err);
          return new Map<string, number>();
        }),
      ]);
      setOffers((offerRows as OfferRow[]) || []);
      setOpensByOfferId(opens);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  // Digest deep-link consumer: when the parent passes an offer id
  // and offers have loaded, open SendFollowupModal for it. We only
  // open if the offer actually exists in the list — a stale digest
  // link to a closed/lost offer should fizzle quietly, not crash.
  useEffect(() => {
    if (!autoOpenFollowupOfferId) return;
    if (loading) return;
    const exists = offers.some((o) => o.id === autoOpenFollowupOfferId);
    if (exists) {
      setFollowupTargetId(autoOpenFollowupOfferId);
    }
    onAutoOpenConsumed?.();
  }, [autoOpenFollowupOfferId, loading, offers, onAutoOpenConsumed]);

  const uniqueCreators = useMemo<string[]>(
    () => [...new Set(offers.map((o) => o.creator_name).filter((n): n is string => Boolean(n)))].sort(),
    [offers],
  );

  const filtered = useMemo(() => {
    let list = offers;
    if (creatorFilter !== 'all') list = list.filter((o) => o.creator_name === creatorFilter);
    if (valueFilter !== 'all') {
      const cfg = VALUE_FILTERS.find((v) => v.key === valueFilter);
      const min = cfg?.min ?? 0;
      list = list.filter((o) => Number(o.total_period || o.total_monthly || 0) >= min);
    }
    return list;
  }, [offers, creatorFilter, valueFilter]);

  // Heiße Spur is computed BEFORE bucketize(): an offer that's been
  // opened ≥3× in the last 7 days is a buy signal, regardless of
  // whether it's also overdue or stale. We pull it out so it gets
  // its own (visually loud) section above everything else and
  // doesn't get double-counted in the time-based buckets below.
  const hotTrail = useMemo<OfferRow[]>(() => {
    return filtered
      .filter((o) => o.stage === 'offer_sent')
      .filter((o) => (opensByOfferId.get(o.id) || 0) >= HOT_TRAIL_OPEN_THRESHOLD)
      .sort((a, b) => (opensByOfferId.get(b.id) || 0) - (opensByOfferId.get(a.id) || 0));
  }, [filtered, opensByOfferId]);

  const hotTrailIds = useMemo(() => new Set(hotTrail.map((o) => o.id)), [hotTrail]);
  const filteredForBuckets = useMemo(
    () => filtered.filter((o) => !hotTrailIds.has(o.id)),
    [filtered, hotTrailIds],
  );

  const buckets = useMemo(() => bucketize(filteredForBuckets), [filteredForBuckets]);
  const totalCount = hotTrail.length + buckets.overdue.length + buckets.dueToday.length + buckets.stale.length;
  const logTarget = logTargetId ? offers.find((o) => o.id === logTargetId) : null;
  const followupTarget = followupTargetId ? offers.find((o) => o.id === followupTargetId) : null;
  const lostTarget = lostTargetId ? offers.find((o) => o.id === lostTargetId) : null;

  async function handleChangeStage(offerId: string, newStage: 'closed' | 'lost') {
    // Verloren never lands here directly — the row buttons open
    // LostReasonModal first via setLostTargetId so we can capture
    // the categorical reason. Routing 'lost' through this handler
    // would skip that and silently drop the analytics, so guard it.
    if (newStage === 'lost') {
      setLostTargetId(offerId);
      return;
    }
    setStageBusyId(offerId);
    const prev = offers.find((o) => o.id === offerId)?.stage;
    setOffers((os) => os.map((o) => (o.id === offerId ? { ...o, stage: newStage } : o)));
    try {
      await updateOfferStage(offerId, newStage);
    } catch (err) {
      // Revert on failure so the offer reappears in its bucket.
      setOffers((os) => os.map((o) => (o.id === offerId ? { ...o, stage: prev } : o)));
      alert('Fehler: ' + (err as Error).message);
    } finally {
      setStageBusyId(null);
    }
  }

  async function handleMarkLost(draft: LostReasonDraft) {
    if (!lostTargetId) return;
    setLostSaving(true);
    const targetId = lostTargetId;
    const prev = offers.find((o) => o.id === targetId)?.stage;
    // Optimistically flip the stage so the offer leaves its bucket
    // immediately. We revert if the API call fails.
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
      alert('Fehler: ' + (err as Error).message);
    } finally {
      setLostSaving(false);
    }
  }

  async function handleSendFollowup(draft: SendFollowupDraft) {
    if (!followupTargetId) return;
    setFollowupSaving(true);
    try {
      await sendFollowup(followupTargetId, {
        templateId: draft.templateId,
        subject: draft.subject,
        body: draft.body,
        attachPdf: draft.attachPdf,
        includeAcceptLink: draft.includeAcceptLink,
        createdById: user?.id || null,
        createdByName: profile?.mesonic_rep_name || user?.email || null,
      });
      // Refresh — the sent activity bumps last_activity_at and adds
      // an email_events row that the next render will see.
      await fetchOffers();
      setFollowupTargetId(null);
    } catch (err) {
      alert('Fehler beim Senden: ' + (err as Error).message);
    } finally {
      setFollowupSaving(false);
    }
  }

  async function handleLogActivity(draft: ActivityDraft) {
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
      setOffers((os) => os.map((o) => (
        o.id === logTargetId
          ? { ...o, last_activity_at: created.created_at, next_followup_at: created.next_followup_at }
          : o
      )));
      // If the user opted in via the modal checkbox, also flip the stage.
      // We do this AFTER logActivity so the activity row is the durable
      // "why" record alongside the stage change.
      if (draft.stageChange) {
        const targetId = logTargetId;
        await handleChangeStage(targetId, draft.stageChange);
      }
      setLogTargetId(null);
    } catch (err) {
      alert('Fehler beim Speichern: ' + (err as Error).message);
    } finally {
      setLogSaving(false);
    }
  }

  return (
    <>
      <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-red-600 transition-colors" style={{ fontSize: 13 }}>
            <ArrowLeft size={16} /> Angebote
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Phone size={16} className="text-blue-600 flex-shrink-0" />
            <span className="font-bold text-slate-700" style={{ fontSize: 15 }}>Follow-ups</span>
            <span className="text-slate-400" style={{ fontSize: 12 }}>({totalCount})</span>
          </div>
          <button onClick={fetchOffers} className="rounded-lg bg-slate-100 text-slate-600 p-1.5 hover:bg-slate-200 transition-colors" title="Aktualisieren">
            <RefreshCw size={13} />
          </button>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {VALUE_FILTERS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setValueFilter(v.key)}
                  className={`rounded-full px-2.5 py-1 font-medium transition-colors ${valueFilter === v.key ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  style={{ fontSize: 11 }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {uniqueCreators.length > 1 && (
              <CreatorFilterDropdown value={creatorFilter} onChange={setCreatorFilter} creators={uniqueCreators} />
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">
            <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
            <p style={{ fontSize: 13 }}>Lade Angebote...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-400">
            <AlertCircle size={32} className="mx-auto mb-3" />
            <p className="font-medium">Fehler: {error}</p>
            <button onClick={fetchOffers} className="mt-3 text-sm text-red-600 underline">Erneut versuchen</button>
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Check size={48} className="mx-auto mb-3 text-emerald-400" />
            <p className="font-medium text-slate-600">Alles erledigt</p>
            <p style={{ fontSize: 13 }}>Keine offenen Follow-ups in dieser Auswahl.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <BucketSection
              tone="pink"
              icon={<Sparkles size={14} className="text-pink-600" />}
              title="Heiße Spur"
              subtitle={`> 2 Öffnungen in den letzten ${HOT_TRAIL_LOOKBACK_DAYS} Tagen — Kaufsignal`}
              offers={hotTrail}
              opensByOfferId={opensByOfferId}
              onLog={setLogTargetId}
              onFollowup={setFollowupTargetId}
              onLoad={onLoad}
              onChangeStage={handleChangeStage}
              stageBusyId={stageBusyId}
            />
            <BucketSection
              tone="red"
              icon={<Flame size={14} className="text-red-600" />}
              title="Überfällig"
              subtitle="Follow-up-Termin verstrichen"
              offers={buckets.overdue}
              opensByOfferId={opensByOfferId}
              onLog={setLogTargetId}
              onFollowup={setFollowupTargetId}
              onLoad={onLoad}
              onChangeStage={handleChangeStage}
              stageBusyId={stageBusyId}
            />
            <BucketSection
              tone="amber"
              icon={<AlarmClock size={14} className="text-amber-600" />}
              title="Heute fällig"
              subtitle="Diese Kunden heute kontaktieren"
              offers={buckets.dueToday}
              opensByOfferId={opensByOfferId}
              onLog={setLogTargetId}
              onFollowup={setFollowupTargetId}
              onLoad={onLoad}
              onChangeStage={handleChangeStage}
              stageBusyId={stageBusyId}
            />
            <BucketSection
              tone="blue"
              icon={<MessageSquare size={14} className="text-blue-600" />}
              title="Ohne Reaktion"
              subtitle={`Gesendet vor ${STALE_AFTER_DAYS}+ Tagen, kein Kontakt`}
              offers={buckets.stale}
              opensByOfferId={opensByOfferId}
              onLog={setLogTargetId}
              onFollowup={setFollowupTargetId}
              onLoad={onLoad}
              onChangeStage={handleChangeStage}
              stageBusyId={stageBusyId}
              defaultOpen={false}
            />
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

      {followupTarget && (
        <SendFollowupModal
          offer={followupTarget}
          recentOpens={opensByOfferId.get(followupTarget.id) || 0}
          pdfAvailable={Boolean(followupTarget.pdf_path)}
          acceptLinkAvailable={Boolean(followupTarget.share_code)}
          onSubmit={handleSendFollowup}
          onClose={() => !followupSaving && setFollowupTargetId(null)}
          saving={followupSaving}
        />
      )}

      {lostTarget && (
        <LostReasonModal
          customerLabel={lostTarget.customer_company || lostTarget.customer_name || 'Ohne Name'}
          onSubmit={handleMarkLost}
          onClose={() => !lostSaving && setLostTargetId(null)}
          saving={lostSaving}
        />
      )}
    </>
  );
}
