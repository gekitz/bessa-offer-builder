import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Flame,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  User,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../../../lib/auth';
import { listOffers, logActivity, updateOfferStage } from '../../../lib/offerApi';
import { fmt } from '../../../lib/format';
import { bucketize, STALE_AFTER_DAYS, type OfferLike } from '../followUpBuckets';
import LogActivityModal, { type ActivityDraft } from '../components/modals/LogActivityModal';

// Dedicated workspace for following up on sent offers. Buckets are
// the same as the in-list Hub (overdue / due today / stale) but get
// the whole viewport plus filters (creator, deal-value floor, search).

interface OfferRow extends OfferLike {
  customer_name?: string | null;
  customer_company?: string | null;
  creator_name?: string | null;
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

type BucketTone = 'red' | 'amber' | 'blue';

interface BucketSectionProps {
  tone: BucketTone;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  offers: OfferRow[];
  onLog: (offerId: string) => void;
  onLoad: (offerId: string) => void;
  onChangeStage: (offerId: string, stage: 'closed' | 'lost') => void;
  stageBusyId?: string | null;
  defaultOpen?: boolean;
}

function BucketSection({ tone, icon, title, subtitle, offers, onLog, onLoad, onChangeStage, stageBusyId, defaultOpen = true }: BucketSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const toneCls: Record<BucketTone, string> = {
    red:   'border-red-200 bg-red-50',
    amber: 'border-amber-200 bg-amber-50',
    blue:  'border-blue-200 bg-blue-50',
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
              onLog={onLog}
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
  onLog: (offerId: string) => void;
  onLoad: (offerId: string) => void;
  onChangeStage: (offerId: string, stage: 'closed' | 'lost') => void;
  stageBusy?: boolean;
}

function FollowUpRow({ offer, onLog, onLoad, onChangeStage, stageBusy }: FollowUpRowProps) {
  const due = offer.next_followup_at ? new Date(offer.next_followup_at) : null;
  const sent = offer.sent_at ? new Date(offer.sent_at) : null;
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-800 truncate" style={{ fontSize: 13 }}>
          {offer.customer_company || offer.customer_name || 'Ohne Name'}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500" style={{ fontSize: 11 }}>
          {due && (
            <span className="flex items-center gap-1">
              <AlarmClock size={11} />
              Fällig {due.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
          {!due && sent && <span>Gesendet {sent.toLocaleDateString('de-AT')}</span>}
          {Number(offer.total_period) > 0 && (
            <span className="text-slate-400">€ {fmt(Number(offer.total_period))}</span>
          )}
          {Number(offer.total_monthly) > 0 && (
            <span className="text-slate-400">€ {fmt(Number(offer.total_monthly))}/Mo</span>
          )}
          {offer.creator_name && <span className="text-slate-400">{offer.creator_name}</span>}
        </div>
      </div>
      <button
        onClick={() => onLog(offer.id)}
        className="flex items-center gap-1 rounded-lg bg-blue-600 text-white px-2.5 py-1 hover:bg-blue-700 transition-colors flex-shrink-0"
        style={{ fontSize: 11 }}
      >
        <Phone size={12} /> Kontakt
      </button>
      <button
        onClick={() => onChangeStage(offer.id, 'closed')}
        disabled={stageBusy}
        className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 hover:bg-emerald-100 transition-colors disabled:opacity-50 flex-shrink-0"
        style={{ fontSize: 11 }}
        title="Als gewonnen markieren"
      >
        <CheckCircle2 size={12} /> Gewonnen
      </button>
      <button
        onClick={() => onChangeStage(offer.id, 'lost')}
        disabled={stageBusy}
        className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 hover:bg-red-100 transition-colors disabled:opacity-50 flex-shrink-0"
        style={{ fontSize: 11 }}
        title="Als verloren markieren"
      >
        <XCircle size={12} /> Verloren
      </button>
      <button
        onClick={() => onLoad(offer.id)}
        className="flex items-center gap-1 rounded-lg bg-white text-slate-600 border border-slate-200 px-2.5 py-1 hover:bg-slate-50 transition-colors flex-shrink-0"
        style={{ fontSize: 11 }}
      >
        <FileText size={12} /> Öffnen
      </button>
    </div>
  );
}

export interface FollowUpsPageProps {
  onBack: () => void;
  onLoad: (offerId: string) => void;
}

interface AuthShape {
  user: { id: string; email?: string | null } | null;
  profile: { mesonic_rep_name?: string | null } | null;
}

export default function FollowUpsPage({ onBack, onLoad }: FollowUpsPageProps) {
  const { user, profile } = useAuth() as AuthShape;
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatorFilter, setCreatorFilter] = useState<string>('all');
  const [valueFilter, setValueFilter] = useState<ValueFilterKey>('all');
  const [logTargetId, setLogTargetId] = useState<string | null>(null);
  const [logSaving, setLogSaving] = useState(false);
  const [stageBusyId, setStageBusyId] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOffers();
      setOffers((data as OfferRow[]) || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

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

  const buckets = useMemo(() => bucketize(filtered), [filtered]);
  const totalCount = buckets.overdue.length + buckets.dueToday.length + buckets.stale.length;
  const logTarget = logTargetId ? offers.find((o) => o.id === logTargetId) : null;

  async function handleChangeStage(offerId: string, newStage: 'closed' | 'lost') {
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
              tone="red"
              icon={<Flame size={14} className="text-red-600" />}
              title="Überfällig"
              subtitle="Follow-up-Termin verstrichen"
              offers={buckets.overdue}
              onLog={setLogTargetId}
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
              onLog={setLogTargetId}
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
              onLog={setLogTargetId}
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
    </>
  );
}
