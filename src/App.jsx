import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Plus, Minus, X, Download, ShoppingCart, ChevronDown, User, FileText, Trash2, Copy, Check, Search, Loader2, Link, Save, Send, Mail, Clock, Eye, RefreshCw, ArrowLeft, Calendar, Building2, AlertCircle, CheckCircle2, XCircle, MailOpen, Archive, Pen, Pencil } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from './pdf/OfferPdfDocument';
import { getOfferFromURL } from './lib/urlState';
import { saveOffer, listOffers, getOffer, deleteOffer, sendOffer, getEmailEvents, setShareCode, getOfferByShareCode, updateOfferStage, signOffer, getSignedPdfUrl } from './lib/offerApi';
import { supabase } from './lib/supabase';
import { generateAcceptQr } from './lib/qr';
import { useAuth } from './lib/auth';
import { TIERS, TIER_MONTHS, TIER_LABEL, TIER_SHORT, TIER_LABEL_OFFER, TKEY, TKEY_REV } from './data/tiers';
import { AUTO_TERM_RULES, computeAutoTerms } from './data/autoTermRules';
import { availableTiers, bestTier, price, discountedPrice, hasDiscount, isMonthly, yearlyServicePerUnit } from './lib/pricing';
import { computeTotals } from './lib/totals';
import {
  COMPANY_DEFAULT,
  BESSA,
  MELZER,
  UNIFY,
  RCH,
  HARDWARE,
  DRUCKER,
  KUECHENMONITORE,
  KUECHENMONITORE_SUNMI,
  DIENSTLEISTUNGEN,
  ORDERMAN,
  TEAM,
  ALL,
  CATALOG_IDS,
  isCustomItem,
} from './features/offers/data/catalogs';
import SignaturePad from './features/offers/components/SignaturePad';
import SortableOfferRow from './features/offers/components/SortableOfferRow';
import { StatusBadge, StageBadge, STATUS_CONFIG } from './features/offers/components/Badges';
import SignModal from './features/offers/components/modals/SignModal';
import CustomItemModal from './features/offers/components/modals/CustomItemModal';
import EditItemModal from './features/offers/components/modals/EditItemModal';
import EmailPreviewModal from './features/offers/components/modals/EmailPreviewModal';
import OfferView from './features/offers/components/OfferView';
import OfferListPage from './features/offers/pages/OfferListPage';
import { orderedCartEntries } from './lib/cartOrder';
import { fmt } from './lib/format';
import AppShell from './components/AppShell';
import CustomerPicker from './components/CustomerPicker';

const CrmPage = React.lazy(() => import('./components/CrmPage.jsx'));

// ═══════════════════════════════════════════════════════
// DATA — see src/features/offers/data/catalogs.ts
// ═══════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════



// Build wartung rows for PDF rendering from filtered cart entries.
function buildWartungItems(entries) {
  return entries
    .filter(([id]) => ALL[id]?.servicePercent > 0)
    .map(([id, c]) => {
      const item = ALL[id];
      const fullQty = c.qty || 0;
      const discQty = c.discountQty || 0;
      const totalQty = fullQty + discQty;
      const unit = yearlyServicePerUnit(item);
      return {
        id,
        qty: fullQty,
        discountQty: discQty,
        code: item.code || '',
        name: item.name,
        servicePercent: item.servicePercent,
        wartungUnit: unit,
        wartungLine: unit * totalQty,
      };
    });
}

function groupBy(items, key) {
  const g = {};
  items.forEach(i => { const k = i[key] || 'Sonstige'; (g[k] = g[k]||[]).push(i); });
  return g;
}

// ═══════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════

function ItemCard({ item, cartItem, globalTier, onAdd, onRemove, onQty, onDiscountQty, onTier, onMode }) {
  const inCart = !!cartItem;
  const tier = cartItem?.tier || bestTier(item, globalTier);
  const mode = cartItem?.mode || 'rent';
  const p = price(item, tier, mode);
  const dp = discountedPrice(item, tier, mode);
  const av = availableTiers(item);
  const monthly = isMonthly(item, mode);
  const hasDiscountOption = hasDiscount(item);
  const fullQty = cartItem?.qty || 0;
  const discQty = cartItem?.discountQty || 0;
  const lineTotal = (p * fullQty) + (dp * discQty);

  if (p === null && !inCart) return null;

  return (
    <div className={`rounded-xl border-2 transition-all ${inCart ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
      style={{ padding: '12px 14px' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.code && <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded" style={{fontSize:11}}>{item.code}</span>}
            <span className="font-semibold text-slate-800" style={{fontSize:13}}>{item.name}</span>
          </div>
          {item.note && <p className="text-slate-400" style={{fontSize:11,marginTop:2}}>{item.note}</p>}
          {item.info && <p className="text-red-600 font-medium" style={{fontSize:11,marginTop:2}}>{item.info}</p>}
        </div>
        {!inCart ? (
          <button onClick={() => onAdd(item.id, item.t==='m' ? bestTier(item,globalTier) : undefined, item.t==='term' ? 'rent' : undefined)}
            className="flex-shrink-0 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 active:scale-95 transition-transform"
            style={{width:40,height:40}}>
            <Plus size={18} />
          </button>
        ) : (
          <button onClick={() => onRemove(item.id)}
            className="flex-shrink-0 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-95 transition-transform"
            style={{width:32,height:32}}>
            <X size={14} />
          </button>
        )}
      </div>

      {inCart && (
        <div className="mt-2 pt-2 border-t border-red-200">
          {av.length > 1 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {av.map(ti => (
                <button key={ti} onClick={() => onTier(item.id, ti)}
                  className={`rounded-full border transition-colors ${tier===ti ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
                  style={{fontSize:11,padding:'3px 8px'}}>
                  {TIER_SHORT[ti]} €{fmt(item.p[TKEY_REV[ti]])}
                </button>
              ))}
            </div>
          )}
          {item.t === 'term' && (
            <div className="flex gap-1 mb-2">
              <button onClick={() => onMode(item.id,'rent')}
                className={`rounded-full border transition-colors ${mode==='rent' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300'}`}
                style={{fontSize:11,padding:'3px 8px'}}>
                Miete €{item.rent !== null ? fmt(item.rent)+'/Mo' : 'n.v.'}
              </button>
              {item.buy !== null && (
                <button onClick={() => onMode(item.id,'buy')}
                  className={`rounded-full border transition-colors ${mode==='buy' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300'}`}
                  style={{fontSize:11,padding:'3px 8px'}}>
                  Kauf €{fmt(item.buy)}
                </button>
              )}
            </div>
          )}

          {/* Regular quantity row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {hasDiscountOption && <span className="text-slate-500 mr-1" style={{fontSize:11,minWidth:70}}>Voller Preis:</span>}
              <button onClick={() => onQty(item.id,-1)}
                className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
                style={{width:32,height:32}}>
                <Minus size={14} />
              </button>
              <span className="font-bold text-slate-800 text-center" style={{width:28,fontSize:14}}>{fullQty}</span>
              <button onClick={() => onQty(item.id,1)}
                className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
                style={{width:32,height:32}}>
                <Plus size={14} />
              </button>
              {item.t === 'h' && <span className="text-slate-400 ml-1" style={{fontSize:11}}>Stunden</span>}
            </div>
            {!hasDiscountOption && (
              <span className="font-bold text-red-700" style={{fontSize:14}}>
                € {fmt(lineTotal)}{monthly ? '/Mo' : ''}
              </span>
            )}
            {hasDiscountOption && (
              <span className="text-slate-600" style={{fontSize:12}}>
                € {fmt(p)}{monthly ? '/Mo' : ''}
              </span>
            )}
          </div>

          {/* Discounted quantity row */}
          {hasDiscountOption && (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <span className="text-green-600 mr-1" style={{fontSize:11,minWidth:70}}>{item.discount.label}:</span>
                <button onClick={() => onDiscountQty(item.id,-1)}
                  className="rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 active:scale-95 transition-transform"
                  style={{width:32,height:32}}>
                  <Minus size={14} />
                </button>
                <span className="font-bold text-green-700 text-center" style={{width:28,fontSize:14}}>{discQty}</span>
                <button onClick={() => onDiscountQty(item.id,1)}
                  className="rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 active:scale-95 transition-transform"
                  style={{width:32,height:32}}>
                  <Plus size={14} />
                </button>
              </div>
              <span className="text-green-600" style={{fontSize:12}}>
                € {fmt(dp)}{monthly ? '/Mo' : ''}
              </span>
            </div>
          )}

          {/* Total for discount items */}
          {hasDiscountOption && (
            <div className="flex justify-end mt-2 pt-2 border-t border-red-200">
              <span className="font-bold text-red-700" style={{fontSize:14}}>
                Gesamt: € {fmt(lineTotal)}{monthly ? '/Mo' : ''}
              </span>
            </div>
          )}

          {/* Melzer Wartung pro Jahr */}
          {item.servicePercent > 0 && (
            <div className="flex justify-end mt-1 text-amber-700" style={{fontSize:11}}>
              + € {fmt(yearlyServicePerUnit(item) * (fullQty + discQty))} Wartung/Jahr
              <span className="text-slate-400 ml-1">({item.servicePercent}%)</span>
            </div>
          )}
        </div>
      )}

      {!inCart && p !== null && (
        <div className="text-right mt-1">
          <span className="text-slate-500" style={{fontSize:12}}>
            € {fmt(p)}{monthly ? '/Mo' : item.t==='h' ? '/h' : ''}
          </span>
          {item.servicePercent > 0 && (
            <span className="text-amber-700 ml-2" style={{fontSize:11}}>
              + € {fmt(yearlyServicePerUnit(item))}/Jahr Wartung
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CatGroup({ title, items, cart, globalTier, handlers, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = items.filter(i => cart[i.id]).length;
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-2 group">
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="font-bold text-slate-500 uppercase tracking-wider" style={{fontSize:11}}>{title}</span>
        {count > 0 && <span className="bg-red-600 text-white rounded-full px-1.5" style={{fontSize:10,lineHeight:'18px'}}>{count}</span>}
      </button>
      {open && (
        <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))'}}>
          {items.map(item => (
            <ItemCard key={item.id} item={item} cartItem={cart[item.id]} globalTier={globalTier} {...handlers} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabContent({ items, cart, globalTier, handlers }) {
  const groups = groupBy(items, 'cat');
  return (
    <div>
      {Object.entries(groups).map(([cat, list]) => (
        <CatGroup key={cat} title={cat} items={list} cart={cart} globalTier={globalTier} handlers={handlers} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// OFFER / ANGEBOT VIEW
// ═══════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════

const BUILDER_TABS = [
  { id: 'bessa', label: 'Bessa' },
  { id: 'melzer', label: 'Melzer' },
  { id: 'rch', label: 'RCH' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'angebot', label: 'Angebot' },
];

// ═══════════════════════════════════════════════════════
// ACCEPT PAGE (customer-facing, loaded via ?a=<share_code>)
// ═══════════════════════════════════════════════════════
function AcceptPlanCard({ title, subtitle, rows, cta, onSelect, loading, disabled, highlight }) {
  return (
    <div className={`bg-white rounded-xl border-2 ${highlight ? 'border-red-300' : 'border-slate-200'} mb-4 overflow-hidden`}>
      <div className="p-5">
        <div className="mb-3">
          <div className="font-bold text-slate-800 text-lg">{title}</div>
          <div className="text-sm text-slate-500">{subtitle}</div>
        </div>
        <div className="space-y-2 text-sm bg-slate-50 rounded-lg p-3 mb-4">
          {rows.map((r, i) => (
            <div key={i} className={`flex justify-between ${r.emphasis ? 'pt-2 border-t border-slate-200 font-semibold text-slate-800' : 'text-slate-700'}`}>
              <span>{r.label}</span>
              <span className={r.emphasis ? '' : 'font-medium'}>€ {fmt(r.value)}{r.per ? r.per : ''}</span>
            </div>
          ))}
        </div>
        <button onClick={onSelect} disabled={disabled}
          className="w-full bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-wait transition-colors">
          {loading ? 'Wird weitergeleitet…' : cta}
        </button>
      </div>
    </div>
  );
}

function AcceptanceDetails({ offer }) {
  const data = offer.offer_data || {};
  const tier = data.globalTier || '12mo';
  const raten = data.raten || 12;
  const tierMonths = TIER_MONTHS[tier] || 12;
  const isOpenEnded = tier === '12mo';

  const monthlyNet = Number(offer.total_monthly || 0);
  const onceNet = Number(offer.total_once || 0);
  const periodNet = Number(offer.total_period || 0);
  const yearlyNet = Math.max(0, periodNet - monthlyNet * tierMonths - onceNet);

  const VAT = 1.2, FIN = 1.08;
  const monthlyBrutto = monthlyNet * VAT;
  const onceBrutto = onceNet * VAT;
  const yearlyBrutto = yearlyNet * VAT;
  const periodBrutto = periodNet * VAT;

  const plan = offer.plan_chosen;
  const planName = plan === 'standard' ? 'Standard'
    : plan === 'ratenzahlung' ? 'Ratenzahlung'
    : plan === 'miete' ? 'Miete' : '—';

  const startDate = offer.service_start_date
    ? new Date(offer.service_start_date + 'T00:00:00Z')
    : new Date(offer.accepted_at);
  const formattedStart = startDate.toLocaleDateString('de-AT');
  let endDate = null;
  if (plan === 'miete' || !isOpenEnded) {
    endDate = new Date(startDate.getTime());
    endDate.setUTCMonth(endDate.getUTCMonth() + tierMonths);
  }
  const formattedEnd = endDate ? endDate.toLocaleDateString('de-AT') : null;

  const rows = [];
  if (plan === 'standard') {
    if (onceBrutto > 0) rows.push({ label: 'Einmalig', value: onceBrutto, per: ' brutto' });
    if (monthlyBrutto > 0) rows.push({ label: 'Monatsgebühr', value: monthlyBrutto, per: '/Monat brutto' });
    if (yearlyBrutto > 0) rows.push({ label: 'Wartung', value: yearlyBrutto, per: '/Jahr brutto' });
  } else if (plan === 'ratenzahlung') {
    const totalFinanced = periodBrutto * FIN;
    const anzahlung = totalFinanced * 0.3;
    const ratePerMonth = (totalFinanced * 0.7) / raten;
    rows.push({ label: 'Gesamtbetrag (inkl. 8%)', value: totalFinanced, per: ' brutto' });
    rows.push({ label: 'Anzahlung (30%)', value: anzahlung, per: ' brutto' });
    rows.push({ label: `${raten} × Rate`, value: ratePerMonth, per: '/Monat brutto' });
    if (isOpenEnded && monthlyBrutto > 0) {
      rows.push({ label: `Ab Monat ${raten + 1}: Monatsgebühr`, value: monthlyBrutto, per: '/Monat brutto' });
    }
    if (isOpenEnded && yearlyBrutto > 0) {
      rows.push({ label: 'Wartung', value: yearlyBrutto, per: '/Jahr brutto' });
    }
  } else if (plan === 'miete') {
    const mieteMonthly = (periodBrutto / tierMonths) * FIN;
    rows.push({ label: 'Kaution (einmalig)', value: 500, per: ' brutto' });
    rows.push({ label: 'Miete monatlich (inkl. 8%)', value: mieteMonthly, per: '/Monat brutto' });
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-slate-100">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border-2 border-emerald-200 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={32} />
            <div>
              <div className="font-bold text-slate-800 text-lg">Angebot angenommen</div>
              <div className="text-sm text-slate-500">
                {new Date(offer.accepted_at).toLocaleString('de-AT', { dateStyle: 'long', timeStyle: 'short' })}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-bold text-slate-700" style={{fontSize: 13}}>ZAHLUNGSPLAN</div>
            <div className="text-sm font-semibold text-slate-800">{planName}</div>
          </div>
          <div className="space-y-2 text-sm bg-slate-50 rounded-lg p-3">
            {rows.length === 0 ? (
              <div className="text-slate-500 text-center py-2">Keine Details verfügbar</div>
            ) : rows.map((r, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-slate-600">{r.label}</span>
                <span className="font-semibold text-slate-800 whitespace-nowrap">€ {fmt(r.value)}{r.per}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 p-5">
          <div className="font-bold text-slate-700 mb-3" style={{fontSize: 13}}>ABRECHNUNG</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Leistungsbeginn / erste Abbuchung</span>
              <span className="font-medium text-slate-800">{formattedStart}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Laufzeit</span>
              <span className="font-medium text-slate-800">
                {plan === 'miete' ? `${tierMonths} Monate` : isOpenEnded ? 'Unbefristet' : `${tierMonths} Monate`}
              </span>
            </div>
            {formattedEnd && (
              <div className="flex justify-between">
                <span className="text-slate-600">Vertragsende</span>
                <span className="font-medium text-slate-800">{formattedEnd}</span>
              </div>
            )}
            {monthlyBrutto > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Folge-Abbuchungen Monatsgebühr</span>
                <span className="font-medium text-slate-800">jeweils zum {startDate.getDate()}.</span>
              </div>
            )}
            {yearlyBrutto > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Wartung-Verrechnung</span>
                <span className="font-medium text-slate-800">jährlich ab {formattedStart}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600 text-center">
          Bei Fragen melden Sie sich bitte bei Ihrem Ansprechpartner.
        </div>
      </div>
    </div>
  );
}

function AcceptPage({ shareCode }) {
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState('');
  const [submittingPlan, setSubmittingPlan] = useState(null);
  const [processingReturn, setProcessingReturn] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stage = params.get('s');
    const cs = params.get('cs');

    async function load() {
      try {
        const fresh = await getOfferByShareCode(shareCode);
        if (stage === 'success' && cs && !fresh.accepted_at) {
          setProcessingReturn(true);
          const { data: result, error: fnErr } = await supabase.functions.invoke(
            'stripe-complete-acceptance',
            { body: { shareCode, checkoutSessionId: cs } }
          );
          if (fnErr) throw new Error(fnErr.message || 'Verarbeitungsfehler');
          if (result?.error) throw new Error(result.error);
          // Re-fetch so UI reflects accepted state
          const updated = await getOfferByShareCode(shareCode);
          setOffer(updated);
          window.history.replaceState({}, '', `${window.location.pathname}?a=${shareCode}`);
        } else {
          setOffer(fresh);
        }
      } catch (e) {
        setError(e?.message || 'Angebot nicht gefunden.');
      } finally {
        setProcessingReturn(false);
      }
    }
    load();
  }, [shareCode]);

  if (processingReturn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="animate-spin text-red-600 mx-auto mb-3" size={36} />
          <div className="font-medium text-slate-700">Zahlung wird eingerichtet…</div>
          <div className="text-xs text-slate-500 mt-1">Bitte Seite nicht schließen</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-100">
        <div className="bg-white border-2 border-red-200 rounded-xl p-6 max-w-md text-center">
          <div className="font-bold text-red-800 mb-2">Angebot nicht gefunden</div>
          <div className="text-sm text-slate-600">{error}</div>
        </div>
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (offer.accepted_at) {
    return <AcceptanceDetails offer={offer} />;
  }

  const data = offer.offer_data || {};
  const cart = data.cart || {};
  const customItems = data.customItems || {};
  const raten = data.raten || 12;

  // Recompute totals from saved cart
  let monthly = 0, once = 0, yearly = 0, periodTotal = 0, maxMonths = 0;
  Object.entries(cart).forEach(([id, c]) => {
    const item = ALL[id] || customItems[id];
    if (!item) return;
    const p = price(item, c.tier, c.mode);
    const dp = discountedPrice(item, c.tier, c.mode);
    if (p === null) return;
    const line = (p * (c.qty || 0)) + (dp * (c.discountQty || 0));
    if (isMonthly(item, c.mode)) {
      monthly += line;
      const months = TIER_MONTHS[c.tier] || 12;
      periodTotal += line * months;
      if (months > maxMonths) maxMonths = months;
    } else {
      once += line;
      periodTotal += line;
      const svc = yearlyServicePerUnit(item) * ((c.qty || 0) + (c.discountQty || 0));
      if (svc > 0) { yearly += svc; periodTotal += svc; }
    }
  });
  maxMonths = maxMonths || 12;

  const onceBrutto = once * 1.2;
  const monthlyBrutto = monthly * 1.2;
  const yearlyBrutto = yearly * 1.2;
  const periodBrutto = periodTotal * 1.2;

  async function pickPlan(planId) {
    setSubmittingPlan(planId);
    try {
      const { data: result, error } = await supabase.functions.invoke('stripe-create-checkout', {
        body: { shareCode, plan: planId },
      });
      if (error) throw new Error(error.message || 'Checkout-Fehler');
      if (!result?.url) throw new Error(result?.error || 'Keine Checkout-URL erhalten');
      window.location.href = result.url;
    } catch (e) {
      alert(e.message);
      setSubmittingPlan(null);
    }
  }

  const startDateText = offer.service_start_date
    ? new Date(offer.service_start_date).toLocaleDateString('de-AT')
    : 'sofort';

  const planA = [];
  if (onceBrutto > 0) planA.push({ label: 'Einmalige Kosten', value: onceBrutto });
  if (monthlyBrutto > 0) planA.push({ label: 'Monatlich', value: monthlyBrutto, per: '/Mo' });
  if (yearlyBrutto > 0) planA.push({ label: 'Wartung jährlich', value: yearlyBrutto, per: '/J' });

  const ratenTotal = periodBrutto * 1.08;
  const planB = [
    { label: `Gesamtbetrag (${raten} Raten, +8%)`, value: ratenTotal },
    { label: 'Anzahlung (30%)', value: ratenTotal * 0.3 },
    { label: `Rate (${raten}×)`, value: (ratenTotal * 0.7) / raten, per: '/Mo', emphasis: true },
  ];

  const mieteMonthly = (periodBrutto / maxMonths) * 1.08;
  const planC = [
    { label: 'Kaution (rückzahlbar)', value: 500 },
    { label: `Miete (${maxMonths} Monate)`, value: mieteMonthly, per: '/Mo', emphasis: true },
  ];

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-block bg-red-600 text-white font-bold px-4 py-2 rounded-lg mb-3" style={{ fontSize: 18 }}>KITZ</div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Angebot annehmen</h1>
          <p className="text-slate-600 text-sm">Wählen Sie Ihre bevorzugte Zahlungsart</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="text-xs text-slate-500 mb-1">Angebot für</div>
          <div className="font-bold text-slate-800 mb-3">
            {offer.customer_company || offer.customer_name || 'Kunde'}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Leistungsbeginn</span>
            <span className="font-semibold text-slate-800">{startDateText}</span>
          </div>
        </div>

        <AcceptPlanCard
          title="Standard"
          subtitle="Monatliche Zahlung, Einmalkosten bei Start"
          rows={planA}
          cta="Standard wählen"
          onSelect={() => pickPlan('standard')}
          loading={submittingPlan === 'standard'}
          disabled={!!submittingPlan}
          highlight
        />
        {periodBrutto > 0 && (
          <AcceptPlanCard
            title="Ratenzahlung"
            subtitle={`${raten} Raten, danach Standardtarif`}
            rows={planB}
            cta="Ratenzahlung wählen"
            onSelect={() => pickPlan('ratenzahlung')}
            loading={submittingPlan === 'ratenzahlung'}
            disabled={!!submittingPlan}
          />
        )}
        {periodBrutto > 0 && (
          <AcceptPlanCard
            title="Miete"
            subtitle={`${maxMonths} Monate Mietvertrag inkl. Hardware`}
            rows={planC}
            cta="Miete wählen"
            onSelect={() => pickPlan('miete')}
            loading={submittingPlan === 'miete'}
            disabled={!!submittingPlan}
          />
        )}

        <div className="text-center text-xs text-slate-500 mt-8">
          Sichere Zahlung über Stripe · alle Preise inkl. 20% USt
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Quick access: add #test to URL to show Mesonic API test page
  if (window.location.hash === '#test') {
    const MesonicTest = React.lazy(() => import('./components/MesonicTest.jsx'));
    return (
      <React.Suspense fallback={<div className="p-8 text-center">Loading test page...</div>}>
        <MesonicTest />
      </React.Suspense>
    );
  }

  // Customer-facing accept flow: ?a=<share_code>
  const acceptCode = new URLSearchParams(window.location.search).get('a');
  if (acceptCode) return <AcceptPage shareCode={acceptCode} />;

  const { profile, user } = useAuth();
  const currentEmail = (profile?.microsoft_email || user?.email || '').toLowerCase();
  const isBillingAdmin = currentEmail === 'kg@kitz.co.at';
  const [billingToggle, setBillingToggle] = useState(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('billingEnabled');
    return v == null ? true : v === 'true';
  });
  useEffect(() => {
    try { window.localStorage.setItem('billingEnabled', String(billingToggle)); } catch {}
  }, [billingToggle]);
  const billingEnabled = isBillingAdmin && billingToggle;
  const [section, setSection] = useState('angebote'); // 'angebote' | 'crm'
  const [offerView, setOfferView] = useState('list'); // 'list' | 'builder'
  const [builderTab, setBuilderTab] = useState('bessa');
  const [globalTier, setGlobalTier] = useState('12mo');
  const [cart, setCart] = useState({});
  const [customer, setCustomer] = useState({ name:'', company:'', email:'', phone:'', address:'' });
  const [creator, setCreator] = useState('');
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [raten, setRaten] = useState(12);
  const [search, setSearch] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [finanzOpen, setFinanzOpen] = useState(false);
  const [mandatsRef, setMandatsRef] = useState(() => Date.now().toString().slice(-12));
  const [serviceStartDate, setServiceStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currentOfferId, setCurrentOfferId] = useState(null);
  const [shareCode, setShareCodeState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [cartOrder, setCartOrder] = useState([]);

  // Auto-select creator from logged-in user
  // Handles two email formats at @kitz.co.at:
  //   TEAM uses:  <first_initial>.<lastname>@kitz.co.at  (e.g. g.kitz)
  //   SSO  uses:  <last_initial><first_initial>@kitz.co.at (e.g. kg)
  useEffect(() => {
    if (profile?.microsoft_email && !creator) {
      const ssoEmail = profile.microsoft_email.toLowerCase();
      // Try exact match first
      let match = TEAM.find(t => t.email.toLowerCase() === ssoEmail);
      if (!match) {
        // Extract local parts and domain
        const [ssoLocal, ssoDomain] = ssoEmail.split('@');
        if (ssoDomain) {
          match = TEAM.find(t => {
            const [teamLocal, teamDomain] = t.email.toLowerCase().split('@');
            if (teamDomain !== ssoDomain) return false;
            // TEAM format: "g.kitz" → first char 'g', after dot 'kitz'
            const dotIdx = teamLocal.indexOf('.');
            if (dotIdx < 1) return false;
            const firstInitial = teamLocal.charAt(0);       // 'g'
            const lastName = teamLocal.substring(dotIdx + 1); // 'kitz'
            // SSO format: "kg" → last initial 'k' + first initial 'g'
            const ssoVariant = lastName.charAt(0) + firstInitial; // 'kg'
            return ssoLocal === ssoVariant;
          });
        }
      }
      if (match) setCreator(match.id);
    }
  }, [profile]);

  // Filter out cart items whose IDs no longer exist in ALL (e.g. old offers with removed products)
  function sanitizeCart(rawCart, rawOrder) {
    const validCart = {};
    Object.entries(rawCart).forEach(([id, c]) => {
      if (ALL[id]) validCart[id] = c;
    });
    const validOrder = (rawOrder || []).filter(id => validCart[id]);
    return { cart: validCart, cartOrder: validOrder };
  }

  // Helpers for custom freeform items
  function getCustomItemsFromCart() {
    const items = {};
    Object.keys(cart).forEach(id => {
      if (isCustomItem(id) && ALL[id]) items[id] = ALL[id];
    });
    return Object.keys(items).length > 0 ? items : undefined;
  }

  function restoreCustomItems(customItems) {
    if (!customItems) return;
    Object.entries(customItems).forEach(([id, item]) => {
      ALL[id] = item;
    });
  }

  function clearCustomItems() {
    Object.keys(ALL).forEach(id => { if (isCustomItem(id)) delete ALL[id]; });
  }

  function handleAddCustomItem({ name, price: p }) {
    const id = crypto.randomUUID();
    ALL[id] = { id, name, price: p, t: 'o' };
    setCart(c => ({ ...c, [id]: { qty: 1, discountQty: 0 } }));
    setCartOrder(prev => [...prev, id]);
    setShowCustomModal(false);
  }

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch(e){} };
  }, []);

  // Load offer from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('s');
    if (code) {
      // Load from share code
      getOfferByShareCode(code).then(offer => {
        const data = offer.offer_data || {};
        clearCustomItems();
        restoreCustomItems(data.customItems);
        const { cart: validCart, cartOrder: validOrder } = sanitizeCart(data.cart || {}, data.cartOrder || []);
        setCart(validCart);
        setCartOrder(validOrder);
        setCustomer({
          name: offer.customer_name || '',
          company: offer.customer_company || '',
          email: offer.customer_email || '',
          phone: offer.customer_phone || '',
          address: data.address || '',
        });
        setCreator(offer.creator_id || '');
        setNotes(data.notes || '');
        setRaten(data.raten || 12);
        setFinanzOpen(data.finanzOpen || false);
        setGlobalTier(data.globalTier || '12mo');
        setMandatsRef(data.mandatsRef || Date.now().toString().slice(-12));
        setServiceStartDate(offer.service_start_date || new Date().toISOString().slice(0, 10));
        setCurrentOfferId(offer.id);
        setShareCodeState(offer.share_code);
        setOfferView('builder'); setBuilderTab('angebot');
        window.history.replaceState({}, '', window.location.pathname);
      }).catch(() => {
        alert('Angebot nicht gefunden.');
      });
      return;
    }
    // Backwards compatibility: load from ?offer= encoded param
    const savedOffer = getOfferFromURL();
    if (savedOffer) {
      clearCustomItems();
      restoreCustomItems(savedOffer.customItems);
      const { cart: validCart, cartOrder: validOrder } = sanitizeCart(savedOffer.cart || {}, savedOffer.cartOrder || []);
      setCart(validCart);
      setCartOrder(validOrder);
      setCustomer(savedOffer.customer || { name:'', company:'', email:'', phone:'', address:'' });
      setCreator(savedOffer.creator || '');
      setNotes(savedOffer.notes || '');
      setRaten(savedOffer.raten || 12);
      setFinanzOpen(savedOffer.finanzOpen || false);
      setGlobalTier(savedOffer.globalTier || '12mo');
      if (savedOffer.mandatsRef) setMandatsRef(savedOffer.mandatsRef);
      setOfferView('builder'); setBuilderTab('angebot');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Cart handlers
  // Items that auto-add 10h Arbeitszeit when selected
  const WORK_INTENSIVE_ITEMS = ['f7a4cb27-d3cf-4e84-ba58-a273da596c06', 'ad5d1834-f864-43a1-8be4-2bae0bfeade4']; // Lagerverwaltung, Anbindung Schankanlage
  const ARBEITSZEIT_ID = 'b01429e1-672e-44ae-ae79-1d08c4f7f918';

  const handlers = {
    onAdd: (id, tier, mode) => {
      setCart(c => {
        const newCart = {...c, [id]: { qty:1, discountQty:0, tier, mode }};
        // Auto-add 10h Arbeitszeit for work-intensive items
        if (WORK_INTENSIVE_ITEMS.includes(id)) {
          const currentQty = c[ARBEITSZEIT_ID]?.qty || 0;
          newCart[ARBEITSZEIT_ID] = { qty: currentQty + 10, discountQty: 0 };
        }
        return newCart;
      });
      setCartOrder(prev => {
        const ids = [id];
        if (WORK_INTENSIVE_ITEMS.includes(id) && !prev.includes(ARBEITSZEIT_ID)) ids.push(ARBEITSZEIT_ID);
        return [...prev.filter(x => !ids.includes(x)), ...ids];
      });
    },
    onRemove: (id) => {
      setCart(c => { const n = {...c}; delete n[id]; return n; });
      setCartOrder(prev => prev.filter(x => x !== id));
      if (isCustomItem(id)) delete ALL[id];
    },
    onQty: (id, d) => {
      setCart(c => {
        const cur = c[id];
        if (!cur) return c;
        const nq = cur.qty + d;
        if (nq < 0) return c;
        if (nq === 0 && (cur.discountQty || 0) === 0) {
          setCartOrder(prev => prev.filter(x => x !== id));
          const n = {...c}; delete n[id]; return n;
        }
        return {...c, [id]: {...cur, qty: nq}};
      });
    },
    onDiscountQty: (id, d) => {
      setCart(c => {
        const cur = c[id];
        if (!cur) return c;
        const nq = (cur.discountQty || 0) + d;
        if (nq < 0) return c;
        if (nq === 0 && cur.qty === 0) {
          setCartOrder(prev => prev.filter(x => x !== id));
          const n = {...c}; delete n[id]; return n;
        }
        return {...c, [id]: {...cur, discountQty: nq}};
      });
    },
    onTier: (id, tier) => setCart(c => c[id] ? {...c, [id]: {...c[id], tier}} : c),
    onMode: (id, mode) => setCart(c => c[id] ? {...c, [id]: {...c[id], mode}} : c),
  };

  function handleEditItem(id, { qty, discountQty, price: newPrice }) {
    setCart(c => {
      if (!c[id]) return c;
      return { ...c, [id]: { ...c[id], qty, discountQty } };
    });
    if (newPrice !== undefined) {
      const item = ALL[id];
      if (item) {
        if (item.t === 'o' || item.t === 'h') {
          item.p = { ...item.p, o: newPrice };
          item.price = newPrice;
        } else if (item.t === 'term') {
          const cartItem = cart[id];
          if (cartItem?.mode === 'buy') item.buy = newPrice;
          else item.rent = newPrice;
        }
      }
    }
  }

  // Totals
  const totals = useMemo(() => computeTotals(cart, ALL), [cart]);

  const cartCount = Object.keys(cart).length;

  // Email generation
  function buildOfferText() {
    const co = COMPANY_DEFAULT;
    const d = new Date().toLocaleDateString('de-AT');
    const lines = [];
    lines.push(co.name);
    lines.push('Standort Klagenfurt: ' + co.address1);
    lines.push('Standort Wolfsberg: ' + co.address2);
    lines.push(`Tel KLU: ${co.phone1} | Tel WO: ${co.phone2}`);
    lines.push(`E-Mail: ${co.email}`);
    lines.push(co.website);
    lines.push('');
    lines.push('========================================');
    lines.push('              ANGEBOT');
    lines.push('========================================');
    lines.push(`Datum: ${d}`);
    lines.push('');
    lines.push('Kunde:');
    if (customer.company) lines.push(customer.company);
    if (customer.name) lines.push(`z.Hd. ${customer.name}`);
    if (customer.email) lines.push(customer.email);
    if (customer.phone) lines.push(`Tel: ${customer.phone}`);
    lines.push('');

    const allOrdered = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
    const monthlyItems = allOrdered.filter(([id,c]) => isMonthly(ALL[id],c.mode));
    const onceItems = allOrdered.filter(([id,c]) => !isMonthly(ALL[id],c.mode));

    if (monthlyItems.length > 0) {
      lines.push('----------------------------------------');
      lines.push('MONATLICHE KOSTEN');
      lines.push('----------------------------------------');
      monthlyItems.forEach(([id, c], i) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode);
        const tierStr = c.tier ? ` (${TIER_LABEL_OFFER[c.tier]})` : '';
        const modeStr = c.mode === 'rent' && item.t === 'term' ? ' [Miete]' : '';
        lines.push(`  ${i+1}. ${c.qty}x ${item.code?item.code+' ':''}${item.name}${tierStr}${modeStr}`);
        lines.push(`     = EUR ${fmt(p * c.qty)}/Monat`);
      });
      lines.push('');
      lines.push(`  Netto/Monat:   EUR ${fmt(totals.monthly)}`);
      lines.push(`  20% USt:       EUR ${fmt(totals.monthly*0.2)}`);
      lines.push(`  Brutto/Monat:  EUR ${fmt(totals.monthly*1.2)}`);
      lines.push('');
    }

    if (onceItems.length > 0) {
      lines.push('----------------------------------------');
      lines.push('EINMALIGE KOSTEN');
      lines.push('----------------------------------------');
      onceItems.forEach(([id, c], i) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode);
        const modeStr = c.mode === 'buy' ? ' [Kauf]' : '';
        const hourStr = item.t === 'h' ? ` (${c.qty} Std.)` : '';
        lines.push(`  ${i+1}. ${c.qty}x ${item.code?item.code+' ':''}${item.name}${modeStr}${hourStr}`);
        lines.push(`     = EUR ${fmt(p * c.qty)}`);
      });
      lines.push('');
      lines.push(`  Netto:         EUR ${fmt(totals.once)}`);
      lines.push(`  20% USt:       EUR ${fmt(totals.once*0.2)}`);
      lines.push(`  Brutto:        EUR ${fmt(totals.once*1.2)}`);
      lines.push('');
    }

    if (notes.trim()) {
      lines.push('----------------------------------------');
      lines.push('Anmerkungen:');
      lines.push(notes);
      lines.push('');
    }

    lines.push('----------------------------------------');
    lines.push('Alle Preise verstehen sich netto exkl. USt.');
    lines.push('Bei 12/6/2-Monats-Verträgen jeweils monatlich.');
    lines.push(`Stand: ${d}`);
    return lines.join('\n');
  }

  async function handlePrint() {
    setPdfLoading(true);
    try {
      // Prepare items for PDF
      const validEntries = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
      const monthlyItems = validEntries
        .filter(([id, c]) => isMonthly(ALL[id], c.mode))
        .map(([id, c]) => {
          const item = ALL[id];
          const p = price(item, c.tier, c.mode);
          const dp = discountedPrice(item, c.tier, c.mode);
          const fullQty = c.qty || 0;
          const discQty = c.discountQty || 0;
          return {
            id,
            qty: fullQty,
            discountQty: discQty,
            code: item.code || '',
            name: item.name,
            info: item.info,
            tier: c.tier,
            mode: c.mode,
            type: item.t,
            unitPrice: p,
            discountPrice: dp,
            hasDiscount: hasDiscount(item),
            discountLabel: item.discount?.label,
            lineTotal: (p * fullQty) + (dp * discQty),
          };
        });

      const onceItems = validEntries
        .filter(([id, c]) => !isMonthly(ALL[id], c.mode))
        .map(([id, c]) => {
          const item = ALL[id];
          const p = price(item, c.tier, c.mode);
          const dp = discountedPrice(item, c.tier, c.mode);
          const fullQty = c.qty || 0;
          const discQty = c.discountQty || 0;
          return {
            id,
            qty: fullQty,
            discountQty: discQty,
            code: item.code || '',
            name: item.name,
            info: item.info,
            tier: c.tier,
            mode: c.mode,
            type: item.t,
            unitPrice: p,
            discountPrice: dp,
            hasDiscount: hasDiscount(item),
            discountLabel: item.discount?.label,
            lineTotal: (p * fullQty) + (dp * discQty),
          };
        });

      const wartungItems = buildWartungItems(validEntries);
      const autoTerms = computeAutoTerms(cart);

      // Find creator info
      const creatorInfo = TEAM.find(t => t.id === creator) || null;

      // Ensure the offer is saved and has a share_code so the QR accept URL works
      let effectiveShareCode = shareCode;
      if (billingEnabled) {
        let effectiveOfferId = currentOfferId;
        if (!effectiveOfferId) {
          const saved = await saveOffer({
            id: null,
            customer,
            creator,
            creatorName: creatorInfo?.name || creator,
            cart, globalTier, notes, raten, finanzOpen,
            totalMonthly: totals.monthly,
            totalOnce: totals.once,
            totalPeriod: totals.periodTotal,
            mandatsRef,
            customItems: getCustomItemsFromCart(),
            cartOrder,
            serviceStartDate,
          });
          effectiveOfferId = saved.id;
          setCurrentOfferId(effectiveOfferId);
          effectiveShareCode = effectiveShareCode || saved.share_code;
        }
        if (!effectiveShareCode) {
          effectiveShareCode = Math.random().toString(36).slice(2, 10);
          await setShareCode(effectiveOfferId, effectiveShareCode);
          setShareCodeState(effectiveShareCode);
        }
      }

      // Generate PDF blob
      const acceptQrDataUrl = billingEnabled ? await generateAcceptQr(effectiveShareCode) : null;
      const pdfBlob = await pdf(
        <OfferPdfDocument
          customer={customer}
          monthlyItems={monthlyItems}
          onceItems={onceItems}
          wartungItems={wartungItems}
          autoTerms={autoTerms}
          totals={totals}
          notes={notes}
          raten={raten}
          showFinancing={finanzOpen}
          creator={creatorInfo}
          mandatsRef={mandatsRef}
          acceptQrDataUrl={acceptQrDataUrl}
          serviceStartDate={serviceStartDate}
        />
      ).toBlob();
      // Ensure correct MIME type for mobile browsers
      const blob = new Blob([pdfBlob], { type: 'application/pdf' });

      // Generate filename
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const customerName = (customer.company || customer.name || 'Kunde')
        .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 30);
      const filename = `KITZ_Angebot_${customerName}_${dateStr}.pdf`;

      // Trigger download
      const url = URL.createObjectURL(blob);

      // Check if mobile device
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile) {
        // On mobile, open in new tab for better compatibility
        window.open(url, '_blank');
        // Delay cleanup to allow the new tab to load
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        // On desktop, use download link
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Delay cleanup to ensure download starts
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Fehler beim Erstellen der PDF. Bitte versuchen Sie es erneut.');
    } finally {
      setPdfLoading(false);
    }
  }

  function handleCopy() {
    const body = buildOfferText();
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleCopyLink() {
    if (!supabase) { alert('Supabase nicht konfiguriert'); return; }
    if (!creator) { alert('Bitte wähle einen Ersteller aus.'); return; }

    try {
      // Save offer first
      const creatorInfo = TEAM.find(t => t.id === creator);
      const result = await saveOffer({
        id: currentOfferId,
        customer,
        creator,
        creatorName: creatorInfo?.name || creator,
        cart,
        globalTier,
        notes,
        raten,
        finanzOpen,
        totalMonthly: totals.monthly,
        totalOnce: totals.once,
        totalPeriod: totals.periodTotal,
        mandatsRef,
        customItems: getCustomItemsFromCart(),
        cartOrder,
        serviceStartDate,
      });
      setCurrentOfferId(result.id);

      // Generate share code if not already set
      let code = shareCode || result.share_code;
      if (!code) {
        code = Math.random().toString(36).slice(2, 10);
        await setShareCode(result.id, code);
      }
      setShareCodeState(code);

      const url = `${window.location.origin}${window.location.pathname}?s=${code}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      alert('Fehler beim Erstellen des Links: ' + err.message);
    }
  }

  async function handleSave() {
    if (!supabase) { alert('Supabase nicht konfiguriert'); return; }
    if (!creator) { alert('Bitte wähle einen Ersteller aus.'); return; }
    const creatorInfo = TEAM.find(t => t.id === creator);
    setSaving(true);
    try {
      const result = await saveOffer({
        id: currentOfferId,
        customer,
        creator,
        creatorName: creatorInfo?.name || creator,
        cart,
        globalTier,
        notes,
        raten,
        finanzOpen,
        totalMonthly: totals.monthly,
        totalOnce: totals.once,
        totalPeriod: totals.periodTotal,
        mandatsRef,
        customItems: getCustomItemsFromCart(),
        cartOrder,
        serviceStartDate,
      });
      setCurrentOfferId(result.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEmailPreview() {
    if (!supabase) { alert('Supabase nicht konfiguriert'); return; }
    if (!customer.email) { alert('Bitte eine Kunden-E-Mail angeben.'); return; }
    if (!creator) { alert('Bitte einen Ersteller auswählen.'); return; }
    setShowEmailPreview(true);
  }

  async function handleSend(emailText) {

    // Always save before sending to ensure DB has latest data (email, etc.)
    const creatorInfoForSave = TEAM.find(t => t.id === creator);
    setSaving(true);
    let offerId;
    try {
      const result = await saveOffer({
        id: currentOfferId || null,
        customer,
        creator,
        creatorName: creatorInfoForSave?.name || creator,
        cart, globalTier, notes, raten, finanzOpen,
        totalMonthly: totals.monthly,
        totalOnce: totals.once,
        totalPeriod: totals.periodTotal,
        mandatsRef,
        customItems: getCustomItemsFromCart(),
        cartOrder,
        serviceStartDate,
      });
      offerId = result.id;
      setCurrentOfferId(offerId);
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);

    setSending(true);
    try {
      // Generate PDF blob
      const creatorInfo = TEAM.find(t => t.id === creator);
      const validSendEntries = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
      const monthlyItems = validSendEntries
        .filter(([id, c]) => isMonthly(ALL[id], c.mode))
        .map(([id, c]) => {
          const item = ALL[id];
          const p = price(item, c.tier, c.mode);
          const dp = discountedPrice(item, c.tier, c.mode);
          return {
            id, qty: c.qty || 0, discountQty: c.discountQty || 0,
            code: item.code || '', name: item.name, info: item.info,
            tier: c.tier, mode: c.mode, type: item.t,
            unitPrice: p, discountPrice: dp,
            hasDiscount: hasDiscount(item), discountLabel: item.discount?.label,
            lineTotal: (p * (c.qty || 0)) + (dp * (c.discountQty || 0)),
          };
        });

      const onceItems = validSendEntries
        .filter(([id, c]) => !isMonthly(ALL[id], c.mode))
        .map(([id, c]) => {
          const item = ALL[id];
          const p = price(item, c.tier, c.mode);
          const dp = discountedPrice(item, c.tier, c.mode);
          return {
            id, qty: c.qty || 0, discountQty: c.discountQty || 0,
            code: item.code || '', name: item.name, info: item.info,
            tier: c.tier, mode: c.mode, type: item.t,
            unitPrice: p, discountPrice: dp,
            hasDiscount: hasDiscount(item), discountLabel: item.discount?.label,
            lineTotal: (p * (c.qty || 0)) + (dp * (c.discountQty || 0)),
          };
        });

      const wartungItems = buildWartungItems(validSendEntries);
      const autoTerms = computeAutoTerms(cart);

      // Ensure a share_code exists so the accept URL works (only needed when billing is enabled)
      let effectiveShareCode = shareCode;
      if (billingEnabled && !effectiveShareCode) {
        effectiveShareCode = Math.random().toString(36).slice(2, 10);
        await setShareCode(offerId, effectiveShareCode);
        setShareCodeState(effectiveShareCode);
      }
      const acceptQrDataUrl = billingEnabled ? await generateAcceptQr(effectiveShareCode) : null;
      const pdfBlob = await pdf(
        <OfferPdfDocument
          customer={customer} monthlyItems={monthlyItems} onceItems={onceItems}
          wartungItems={wartungItems} autoTerms={autoTerms}
          totals={totals} notes={notes} raten={raten}
          showFinancing={finanzOpen} creator={creatorInfo}
          mandatsRef={mandatsRef}
          acceptQrDataUrl={acceptQrDataUrl}
          serviceStartDate={serviceStartDate}
        />
      ).toBlob();

      // Convert to base64
      const buffer = await pdfBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const customerName = (customer.company || customer.name || 'Kunde')
        .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_').substring(0, 30);
      const filename = `KITZ_Angebot_${customerName}_${dateStr}.pdf`;

      await sendOffer(offerId, base64, filename, emailText, { includeAcceptLink: billingEnabled });
      try { await updateOfferStage(offerId, 'offer_sent'); } catch {}
      setShowEmailPreview(false);
      alert('Angebot erfolgreich gesendet!');
    } catch (err) {
      alert('Fehler beim Senden: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleSign(signatures) {
    // Build PDF items (same as handlePrint)
    const creatorInfo = TEAM.find(t => t.id === creator) || null;
    const validSignEntries = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
    const monthlyItems = validSignEntries
      .filter(([id, c]) => isMonthly(ALL[id], c.mode))
      .map(([id, c]) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode);
        const dp = discountedPrice(item, c.tier, c.mode);
        return {
          id, qty: c.qty || 0, discountQty: c.discountQty || 0,
          code: item.code || '', name: item.name, info: item.info,
          tier: c.tier, mode: c.mode, type: item.t,
          unitPrice: p, discountPrice: dp,
          hasDiscount: hasDiscount(item), discountLabel: item.discount?.label,
          lineTotal: (p * (c.qty || 0)) + (dp * (c.discountQty || 0)),
        };
      });

    const onceItems = validSignEntries
      .filter(([id, c]) => !isMonthly(ALL[id], c.mode))
      .map(([id, c]) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode);
        const dp = discountedPrice(item, c.tier, c.mode);
        return {
          id, qty: c.qty || 0, discountQty: c.discountQty || 0,
          code: item.code || '', name: item.name, info: item.info,
          tier: c.tier, mode: c.mode, type: item.t,
          unitPrice: p, discountPrice: dp,
          hasDiscount: hasDiscount(item), discountLabel: item.discount?.label,
          lineTotal: (p * (c.qty || 0)) + (dp * (c.discountQty || 0)),
        };
      });

    const wartungItems = buildWartungItems(validSignEntries);
    const autoTerms = computeAutoTerms(cart);

    // Generate signed PDF
    const acceptQrDataUrl = billingEnabled ? await generateAcceptQr(shareCode) : null;
    const pdfBlob = await pdf(
      <OfferPdfDocument
        customer={customer} monthlyItems={monthlyItems} onceItems={onceItems}
        wartungItems={wartungItems} autoTerms={autoTerms}
        totals={totals} notes={notes} raten={raten}
        showFinancing={finanzOpen} creator={creatorInfo}
        mandatsRef={mandatsRef} signatures={signatures}
        acceptQrDataUrl={acceptQrDataUrl}
        serviceStartDate={serviceStartDate}
      />
    ).toBlob();
    const blob = new Blob([pdfBlob], { type: 'application/pdf' });

    // Build filename
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const customerName = (customer.company || customer.name || 'Kunde')
      .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_').substring(0, 30);
    const filename = `KITZ_Vertrag_${customerName}_${dateStr}.pdf`;

    // Upload + update offer
    await signOffer(currentOfferId, signatures, blob, filename);

    // Trigger download
    const url = URL.createObjectURL(blob);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    setShowSignModal(false);
  }

  async function handleLoadOffer(id, duplicate = false) {
    try {
      const offer = await getOffer(id);
      const data = offer.offer_data || {};
      clearCustomItems();
      restoreCustomItems(data.customItems);
      const { cart: validCart, cartOrder: validOrder } = sanitizeCart(data.cart || {}, data.cartOrder || []);
      setCart(validCart);
      setCartOrder(validOrder);
      setCustomer({
        name: offer.customer_name || '',
        company: offer.customer_company || '',
        email: offer.customer_email || '',
        phone: offer.customer_phone || '',
        address: data.address || '',
      });
      setCreator(offer.creator_id || '');
      setNotes(data.notes || '');
      setRaten(data.raten || 12);
      setFinanzOpen(data.finanzOpen || false);
      setGlobalTier(data.globalTier || '12mo');
      setMandatsRef(data.mandatsRef || Date.now().toString().slice(-12));
      setServiceStartDate(offer.service_start_date || new Date().toISOString().slice(0, 10));
      setCurrentOfferId(duplicate ? null : offer.id);
      setShareCodeState(duplicate ? null : offer.share_code || null);
      setOfferView('builder'); setBuilderTab('angebot');
    } catch (err) {
      alert('Fehler beim Laden: ' + err.message);
    }
  }

  function handleNewOffer() {
    clearCustomItems();
    setCart({});
    setCartOrder([]);
    setCustomer({name:'',company:'',email:'',phone:'',address:''});
    setNotes('');
    setRaten(12);
    setCurrentOfferId(null);
    setShareCodeState(null);
    setCreator('');
    setFinanzOpen(false);
    setGlobalTier('12mo');
    setMandatsRef(Date.now().toString().slice(-12));
    setServiceStartDate(new Date().toISOString().slice(0, 10));
    setBuilderTab('bessa');
    setOfferView('builder');
  }

  function handleReset() {
    if (confirm('Angebot zurücksetzen?')) {
      clearCustomItems();
        setCart({});
      setCartOrder([]);
      setCustomer({name:'',company:'',email:'',phone:'',address:''});
      setNotes('');
      setRaten(12);
      setCurrentOfferId(null);
      setMandatsRef(Date.now().toString().slice(-12));
    }
  }

  return (
    <AppShell
      activeSection={section}
      onNavigate={(s) => { setSection(s); if (s === 'angebote') setOfferView('list'); }}
      showBillingToggle={isBillingAdmin}
      billingToggle={billingToggle}
      onToggleBilling={setBillingToggle}
    >
      {/* ═══ ANGEBOTE SECTION ═══ */}
      {section === 'angebote' && offerView === 'list' && (
        <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
          <OfferListPage onLoad={handleLoadOffer} onNew={handleNewOffer} />
        </div>
      )}

      {section === 'angebote' && offerView === 'builder' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Builder header bar */}
          <div className="no-print border-b border-slate-200 bg-white flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-2 md:px-5 md:py-3">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <button
                  onClick={() => setOfferView('list')}
                  className="flex items-center gap-1 text-slate-500 hover:text-red-600 transition-colors flex-shrink-0"
                  style={{ fontSize: 13 }}
                >
                  <ArrowLeft size={16} />
                  <span className="hidden sm:inline">Alle Angebote</span>
                </button>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="font-semibold text-slate-700 truncate" style={{ fontSize: 14 }}>
                  {currentOfferId ? 'Bearbeiten' : 'Neues Angebot'}
                </span>
                {cartCount > 0 && (
                  <span className="bg-red-100 text-red-600 rounded-full px-2 flex-shrink-0" style={{ fontSize: 11 }}>{cartCount}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {cartCount > 0 && (
                  <button onClick={handleReset} className="flex items-center gap-1 rounded-lg bg-slate-100 text-slate-600 px-2 py-1.5 md:px-3 hover:bg-slate-200 transition-colors" style={{ fontSize: 12 }}>
                    <Trash2 size={13} /> <span className="hidden sm:inline">Zurücksetzen</span>
                  </button>
                )}
              </div>
            </div>

            {/* Builder sub-tabs */}
            <div className="flex items-center justify-between px-3 pb-2 md:px-5 gap-2">
              <div className="flex gap-0.5 md:gap-1 overflow-x-auto min-w-0">
                {BUILDER_TABS.map(t => (
                  <button key={t.id} onClick={() => setBuilderTab(t.id)}
                    className={`relative px-2 py-2 md:px-3 font-medium transition-colors rounded-t-lg whitespace-nowrap flex-shrink-0 ${builderTab === t.id ? 'text-red-600 bg-red-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    style={{ fontSize: 12 }}>
                    {t.label}
                    {t.id === 'angebot' && cartCount > 0 && (
                      <span className="ml-1 bg-red-600 text-white rounded-full" style={{ fontSize: 9, padding: '1px 5px' }}>{cartCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tier selector – Bessa tab only */}
            {builderTab === 'bessa' && (
              <div className="flex items-center gap-2 px-3 pb-2 md:px-5">
                <span className="text-slate-500" style={{ fontSize: 11 }}>Laufzeit:</span>
                <div className="flex gap-0.5 md:gap-1">
                  {TIERS.map(t => (
                    <button key={t} onClick={() => setGlobalTier(t)}
                      className={`rounded-lg font-medium transition-all ${globalTier === t ? 'bg-red-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      style={{ fontSize: 10, padding: '4px 8px' }}>
                      {TIER_SHORT[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Product search bar */}
            {builderTab !== 'angebot' && (
              <div className="px-3 pb-3 md:px-5">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Produkt suchen..."
                    className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Builder content */}
          <div className="flex-1 overflow-auto px-3 py-3 md:px-6 md:py-4 md:pb-8">
            {search.trim() && builderTab !== 'angebot' ? (
              (() => {
                const q = search.toLowerCase().trim();
                const allItems = [...BESSA, ...MELZER, ...RCH, ...HARDWARE, ...UNIFY, ...KUECHENMONITORE, ...KUECHENMONITORE_SUNMI, ...ORDERMAN, ...DIENSTLEISTUNGEN];
                const results = allItems.filter(item =>
                  item.name.toLowerCase().includes(q) ||
                  (item.code && item.code.toLowerCase().includes(q)) ||
                  (item.note && item.note.toLowerCase().includes(q))
                );
                return (
                  <div>
                    <div className="text-sm text-slate-500 mb-3">{results.length} Ergebnis{results.length !== 1 ? 'se' : ''} für &ldquo;{search}&rdquo;</div>
                    {results.length > 0 ? (
                      <div className="space-y-2">
                        {results.map(item => (
                          <ItemCard key={item.id} item={item} cartItem={cart[item.id]} globalTier={globalTier} {...handlers} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <Search size={32} className="mx-auto mb-2 opacity-50" />
                        <p>Keine Produkte gefunden</p>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <>
                {builderTab === 'bessa' && <TabContent items={BESSA} cart={cart} globalTier={globalTier} handlers={handlers} />}
                {builderTab === 'melzer' && <TabContent items={MELZER} cart={cart} globalTier={globalTier} handlers={handlers} />}
                {builderTab === 'rch' && (
                  RCH.length > 0
                    ? <TabContent items={RCH} cart={cart} globalTier={globalTier} handlers={handlers} />
                    : <div className="text-center py-12 text-slate-400"><p className="font-medium">Noch keine RCH-Produkte hinterlegt</p></div>
                )}
                {builderTab === 'hardware' && (
                  <>
                    <CatGroup title="Hardware" items={HARDWARE} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Netzwerk (Unify)" items={UNIFY} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Drucker" items={DRUCKER} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Küchenmonitore" items={KUECHENMONITORE} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Küchenmonitore Sunmi" items={KUECHENMONITORE_SUNMI} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Orderman" items={ORDERMAN} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Dienstleistungen" items={DIENSTLEISTUNGEN} cart={cart} globalTier={globalTier} handlers={handlers} />
                  </>
                )}
                {builderTab === 'angebot' && (
                  <>
                    <OfferView cart={cart} customer={customer} setCustomer={setCustomer} creator={creator} setCreator={setCreator} notes={notes} setNotes={setNotes}
                      totals={totals} onPrint={handlePrint} onCopy={handleCopy} copied={copied} onCopyLink={handleCopyLink} linkCopied={linkCopied} raten={raten} setRaten={setRaten} pdfLoading={pdfLoading} finanzOpen={finanzOpen} setFinanzOpen={setFinanzOpen} globalTier={globalTier}
                      serviceStartDate={serviceStartDate} setServiceStartDate={setServiceStartDate}
                      billingEnabled={billingEnabled}
                      onSave={handleSave} onSend={openEmailPreview} saving={saving} sending={sending} saveSuccess={saveSuccess} currentOfferId={currentOfferId}
                      onSign={() => setShowSignModal(true)} onAddCustom={() => setShowCustomModal(true)}
                      cartOrder={cartOrder} onReorder={setCartOrder} onRemoveItem={handlers.onRemove} onEditItem={handleEditItem} />
                    {showEmailPreview && (
                      <EmailPreviewModal
                        customer={customer}
                        creator={TEAM.find(t => t.id === creator)}
                        totals={totals}
                        sending={sending}
                        onSend={handleSend}
                        onClose={() => setShowEmailPreview(false)}
                      />
                    )}
                    {showCustomModal && (
                      <CustomItemModal onConfirm={handleAddCustomItem} onClose={() => setShowCustomModal(false)} />
                    )}
                    {showSignModal && (
                      <SignModal customer={customer} totals={totals} finanzOpen={finanzOpen} globalTier={globalTier}
                        onConfirm={handleSign} onClose={() => setShowSignModal(false)} />
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Bottom bar — cart summary + go to Angebot tab */}
          {builderTab !== 'angebot' && (
            <div className="border-t border-slate-200 bg-white px-5 py-3 flex-shrink-0 no-print">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1 text-slate-400" style={{ fontSize: 11 }}>
                    <ShoppingCart size={13} />
                    <span>{cartCount} {cartCount === 1 ? 'Position' : 'Positionen'}</span>
                  </div>
                  <div className="flex gap-4 mt-0.5">
                    {totals.monthly > 0 && <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>€ {fmt(totals.monthly)}<span className="font-normal text-slate-400" style={{ fontSize: 11 }}>/Mo</span></span>}
                    {totals.once > 0 && <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>€ {fmt(totals.once)}<span className="font-normal text-slate-400" style={{ fontSize: 11 }}> einm.</span></span>}
                    {totals.monthly === 0 && totals.once === 0 && <span className="text-slate-400" style={{ fontSize: 13 }}>Noch keine Auswahl</span>}
                  </div>
                </div>
                <button onClick={() => setBuilderTab('angebot')}
                  className="flex items-center gap-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 active:scale-[0.97] transition-all shadow-lg shadow-red-200"
                  style={{ padding: '10px 20px', fontSize: 14 }}>
                  <FileText size={16} />
                  Angebot
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CRM SECTION ═══ */}
      {section === 'crm' && (
        <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
          <React.Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-red-400" size={24} /></div>}>
            <CrmPage />
          </React.Suspense>
        </div>
      )}
    </AppShell>
  );
}
