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
import AppShell from './components/AppShell';
import CustomerPicker from './components/CustomerPicker';

const CrmPage = React.lazy(() => import('./components/CrmPage.jsx'));

// ═══════════════════════════════════════════════════════
// DATA — see src/features/offers/data/catalogs.ts
// ═══════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const fmt = n => n.toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2});

// Returns [id, cartItem][] in user-defined order, with fallback for items not in cartOrder
function orderedCartEntries(cart, cartOrder) {
  const ids = Object.keys(cart);
  if (!cartOrder || cartOrder.length === 0) return ids.map(id => [id, cart[id]]);
  const ordered = [];
  const seen = new Set();
  for (const id of cartOrder) {
    if (cart[id]) { ordered.push([id, cart[id]]); seen.add(id); }
  }
  for (const id of ids) {
    if (!seen.has(id)) ordered.push([id, cart[id]]);
  }
  return ordered;
}

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
// SIGN MODAL
// ═══════════════════════════════════════════════════════

function SignModal({ customer, totals, finanzOpen, globalTier, onConfirm, onClose }) {
  const offerPadRef = useRef(null);
  const sepaPadRef = useRef(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(null);
  const showSepa = finanzOpen && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0);

  const TIER_LABEL_MAP = { '12mo':'12 Monate','6mo':'6 Monate','2mo':'2 Monate','event':'1-3 Tage' };

  async function handleConfirm() {
    if (offerPadRef.current.isEmpty()) { setError('Bitte Auftragsbestätigung unterschreiben.'); return; }
    if (showSepa && sepaPadRef.current.isEmpty()) { setError('Bitte SEPA-Mandat unterschreiben.'); return; }
    setError(null);
    setSigning(true);
    try {
      const signatures = { offer: offerPadRef.current.toDataURL() };
      if (showSepa) signatures.sepa = sepaPadRef.current.toDataURL();
      await onConfirm(signatures);
    } catch (err) {
      setError(err.message);
      setSigning(false);
    }
  }

  function handleClear() {
    offerPadRef.current?.clear();
    sepaPadRef.current?.clear();
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ overflowY: 'auto' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="font-bold" style={{ fontSize: 18 }}>Vertrag unterschreiben</div>
          <div className="text-slate-400" style={{ fontSize: 12 }}>KITZ Computer + Office GmbH</div>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20"><X size={20} /></button>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-6 space-y-6 max-w-lg mx-auto w-full">
        {/* Offer summary */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="font-bold text-slate-800 mb-1" style={{ fontSize: 15 }}>{customer.company || customer.name || 'Kunde'}</div>
          {customer.company && customer.name && <div className="text-slate-500 text-sm">{customer.name}</div>}
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-200">
            {totals.monthly > 0 && (
              <div>
                <div className="text-slate-400" style={{ fontSize: 11 }}>Monatlich</div>
                <div className="font-bold text-slate-800">€ {fmt(totals.monthly * 1.2)} brutto</div>
              </div>
            )}
            {totals.once > 0 && (
              <div>
                <div className="text-slate-400" style={{ fontSize: 11 }}>Einmalig</div>
                <div className="font-bold text-slate-800">€ {fmt(totals.once * 1.2)} brutto</div>
              </div>
            )}
            <div>
              <div className="text-slate-400" style={{ fontSize: 11 }}>Laufzeit</div>
              <div className="font-bold text-slate-800">{TIER_LABEL_MAP[globalTier] || globalTier}</div>
            </div>
          </div>
        </div>

        {/* Signature 1: Auftragsbestätigung */}
        <div>
          <div className="font-bold text-slate-700 mb-2" style={{ fontSize: 14 }}>Auftragsbestätigung</div>
          <div className="text-slate-500 mb-3" style={{ fontSize: 12 }}>
            Mit meiner Unterschrift bestätige ich die Annahme dieses Angebots.
          </div>
          <SignaturePad ref={offerPadRef} width={Math.min(400, window.innerWidth - 40)} height={150} />
        </div>

        {/* Signature 2: SEPA (conditional) */}
        {showSepa && (
          <div>
            <div className="font-bold text-slate-700 mb-2" style={{ fontSize: 14 }}>SEPA Lastschrift-Mandat</div>
            <div className="text-slate-500 mb-3" style={{ fontSize: 12 }}>
              Ich ermächtige die Kitz Computer + Office GmbH, Zahlungen mittels SEPA-Lastschrift einzuziehen.
            </div>
            <SignaturePad ref={sepaPadRef} width={Math.min(400, window.innerWidth - 40)} height={150} />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{error}</div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="border-t border-slate-200 px-5 py-4 flex gap-3 flex-shrink-0" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={handleClear} disabled={signing}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 transition-all disabled:opacity-50"
          style={{ fontSize: 14 }}>
          <Trash2 size={16} /> Löschen
        </button>
        <button onClick={handleConfirm} disabled={signing}
          className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold py-3.5 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200 disabled:opacity-70"
          style={{ fontSize: 14 }}>
          {signing ? <Loader2 size={18} className="animate-spin" /> : <Pen size={18} />}
          {signing ? 'Wird verarbeitet...' : 'Unterschreiben & Abschließen'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CUSTOM ITEM MODAL
// ═══════════════════════════════════════════════════════

function CustomItemModal({ onConfirm, onClose }) {
  const [name, setName] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const p = parseFloat(itemPrice);
    if (!name.trim() || isNaN(p) || p < 0) return;
    onConfirm({ name: name.trim(), price: p });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold" style={{ fontSize: 16 }}>Freie Position</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bezeichnung</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Spezialgehäuse"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preis netto</label>
            <input type="number" step="0.01" min="0" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder="0,00"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          </div>
          <button type="submit" disabled={!name.trim() || !itemPrice || isNaN(parseFloat(itemPrice))}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white font-semibold py-3 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontSize: 14 }}>
            <Plus size={18} /> Hinzufügen
          </button>
        </form>
      </div>
    </div>
  );
}

function EditItemModal({ item, cartItem, globalTier, monthly, onSave, onRemove, onClose }) {
  const [qty, setQty] = useState(cartItem.qty || 0);
  const [discountQty, setDiscountQty] = useState(cartItem.discountQty || 0);
  const currentPrice = price(item, cartItem.tier, cartItem.mode);
  const [itemPrice, setItemPrice] = useState(String(currentPrice ?? 0));
  const totalQty = qty + discountQty;

  function handleSubmit(e) {
    e.preventDefault();
    if (totalQty < 1) { onRemove(); return; }
    const result = { qty, discountQty };
    if (!monthly) {
      const p = parseFloat(itemPrice);
      if (isNaN(p) || p < 0) return;
      result.price = p;
    }
    onSave(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
          <span className="font-bold truncate mr-2" style={{ fontSize: 16 }}>{item.name}</span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20 flex-shrink-0"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Menge</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setQty(Math.max(0, qty - 1))} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Minus size={16} /></button>
              <input type="number" min="0" value={qty} onChange={e => setQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 text-center border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
              <button type="button" onClick={() => setQty(qty + 1)} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Plus size={16} /></button>
            </div>
          </div>
          {hasDiscount(item) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rabatt-Menge ({item.discount?.label})</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setDiscountQty(Math.max(0, discountQty - 1))} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Minus size={16} /></button>
                <input type="number" min="0" value={discountQty} onChange={e => setDiscountQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 text-center border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
                <button type="button" onClick={() => setDiscountQty(discountQty + 1)} className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200 transition-colors"><Plus size={16} /></button>
              </div>
            </div>
          )}
          {!monthly && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preis netto (€)</label>
              <input type="number" step="0.01" min="0" value={itemPrice} onChange={e => setItemPrice(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
            </div>
          )}
          <button type="submit"
            className={`w-full flex items-center justify-center gap-2 rounded-xl font-semibold py-3 active:scale-[0.98] transition-all ${totalQty < 1 ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-600 text-white hover:bg-red-700'}`}
            style={{ fontSize: 14 }}>
            {totalQty < 1 ? <><Trash2 size={18} /> Entfernen</> : <><Check size={18} /> Übernehmen</>}
          </button>
        </form>
      </div>
    </div>
  );
}

function EmailPreviewModal({ customer, creator, totals, onSend, onClose, sending }) {
  const customerName = customer.name || customer.company || 'Kunde';
  const creatorName = creator?.name || 'Kitz Team';
  const companyName = customer.company || customer.name || 'Angebot';

  const [subject, setSubject] = useState(`Ihr Angebot von Kitz Computer & Office GmbH – ${companyName}`);
  const [greeting, setGreeting] = useState(`Sehr geehrte/r ${customerName},`);
  const [body, setBody] = useState('vielen Dank für Ihr Interesse. Anbei erhalten Sie Ihr persönliches Angebot als PDF-Anhang.');
  const [closing, setClosing] = useState('Bei Fragen stehe ich Ihnen jederzeit gerne zur Verfügung.');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-600 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={18} />
            <span className="font-bold" style={{ fontSize: 16 }}>E-Mail Vorschau</span>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* To */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 font-medium w-12">An:</span>
            <span className="text-slate-700 font-medium">{customer.email}</span>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Betreff</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>

          {/* Email preview */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Header preview */}
            <div className="bg-slate-700 px-6 py-4 text-center">
              <div className="inline-block bg-white text-red-600 font-bold px-3 py-1.5 rounded-lg" style={{fontSize:14}}>KITZ</div>
              <div className="text-white text-xs mt-1">Computer & Office GmbH</div>
            </div>

            <div className="p-5 space-y-3">
              {/* Greeting */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Anrede</label>
                <input value={greeting} onChange={e => setGreeting(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nachricht</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>

              {/* Summary box (non-editable) */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="font-bold text-slate-700 text-xs mb-2">Zusammenfassung</div>
                {totals.monthly > 0 && (
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Monatliche Kosten (netto)</span>
                    <span className="font-semibold text-slate-800">€ {fmt(totals.monthly)}/Mo</span>
                  </div>
                )}
                {totals.once > 0 && (
                  <div className="flex justify-between text-xs text-slate-600 mt-1">
                    <span>Einmalige Kosten (netto)</span>
                    <span className="font-semibold text-slate-800">€ {fmt(totals.once)}</span>
                  </div>
                )}
              </div>

              {/* Closing */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Abschluss</label>
                <input value={closing} onChange={e => setClosing(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>

              <div className="text-sm text-slate-600">Mit freundlichen Grüßen</div>

              {/* Signature (non-editable) */}
              <div className="border-t border-slate-200 pt-3">
                <div className="font-bold text-slate-700 text-sm">{creatorName}</div>
                <div className="text-slate-400 text-xs">Kitz Computer & Office GmbH</div>
                <div className="text-slate-400 text-xs">www.kitz.co.at</div>
              </div>
            </div>

            {/* Footer preview */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 text-center">
              <div className="text-slate-400" style={{fontSize:10}}>
                Kitz Computer & Office GmbH | Johann-Offner-Str. 17, 9400 Wolfsberg | Rosentalerstr. 1, 9020 Klagenfurt
              </div>
            </div>
          </div>

          {/* PDF attachment indicator */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
            <FileText size={14} className="text-red-500" />
            <span className="text-xs text-slate-600 font-medium">PDF-Angebot wird angehängt</span>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-slate-200 p-4 flex gap-2 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3 hover:bg-slate-200 active:scale-[0.98] transition-all"
            style={{fontSize:14}}>
            Abbrechen
          </button>
          <button onClick={() => onSend({ subject, greeting, body, closing })} disabled={sending}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200 ${sending ? 'opacity-70 cursor-wait' : ''}`}
            style={{fontSize:14}}>
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {sending ? 'Senden...' : 'Jetzt senden'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SORTABLE ITEM ROW
// ═══════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════
// OFFER / ANGEBOT VIEW
// ═══════════════════════════════════════════════════════

function OfferView({ cart, customer, setCustomer, creator, setCreator, notes, setNotes, totals, onPrint, onCopy, copied, onCopyLink, linkCopied, raten, setRaten, pdfLoading, finanzOpen, setFinanzOpen, globalTier, serviceStartDate, setServiceStartDate, billingEnabled = false, onSave, onSend, saving, sending, saveSuccess, currentOfferId, onSign, signLoading, onAddCustom, cartOrder, onReorder, onRemoveItem, onEditItem }) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // { id, item, cartItem, monthly }
  const allOrdered = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
  const monthlyItems = allOrdered.filter(([id,c]) => isMonthly(ALL[id], c.mode));
  const onceItems = allOrdered.filter(([id,c]) => !isMonthly(ALL[id], c.mode));
  const wartungItems = allOrdered.filter(([id]) => ALL[id]?.servicePercent > 0);
  const autoTerms = computeAutoTerms(cart);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  function handleDragEnd(event, sectionItems) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sectionIds = sectionItems.map(([id]) => id);
    const oldIndex = sectionIds.indexOf(active.id);
    const newIndex = sectionIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedSection = arrayMove(sectionIds, oldIndex, newIndex);
    // Rebuild full cartOrder preserving relative order of other section
    const otherSection = allOrdered.filter(([id, c]) => !sectionItems.some(([sid]) => sid === id)).map(([id]) => id);
    // Determine if this section is monthly
    const isThisMonthly = sectionItems.length > 0 && isMonthly(ALL[sectionItems[0][0]], cart[sectionItems[0][0]]?.mode);
    const newOrder = isThisMonthly ? [...reorderedSection, ...otherSection] : [...otherSection, ...reorderedSection];
    onReorder(newOrder);
  }

  const periodNetto = totals.periodTotal;
  const periodBrutto = periodNetto * 1.2;

  return (
    <div>
      {/* Customer info */}
      <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden" style={{padding:'16px'}}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <User size={16} className="text-red-600" />
            <span className="font-bold text-slate-700" style={{fontSize:14}}>Kundendaten</span>
            {customer.mesonicId && (
              <span className="bg-emerald-50 text-emerald-600 rounded-full px-2" style={{fontSize:10}}>Mesonic #{customer.mesonicId}</span>
            )}
          </div>
          <button
            onClick={() => setShowCustomerPicker(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-600 px-3 py-1.5 hover:bg-red-50 hover:text-red-600 transition-colors"
            style={{fontSize:12}}
          >
            <Search size={13} /> Bestandskunde
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Firma" value={customer.company} onChange={e => setCustomer({...customer,company:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="Ansprechpartner" value={customer.name} onChange={e => setCustomer({...customer,name:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="E-Mail" type="email" value={customer.email} onChange={e => setCustomer({...customer,email:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="Telefon" type="tel" value={customer.phone} onChange={e => setCustomer({...customer,phone:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
        </div>
        <input placeholder="Adresse (Straße, PLZ Ort)" value={customer.address} onChange={e => setCustomer({...customer,address:e.target.value})}
          className="w-full mt-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
        {showCustomerPicker && (
          <CustomerPicker
            onSelect={(c) => {
              setCustomer({ name: c.name, company: c.company, email: c.email, phone: c.phone, address: c.address, mesonicId: c.mesonicId });
              setShowCustomerPicker(false);
            }}
            onClose={() => setShowCustomerPicker(false)}
          />
        )}
        <div className="mt-3">
          {creator && TEAM.find(t => t.id === creator) ? (
            <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700">
              Ersteller: <span className="font-medium">{TEAM.find(t => t.id === creator)?.name}</span>
            </div>
          ) : (
            <select value={creator} onChange={e => setCreator(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-white">
              <option value="">Angebot erstellt von...</option>
              {TEAM.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.role}, {t.location})</option>
              ))}
            </select>
          )}
        </div>
        {billingEnabled && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-500 mb-1">Leistungsbeginn</label>
            <input type="date" value={serviceStartDate || ''} onChange={e => setServiceStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-white" />
          </div>
        )}
      </div>

      {/* Add custom item */}
      <button onClick={onAddCustom}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-medium py-3 mb-4 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
        style={{ fontSize: 13 }}>
        <Plus size={16} /> Freie Position
      </button>

      {/* Cart empty state */}
      {Object.keys(cart).length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <ShoppingCart size={48} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">Noch keine Positionen gewählt</p>
          <p style={{fontSize:13}}>Wechsle zu Bessa, Melzer, RCH oder Hardware um Produkte hinzuzufügen.</p>
        </div>
      )}

      {/* Monthly items */}
      {monthlyItems.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden">
          <div className="bg-red-50 px-4 py-2 border-b border-red-100">
            <span className="font-bold text-red-800" style={{fontSize:13}}>MONATLICHE KOSTEN</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, monthlyItems)}>
            <SortableContext items={monthlyItems.map(([id]) => id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-slate-100">
                {monthlyItems.map(([id, c]) => {
                  const item = ALL[id];
                  const p = price(item, c.tier, c.mode);
                  const dp = discountedPrice(item, c.tier, c.mode);
                  const fullQty = c.qty || 0;
                  const discQty = c.discountQty || 0;
                  const lineTotal = (p * fullQty) + (dp * discQty);
                  const totalQty = fullQty + discQty;
                  const qtyLabel = discQty > 0 && fullQty > 0 ? `${fullQty}+${discQty}` : String(totalQty);
                  return (
                    <SortableOfferRow key={id} id={id}>
                      <div className="flex items-center justify-between pr-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700">{qtyLabel}x {item.code ? item.code+' ' : ''}{item.name}</span>
                          {c.tier && <span className="text-xs text-slate-400 ml-2">{TIER_LABEL[c.tier]}</span>}
                          {c.mode === 'rent' && item.t === 'term' && <span className="text-xs text-slate-400 ml-2">Miete</span>}
                          {discQty > 0 && <span className="text-xs text-green-600 ml-2">({item.discount?.label})</span>}
                        </div>
                        <span className="font-semibold text-slate-800 text-sm whitespace-nowrap">€ {fmt(lineTotal)}/Mo</span>
                        <button onClick={() => setEditingItem({ id, item, cartItem: c, monthly: true })} className="ml-2 text-slate-400 hover:text-red-500 transition-colors"><Pencil size={13} /></button>
                        {isCustomItem(id) && <button onClick={() => onRemoveItem(id)} className="ml-1 text-slate-400 hover:text-red-500 transition-colors"><X size={14} /></button>}
                      </div>
                    </SortableOfferRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Netto/Monat</span><span className="font-medium">€ {fmt(totals.monthly)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">20% USt</span><span className="font-medium">€ {fmt(totals.monthly*0.2)}</span></div>
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-slate-300"><span>Brutto/Monat</span><span className="text-red-700">€ {fmt(totals.monthly*1.2)}</span></div>
          </div>
        </div>
      )}

      {/* One-time items */}
      {onceItems.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden">
          <div className="bg-amber-50 px-4 py-2 border-b border-amber-100">
            <span className="font-bold text-amber-800" style={{fontSize:13}}>EINMALIGE KOSTEN</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, onceItems)}>
            <SortableContext items={onceItems.map(([id]) => id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-slate-100">
                {onceItems.map(([id, c]) => {
                  const item = ALL[id];
                  const p = price(item, c.tier, c.mode);
                  const dp = discountedPrice(item, c.tier, c.mode);
                  const fullQty = c.qty || 0;
                  const discQty = c.discountQty || 0;
                  const lineTotal = (p * fullQty) + (dp * discQty);
                  const totalQty = fullQty + discQty;
                  const qtyLabel = discQty > 0 && fullQty > 0 ? `${fullQty}+${discQty}` : String(totalQty);
                  return (
                    <SortableOfferRow key={id} id={id}>
                      <div className="flex items-center justify-between pr-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700">{qtyLabel}x {item.code ? item.code+' ' : ''}{item.name}</span>
                          {c.mode === 'buy' && <span className="text-xs text-slate-400 ml-2">Kauf</span>}
                          {item.t === 'h' && <span className="text-xs text-slate-400 ml-2">({fullQty} Std.)</span>}
                          {discQty > 0 && <span className="text-xs text-green-600 ml-2">({item.discount?.label})</span>}
                        </div>
                        <span className="font-semibold text-slate-800 text-sm whitespace-nowrap">€ {fmt(lineTotal)}</span>
                        <button onClick={() => setEditingItem({ id, item, cartItem: c, monthly: false })} className="ml-2 text-slate-400 hover:text-red-500 transition-colors"><Pencil size={13} /></button>
                        {isCustomItem(id) && <button onClick={() => onRemoveItem(id)} className="ml-1 text-slate-400 hover:text-red-500 transition-colors"><X size={14} /></button>}
                      </div>
                    </SortableOfferRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Netto</span><span className="font-medium">€ {fmt(totals.once)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">20% USt</span><span className="font-medium">€ {fmt(totals.once*0.2)}</span></div>
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-slate-300"><span>Brutto</span><span className="text-red-700">€ {fmt(totals.once*1.2)}</span></div>
          </div>
        </div>
      )}

      {/* Wartung pro Jahr (Melzer) */}
      {wartungItems.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-amber-200 mb-4 overflow-hidden">
          <div className="bg-amber-100 px-4 py-2 border-b border-amber-200">
            <span className="font-bold text-amber-900" style={{fontSize:13}}>WARTUNG PRO JAHR</span>
          </div>
          <div className="divide-y divide-slate-100">
            {wartungItems.map(([id, c]) => {
              const item = ALL[id];
              const totalQty = (c.qty || 0) + (c.discountQty || 0);
              const unit = yearlyServicePerUnit(item);
              const line = unit * totalQty;
              return (
                <div key={id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">{totalQty}x {item.code ? item.code+' ' : ''}{item.name}</span>
                    <span className="text-xs text-slate-400 ml-2">{item.servicePercent}% Wartung</span>
                  </div>
                  <span className="font-semibold text-amber-800 text-sm whitespace-nowrap">€ {fmt(line)}/Jahr</span>
                </div>
              );
            })}
          </div>
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Netto/Jahr</span><span className="font-medium">€ {fmt(totals.yearly)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">20% USt</span><span className="font-medium">€ {fmt(totals.yearly*0.2)}</span></div>
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-slate-300"><span>Brutto/Jahr</span><span className="text-amber-700">€ {fmt(totals.yearly*1.2)}</span></div>
          </div>
        </div>
      )}

      {/* Yearly summary */}
      {(totals.monthly > 0 || totals.once > 0 || totals.yearly > 0) && (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl mb-4 text-white overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <span className="font-bold" style={{fontSize:13}}>GESAMTÜBERSICHT</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <div className="text-sm text-slate-300">Kosten im ersten Jahr</div>
                <div className="text-xs text-slate-400">(monatlich × Laufzeit + einmalig{totals.yearly > 0 ? ' + Wartung' : ''})</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">€ {fmt(totals.periodTotal)} netto</div>
                <div className="font-bold text-lg text-red-400">€ {fmt(totals.periodTotal * 1.2)} brutto</div>
              </div>
            </div>
            {(totals.monthly > 0 && totals.once > 0) || totals.yearly > 0 ? (
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-slate-300">Kosten jedes weitere Jahr</div>
                  <div className="text-xs text-slate-400">(monatlich × Laufzeit{totals.yearly > 0 ? ' + Wartung' : ''})</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400">€ {fmt(totals.periodMonthly + totals.yearly)} netto</div>
                  <div className="font-bold text-lg text-white">€ {fmt((totals.periodMonthly + totals.yearly) * 1.2)} brutto</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Financing options */}
      {(totals.monthly > 0 || totals.once > 0 || totals.yearly > 0) && (
        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden">
          <button onClick={() => setFinanzOpen(!finanzOpen)} className="w-full bg-red-50 px-4 py-3 border-b border-red-100 flex items-center justify-between hover:bg-red-100 transition-colors">
            <span className="font-bold text-red-800" style={{fontSize:13}}>FINANZIERUNGSOPTIONEN</span>
            <ChevronDown size={18} className={`text-red-600 transition-transform ${finanzOpen ? 'rotate-180' : ''}`} />
          </button>

          {finanzOpen && <>
          {/* Option 1: Ratenzahlung */}
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold" style={{fontSize:12}}>1</span>
              <span className="font-bold text-slate-800" style={{fontSize:14}}>Ratenzahlung (+8%)</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Gesamtbetrag (+8%)</span>
                <span className="font-semibold">€ {fmt(periodBrutto * 1.08)} brutto</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Anzahlung (30%)</span>
                <span className="font-semibold text-red-700">€ {fmt(periodBrutto * 1.08 * 0.3)} brutto</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Restbetrag in</span>
                  <select value={raten} onChange={e => setRaten(Number(e.target.value))}
                    className="border border-slate-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:border-red-500">
                    {[2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n} Raten</option>)}
                  </select>
                </div>
                <span className="font-semibold">€ {fmt(periodBrutto * 1.08 * 0.7 / raten)}/Rate</span>
              </div>
            </div>
          </div>

          {/* Option 2: Miete */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold" style={{fontSize:12}}>2</span>
              <span className="font-bold text-slate-800" style={{fontSize:14}}>Miete (+8%)</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Kaution (einmalig)</span>
                <span className="font-semibold text-red-700">€ 500,00 brutto</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-sm text-slate-600">Monatliche Miete (+8%)</span>
                <span className="font-semibold">€ {fmt((periodBrutto / totals.maxMonths) * 1.08)}/Monat brutto</span>
              </div>
            </div>
          </div>
          </>}
        </div>
      )}

      {/* Auto-generated terms */}
      {autoTerms.length > 0 && (
        <div className="bg-amber-50 rounded-xl border-2 border-amber-200 mb-4" style={{padding:'14px 16px'}}>
          <span className="font-bold text-amber-900 block mb-2" style={{fontSize:13}}>Bedingungen</span>
          <ul className="list-disc pl-5 text-amber-900 space-y-1" style={{fontSize:12}}>
            {autoTerms.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-xl border-2 border-slate-200 mb-4" style={{padding:'16px'}}>
        <span className="font-bold text-slate-700 block mb-2" style={{fontSize:13}}>Anmerkungen</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optionale Anmerkungen zum Angebot..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
      </div>

      {/* Actions */}
      {Object.keys(cart).length > 0 && (
        <div className="space-y-2 no-print">
          {/* Row 1: Save + Send */}
          {supabase && (
            <div className="flex gap-2">
              <button onClick={onSave} disabled={saving}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold py-3.5 active:scale-[0.98] transition-all ${saveSuccess ? 'bg-green-100 text-green-700' : 'bg-slate-800 text-white hover:bg-slate-900'} ${saving ? 'opacity-70 cursor-wait' : ''}`}
                style={{fontSize:14}}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : saveSuccess ? <Check size={18} /> : <Save size={18} />}
                {saving ? 'Speichern...' : saveSuccess ? 'Gespeichert!' : currentOfferId ? 'Aktualisieren' : 'Speichern'}
              </button>
              <button onClick={onSend} disabled={sending || !customer.email}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold py-3.5 active:scale-[0.98] transition-all ${!customer.email ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'} ${sending ? 'opacity-70 cursor-wait' : ''}`}
                style={{fontSize:14}}>
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {sending ? 'Senden...' : 'Angebot senden'}
              </button>
            </div>
          )}
          {/* Row 2: Sign */}
          {supabase && currentOfferId && (
            <button onClick={onSign}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold py-3.5 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200"
              style={{fontSize:14}}>
              <Pen size={18} /> Unterschreiben
            </button>
          )}
          {/* Row 3: Copy + PDF */}
          <div className="flex gap-2">
            <button onClick={onCopyLink}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 active:scale-[0.98] transition-all"
              style={{fontSize:14, minWidth:'100px'}}>
              {linkCopied ? <Check size={18} /> : <Link size={18} />}
              {linkCopied ? 'Link kopiert!' : 'Link'}
            </button>
            <button onClick={onCopy}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 active:scale-[0.98] transition-all"
              style={{fontSize:14, minWidth:'100px'}}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Kopiert!' : 'Text'}
            </button>
            <button onClick={onPrint} disabled={pdfLoading}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white font-semibold py-3.5 hover:bg-red-700 active:scale-[0.98] transition-all shadow-lg shadow-red-200 ${pdfLoading ? 'opacity-70 cursor-wait' : ''}`}
              style={{fontSize:14, minWidth:'120px'}}>
              {pdfLoading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {pdfLoading ? 'PDF...' : 'PDF'}
            </button>
          </div>
        </div>
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem.item}
          cartItem={editingItem.cartItem}
          globalTier={globalTier}
          monthly={editingItem.monthly}
          onClose={() => setEditingItem(null)}
          onSave={(result) => {
            onEditItem(editingItem.id, result);
            setEditingItem(null);
          }}
          onRemove={() => {
            onRemoveItem(editingItem.id);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

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


function CreatorDropdown({ value, onChange, creators }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = value !== 'all';
  const label = active ? value : 'Alle';

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function select(v) { onChange(v); setOpen(false); }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium border transition-colors ${active ? 'bg-red-50 text-red-700 border-red-300' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
        style={{fontSize:11}}
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
            style={{fontSize:12}}
          >
            {value === 'all' && <Check size={12} />}
            <span className={value === 'all' ? 'font-medium' : 'ml-5'}>Alle Ersteller</span>
          </button>
          {creators.map(name => (
            <button
              key={name}
              onClick={() => select(name)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${value === name ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'}`}
              style={{fontSize:12}}
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

// Offer list component
function OfferList({ onLoad, onNew }) {
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

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  async function handleDelete(id) {
    if (!confirm('Angebot wirklich löschen?')) return;
    try {
      await deleteOffer(id);
      setOffers(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message);
    }
  }

  async function showDetail(id) {
    if (detailId === id) { setDetailId(null); return; }
    setDetailId(id);
    setEventsLoading(true);
    try {
      const evts = await getEmailEvents(id);
      setEvents(evts || []);
    } catch { setEvents([]); }
    finally { setEventsLoading(false); }
  }

  async function handleStageChange(id, newStage) {
    setStageLoading(id);
    const prev = offers.find(o => o.id === id)?.stage;
    setOffers(os => os.map(o => o.id === id ? { ...o, stage: newStage } : o));
    try {
      await updateOfferStage(id, newStage);
    } catch (err) {
      setOffers(os => os.map(o => o.id === id ? { ...o, stage: prev } : o));
      alert('Fehler: ' + err.message);
    } finally {
      setStageLoading(null);
    }
  }

  const creatorFiltered = creatorFilter === 'all' ? offers : offers.filter(o => o.creator_name === creatorFilter);
  const filteredOffers = stageFilter === 'all' ? creatorFiltered : creatorFiltered.filter(o => o.stage === stageFilter);
  const stageCounts = { all: creatorFiltered.length };
  for (const s of ['new', 'offer_sent', 'closed', 'lost']) {
    stageCounts[s] = creatorFiltered.filter(o => o.stage === s).length;
  }
  const uniqueCreators = [...new Set(offers.map(o => o.creator_name).filter(Boolean))].sort();
  const closedMonthly = offers.filter(o => o.stage === 'closed').reduce((sum, o) => sum + Number(o.total_monthly || 0), 0);

  if (!supabase) {
    return (
      <div className="text-center py-12 text-slate-400">
        <AlertCircle size={48} className="mx-auto mb-3 opacity-50" />
        <p className="font-medium">Supabase nicht konfiguriert</p>
        <p style={{fontSize:13}}>Setze VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in der .env Datei.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
        <p style={{fontSize:13}}>Angebote laden...</p>
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
          <span className="font-bold text-slate-700" style={{fontSize:14}}>Angebote</span>
          <span className="text-slate-400" style={{fontSize:12}}>({offers.length})</span>
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
          <button onClick={onNew} className="rounded-lg bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 transition-colors flex items-center gap-1 flex-shrink-0" style={{fontSize:12}}>
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
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setStageFilter(t.key)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${stageFilter === t.key ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            style={{fontSize:11}}
          >
            {t.label} ({stageCounts[t.key] || 0})
          </button>
        ))}
      </div>

      {/* Closed value summary */}
      {closedMonthly > 0 && (
        <div className="flex items-center gap-2 mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span className="font-medium text-emerald-700" style={{fontSize:12}}>
            Abgeschlossen: &euro; {fmt(closedMonthly)}/Mo
          </span>
        </div>
      )}

      {filteredOffers.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">Noch keine Angebote</p>
          <p style={{fontSize:13}}>Erstelle ein Angebot und speichere es hier.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredOffers.map(o => (
            <div key={o.id} className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800" style={{fontSize:13}}>
                        {o.customer_company || o.customer_name || 'Ohne Name'}
                      </span>
                      <StatusBadge status={o.status} />
                      <StageBadge stage={o.stage} />
                    </div>
                    {o.customer_company && o.customer_name && (
                      <div className="text-slate-500" style={{fontSize:12}}>{o.customer_name}</div>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-slate-400" style={{fontSize:11}}>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(o.updated_at).toLocaleDateString('de-AT')}
                      </span>
                      <span>{o.creator_name}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {o.total_monthly > 0 && (
                      <div className="font-semibold text-slate-800" style={{fontSize:13}}>€ {fmt(Number(o.total_monthly))}/Mo</div>
                    )}
                    {o.total_once > 0 && (
                      <div className="text-slate-500" style={{fontSize:12}}>€ {fmt(Number(o.total_once))} einm.</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-100">
                  <button onClick={() => onLoad(o.id)} className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 px-2.5 py-1 hover:bg-red-100 transition-colors" style={{fontSize:11}}>
                    <FileText size={12} /> Laden
                  </button>
                  <button onClick={() => onLoad(o.id, true)} className="flex items-center gap-1 rounded-lg bg-slate-50 text-slate-600 px-2.5 py-1 hover:bg-slate-100 transition-colors" style={{fontSize:11}}>
                    <Copy size={12} /> Duplizieren
                  </button>
                  <button onClick={() => showDetail(o.id)} className="flex items-center gap-1 rounded-lg bg-slate-50 text-slate-600 px-2.5 py-1 hover:bg-slate-100 transition-colors" style={{fontSize:11}}>
                    <Clock size={12} /> Details
                  </button>
                  <button onClick={() => handleDelete(o.id)} className="flex items-center gap-1 rounded-lg bg-slate-50 text-red-400 px-2.5 py-1 hover:bg-red-50 transition-colors ml-auto" style={{fontSize:11}}>
                    <Trash2 size={12} />
                  </button>
                </div>
                {/* Stage action buttons */}
                <div className="flex gap-1.5 mt-2">
                  {o.stage === 'new' && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'offer_sent')} className="flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2.5 py-1 hover:bg-blue-100 transition-colors disabled:opacity-50" style={{fontSize:11}}>
                      <Send size={12} /> Gesendet
                    </button>
                  )}
                  {o.stage !== 'closed' && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'closed')} className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1 hover:bg-emerald-100 transition-colors disabled:opacity-50" style={{fontSize:11}}>
                      <CheckCircle2 size={12} /> Abschließen
                    </button>
                  )}
                  {(o.stage === 'new' || o.stage === 'offer_sent') && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'lost')} className="flex items-center gap-1 rounded-lg bg-red-50 text-red-600 px-2.5 py-1 hover:bg-red-100 transition-colors disabled:opacity-50" style={{fontSize:11}}>
                      <XCircle size={12} /> Verloren
                    </button>
                  )}
                  {(o.stage === 'closed' || o.stage === 'lost') && (
                    <button disabled={stageLoading === o.id} onClick={() => handleStageChange(o.id, 'new')} className="flex items-center gap-1 rounded-lg bg-slate-100 text-slate-600 px-2.5 py-1 hover:bg-slate-200 transition-colors disabled:opacity-50" style={{fontSize:11}}>
                      <RefreshCw size={12} /> Reaktivieren
                    </button>
                  )}
                </div>
              </div>

              {/* Event timeline */}
              {detailId === o.id && (
                <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="font-semibold text-slate-600 mb-1" style={{fontSize:11}}>E-Mail Verlauf</div>
                  {eventsLoading ? (
                    <div className="text-slate-400 text-center py-2"><Loader2 size={14} className="animate-spin mx-auto" /></div>
                  ) : events.length === 0 ? (
                    <div className="space-y-1">
                      {o.sent_at && (
                        <div className="flex items-center gap-2" style={{fontSize:11}}>
                          <Send size={12} className="text-blue-500" />
                          <span className="text-slate-600 font-medium">Gesendet</span>
                          <span className="text-slate-400">{new Date(o.sent_at).toLocaleString('de-AT')}</span>
                        </div>
                      )}
                      {o.opened_at && (
                        <div className="flex items-center gap-2" style={{fontSize:11}}>
                          <MailOpen size={12} className="text-yellow-500" />
                          <span className="text-slate-600 font-medium">Gelesen</span>
                          <span className="text-slate-400">{new Date(o.opened_at).toLocaleString('de-AT')}</span>
                        </div>
                      )}
                      {!o.sent_at && !o.opened_at && (
                        <div className="text-slate-400" style={{fontSize:11}}>Noch keine E-Mail-Events</div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {events.map((evt, i) => (
                        <div key={evt.id || i} className="flex items-center gap-2" style={{fontSize:11}}>
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
          <OfferList onLoad={handleLoadOffer} onNew={handleNewOffer} />
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
