import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
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
  Plus,
  RefreshCw,
  Send,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';

import { supabase } from '../../../lib/supabase';
import {
  listOffers,
  deleteOffer,
  getEmailEvents,
  updateOfferStage,
} from '../../../lib/offerApi';
import { StatusBadge, StageBadge, STATUS_CONFIG } from '../components/Badges';
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

export default function OfferListPage({ onLoad, onNew }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState('new');
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [stageLoading, setStageLoading] = useState(null);

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

  async function showDetail(id) {
    if (detailId === id) {
      setDetailId(null);
      return;
    }
    setDetailId(id);
    setEventsLoading(true);
    try {
      const evts = await getEmailEvents(id);
      setEvents(evts || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }

  async function handleStageChange(id, newStage) {
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

  const creatorFiltered = creatorFilter === 'all' ? offers : offers.filter((o) => o.creator_name === creatorFilter);
  const filteredOffers = stageFilter === 'all' ? creatorFiltered : creatorFiltered.filter((o) => o.stage === stageFilter);
  const stageCounts = { all: creatorFiltered.length };
  for (const s of ['new', 'offer_sent', 'closed', 'lost']) {
    stageCounts[s] = creatorFiltered.filter((o) => o.stage === s).length;
  }
  const uniqueCreators = [...new Set(offers.map((o) => o.creator_name).filter(Boolean))].sort();
  const closedMonthly = offers.filter((o) => o.stage === 'closed').reduce((sum, o) => sum + Number(o.total_monthly || 0), 0);

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
        <div className="text-center py-12 text-slate-400">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">Noch keine Angebote</p>
          <p style={{ fontSize: 13 }}>Erstelle ein Angebot und speichere es hier.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredOffers.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800" style={{ fontSize: 13 }}>
                        {o.customer_company || o.customer_name || 'Ohne Name'}
                      </span>
                      <StatusBadge status={o.status} />
                      <StageBadge stage={o.stage} />
                    </div>
                    {o.customer_company && o.customer_name && (
                      <div className="text-slate-500" style={{ fontSize: 12 }}>{o.customer_name}</div>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-slate-400" style={{ fontSize: 11 }}>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(o.updated_at).toLocaleDateString('de-AT')}
                      </span>
                      <span>{o.creator_name}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {o.total_monthly > 0 && (
                      <div className="font-semibold text-slate-800" style={{ fontSize: 13 }}>€ {fmt(Number(o.total_monthly))}/Mo</div>
                    )}
                    {o.total_once > 0 && (
                      <div className="text-slate-500" style={{ fontSize: 12 }}>€ {fmt(Number(o.total_once))} einm.</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-100">
                  <button onClick={() => onLoad(o.id)} className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 px-2.5 py-1 hover:bg-red-100 transition-colors" style={{ fontSize: 11 }}>
                    <FileText size={12} /> Laden
                  </button>
                  <button onClick={() => onLoad(o.id, true)} className="flex items-center gap-1 rounded-lg bg-slate-50 text-slate-600 px-2.5 py-1 hover:bg-slate-100 transition-colors" style={{ fontSize: 11 }}>
                    <Copy size={12} /> Duplizieren
                  </button>
                  <button onClick={() => showDetail(o.id)} className="flex items-center gap-1 rounded-lg bg-slate-50 text-slate-600 px-2.5 py-1 hover:bg-slate-100 transition-colors" style={{ fontSize: 11 }}>
                    <Clock size={12} /> Details
                  </button>
                  <button onClick={() => handleDelete(o.id)} className="flex items-center gap-1 rounded-lg bg-slate-50 text-red-400 px-2.5 py-1 hover:bg-red-50 transition-colors ml-auto" style={{ fontSize: 11 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                {/* Stage action buttons */}
                <div className="flex gap-1.5 mt-2">
                  {o.stage === 'new' && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'offer_sent')} className="flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2.5 py-1 hover:bg-blue-100 transition-colors disabled:opacity-50" style={{ fontSize: 11 }}>
                      <Send size={12} /> Gesendet
                    </button>
                  )}
                  {o.stage !== 'closed' && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'closed')} className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1 hover:bg-emerald-100 transition-colors disabled:opacity-50" style={{ fontSize: 11 }}>
                      <CheckCircle2 size={12} /> Abschließen
                    </button>
                  )}
                  {(o.stage === 'new' || o.stage === 'offer_sent') && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'lost')} className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 px-2.5 py-1 hover:bg-red-100 transition-colors disabled:opacity-50" style={{ fontSize: 11 }}>
                      <XCircle size={12} /> Verloren
                    </button>
                  )}
                  {(o.stage === 'closed' || o.stage === 'lost') && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'new')} className="flex items-center gap-1 rounded-lg bg-slate-100 text-slate-600 px-2.5 py-1 hover:bg-slate-200 transition-colors disabled:opacity-50" style={{ fontSize: 11 }}>
                      <RefreshCw size={12} /> Reaktivieren
                    </button>
                  )}
                </div>
              </div>

              {/* Event timeline */}
              {detailId === o.id && (
                <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
