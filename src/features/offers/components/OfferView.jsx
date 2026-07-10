import { useState } from 'react';
import {
  ChevronDown,
  Check,
  Copy,
  Download,
  Link,
  Loader2,
  Pen,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  ShoppingCart,
  User,
  X,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';

import { supabase } from '../../../lib/supabase';
import CustomerPicker from '../../../components/CustomerPicker';
import Select from '../../../components/Select';
import DatePicker from '../../../components/DatePicker';
import SortableOfferRow from './SortableOfferRow';
import EditItemModal from './modals/EditItemModal';
import LeasingConditionsModal from './modals/LeasingConditionsModal';
import { TIER_LABEL } from '../../../data/tiers';
import { ALL, TEAM, isCustomItem } from '../data/catalogs';
import { computeAutoTerms } from '../../../data/autoTermRules';
import {
  isMonthly,
  price,
  discountedPrice,
  yearlyServicePerUnit,
} from '../../../lib/pricing';
import { orderedCartEntries } from '../../../lib/cartOrder';
import { decorateLineItems } from '../../../lib/offerLineItems';
import { listGroups, countedIds } from '../../../lib/optionGroups';
import { fmt } from '../../../lib/format';
import { computeDiscounts, SKONTO_DAYS } from '../../../lib/discounts';

export default function OfferView({
  cart,
  copierOffer,
  customer,
  setCustomer,
  creator,
  setCreator,
  notes,
  setNotes,
  briefing,
  setBriefing,
  totals,
  onPrint,
  onCopy,
  copied,
  onCopyLink,
  linkCopied,
  raten,
  setRaten,
  pdfLoading,
  finanzOpen,
  setFinanzOpen,
  globalTier,
  rabattActive,
  setRabattActive,
  skontoActive,
  setSkontoActive,
  serviceStartDate,
  setServiceStartDate,
  billingEnabled = false,
  paymentEnabled = false,
  setPaymentEnabled = () => {},
  onSave,
  onSend,
  saving,
  sending,
  saveSuccess,
  currentOfferId,
  onSign,
  onAddCustom,
  cartOrder,
  onReorder,
  onRemoveItem,
  onEditItem,
  onCopierField,
}) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // { id, item, cartItem, monthly }
  const [editingLeasingId, setEditingLeasingId] = useState(null);
  // A Sharp/MFP offer renders its own copier summary instead of the PoS
  // monthly/once/Wartung/financing sections.
  const isCopier = !!copierOffer?.isCopierOffer;
  // Leasing conditions are whole-offer; edited against the primary device entry.
  const primaryCopierId = isCopier ? (Object.keys(cart).find((id) => ALL[id]?.t === 'copier') || null) : null;
  const allOrdered = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
  const monthlyItems = allOrdered.filter(([id, c]) => isMonthly(ALL[id], c.mode));
  const onceItems = allOrdered.filter(([id, c]) => !isMonthly(ALL[id], c.mode));
  const counted = countedIds(cart);
  // Only the counted (recommended) member of an option group accrues Wartung.
  const wartungItems = allOrdered.filter(([id]) => ALL[id]?.servicePercent > 0 && counted.has(id));
  const autoTerms = computeAutoTerms(cart);
  const availableGroups = listGroups(cart);
  // Per-row option-group decoration (selected flag + Mehr-/Minderpreis delta).
  const decoratedById = {};
  decorateLineItems(allOrdered, ALL).forEach((r) => { decoratedById[r.id] = r; });

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
    const otherSection = allOrdered
      .filter(([id]) => !sectionItems.some(([sid]) => sid === id))
      .map(([id]) => id);
    const isThisMonthly =
      sectionItems.length > 0 && isMonthly(ALL[sectionItems[0][0]], cart[sectionItems[0][0]]?.mode);
    const newOrder = isThisMonthly
      ? [...reorderedSection, ...otherSection]
      : [...otherSection, ...reorderedSection];
    onReorder(newOrder);
  }

  const periodNetto = totals.periodTotal;
  // Rabatt (2%) is a real reduction of the first-year deal and flows into the
  // financing figures; Skonto (3%) is a pay-in-full incentive shown as a note
  // and never affects financing. See src/lib/discounts.ts.
  const discount = computeDiscounts(periodNetto, { rabattActive, skontoActive });
  const periodBrutto = discount.brutto;

  // Option-group chips shown next to a line item.
  function groupTag(d) {
    if (!d?.optionGroup) return null;
    const isCounted = d.optionSelected !== false;
    return (
      <>
        <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-1.5 ml-2 whitespace-nowrap">Wahl: {d.optionGroup}</span>
        {isCounted ? (
          <span className="text-xs text-emerald-700 bg-emerald-50 rounded-full px-1.5 ml-1 whitespace-nowrap">empfohlen</span>
        ) : (
          <span className="text-xs text-amber-700 bg-amber-50 rounded-full px-1.5 ml-1 whitespace-nowrap">Alternative</span>
        )}
      </>
    );
  }

  // Price cell: counted lines show their amount; alternatives show only the
  // price difference vs the recommended option (and are muted, not summed).
  function priceCell(d, lineTotal, monthly) {
    const isAlt = d?.optionGroup && d.optionSelected === false;
    if (isAlt) {
      const delta = d.optionDelta || 0;
      const label = delta === 0
        ? 'gleicher Preis'
        : `${delta > 0 ? '+' : '−'}€ ${fmt(Math.abs(delta))}${monthly ? '/Mo' : ''}`;
      return <span className="text-sm italic text-slate-400 whitespace-nowrap">{label}</span>;
    }
    return <span className="font-semibold text-slate-800 text-sm whitespace-nowrap">€ {fmt(lineTotal)}{monthly ? '/Mo' : ''}</span>;
  }

  return (
    <div>
      {/* Customer info */}
      <div className="bg-white rounded-xl border-2 border-slate-200 mb-4" style={{ padding: '16px' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <User size={16} className="text-red-600" />
            <span className="font-bold text-slate-700" style={{ fontSize: 14 }}>Kundendaten</span>
            {customer.mesonicId && (
              <span className="bg-emerald-50 text-emerald-600 rounded-full px-2" style={{ fontSize: 10 }}>Mesonic #{customer.mesonicId}</span>
            )}
          </div>
          <button
            onClick={() => setShowCustomerPicker(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-600 px-3 py-1.5 hover:bg-red-50 hover:text-red-600 transition-colors"
            style={{ fontSize: 12 }}
          >
            <Search size={13} /> Bestandskunde
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Firma" value={customer.company} onChange={e => setCustomer({ ...customer, company: e.target.value })}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="Ansprechpartner" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="E-Mail" type="email" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="Telefon" type="tel" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
        </div>
        <input placeholder="Adresse (Straße, PLZ Ort)" value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })}
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
          <Select
            value={creator}
            onChange={setCreator}
            placeholder="Angebot erstellt von…"
            ariaLabel="Ersteller"
            options={TEAM.map((t) => ({
              value: t.id,
              label: t.name,
              hint: `${t.role} · ${t.location}`,
            }))}
          />
        </div>
        {billingEnabled && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-500 mb-1">Leistungsbeginn</label>
            <DatePicker
              value={serviceStartDate || ''}
              onChange={setServiceStartDate}
              ariaLabel="Leistungsbeginn"
            />
            <div className="mt-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">Zahlung für dieses Angebot</div>
                <div className="text-slate-400" style={{ fontSize: 11 }}>
                  {paymentEnabled ? 'Kunde wählt Zahlungsart (Stripe)' : 'Kunde nimmt per Unterschrift an'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentEnabled?.(!paymentEnabled)}
                className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 ${paymentEnabled ? 'bg-red-500' : 'bg-slate-300'}`}
                style={{ width: 32, height: 18 }}
                title={paymentEnabled ? 'Stripe-Zahlung aktiv' : 'Annahme per Unterschrift'}
                aria-label="Zahlung über Stripe aktivieren"
              >
                <span
                  className="inline-block bg-white rounded-full shadow"
                  style={{ width: 14, height: 14, transform: paymentEnabled ? 'translateX(15px)' : 'translateX(2px)', transition: 'transform 120ms ease' }}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Briefing — internal context for the rep, never on the PDF.
          Lives ABOVE Anmerkungen so reps see "what did the customer
          actually want" first when reopening an offer weeks later. */}
      <div className="bg-amber-50 rounded-xl border-2 border-amber-200 mb-4" style={{ padding: '16px' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-bold text-amber-900" style={{ fontSize: 13 }}>Briefing</span>
          <span className="text-amber-700 bg-amber-200/60 rounded-full px-2 py-0.5 font-medium" style={{ fontSize: 10 }}>intern</span>
          <span className="text-amber-700 ml-auto" style={{ fontSize: 11 }}>nicht im PDF · nicht an Kunden</span>
        </div>
        <textarea
          value={briefing || ''}
          onChange={(e) => setBriefing && setBriefing(e.target.value)}
          rows={3}
          placeholder="Was hat der Kunde angefragt? Worauf legt er Wert? Wer hat angefragt, in welchem Kontext?"
          className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
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
          <p style={{ fontSize: 13 }}>Wechsle zu Bessa, Melzer, RCH oder Hardware um Produkte hinzuzufügen.</p>
        </div>
      )}

      {/* Sharp/MFP copier summary (replaces the PoS cost sections) */}
      {isCopier && (
        <CopierSummary
          copierOffer={copierOffer}
          onEditLine={(id) => {
            const item = ALL[id];
            if (item) setEditingItem({ id, item, cartItem: cart[id] || {}, monthly: false });
          }}
          onEditLeasing={primaryCopierId && onCopierField ? () => setEditingLeasingId(primaryCopierId) : null}
        />
      )}

      {/* Monthly items */}
      {!isCopier && monthlyItems.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden">
          <div className="bg-red-50 px-4 py-2 border-b border-red-100">
            <span className="font-bold text-red-800" style={{ fontSize: 13 }}>MONATLICHE KOSTEN</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, monthlyItems)}>
            <SortableContext items={monthlyItems.map(([id]) => id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-slate-100">
                {monthlyItems.map(([id, c]) => {
                  const item = ALL[id];
                  const p = price(item, c.tier, c.mode, c.priceOverride);
                  const dp = discountedPrice(item, c.tier, c.mode, c.priceOverride);
                  const fullQty = c.qty || 0;
                  const discQty = c.discountQty || 0;
                  const lineTotal = (p * fullQty) + (dp * discQty);
                  const totalQty = fullQty + discQty;
                  const qtyLabel = discQty > 0 && fullQty > 0 ? `${fullQty}+${discQty}` : String(totalQty);
                  const d = decoratedById[id];
                  return (
                    <SortableOfferRow key={id} id={id}>
                      <div className="flex items-center justify-between pr-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700">{qtyLabel}x {item.code ? item.code + ' ' : ''}{item.name}</span>
                          {c.tier && <span className="text-xs text-slate-400 ml-2">{TIER_LABEL[c.tier]}</span>}
                          {c.mode === 'rent' && item.t === 'term' && <span className="text-xs text-slate-400 ml-2">Miete</span>}
                          {discQty > 0 && <span className="text-xs text-green-600 ml-2">({item.discount?.label})</span>}
                          {groupTag(d)}
                        </div>
                        {priceCell(d, lineTotal, true)}
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
            <div className="flex justify-between text-sm"><span className="text-slate-500">20% USt</span><span className="font-medium">€ {fmt(totals.monthly * 0.2)}</span></div>
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-slate-300"><span>Brutto/Monat</span><span className="text-red-700">€ {fmt(totals.monthly * 1.2)}</span></div>
          </div>
        </div>
      )}

      {/* One-time items */}
      {!isCopier && onceItems.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden">
          <div className="bg-amber-50 px-4 py-2 border-b border-amber-100">
            <span className="font-bold text-amber-800" style={{ fontSize: 13 }}>EINMALIGE KOSTEN</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, onceItems)}>
            <SortableContext items={onceItems.map(([id]) => id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-slate-100">
                {onceItems.map(([id, c]) => {
                  const item = ALL[id];
                  const p = price(item, c.tier, c.mode, c.priceOverride);
                  const dp = discountedPrice(item, c.tier, c.mode, c.priceOverride);
                  const fullQty = c.qty || 0;
                  const discQty = c.discountQty || 0;
                  const lineTotal = (p * fullQty) + (dp * discQty);
                  const totalQty = fullQty + discQty;
                  const qtyLabel = discQty > 0 && fullQty > 0 ? `${fullQty}+${discQty}` : String(totalQty);
                  const d = decoratedById[id];
                  return (
                    <SortableOfferRow key={id} id={id}>
                      <div className="flex items-center justify-between pr-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700">{qtyLabel}x {item.code ? item.code + ' ' : ''}{item.name}</span>
                          {c.mode === 'buy' && <span className="text-xs text-slate-400 ml-2">Kauf</span>}
                          {item.t === 'h' && <span className="text-xs text-slate-400 ml-2">({fullQty} Std.)</span>}
                          {discQty > 0 && <span className="text-xs text-green-600 ml-2">({item.discount?.label})</span>}
                          {groupTag(d)}
                        </div>
                        {priceCell(d, lineTotal, false)}
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
            <div className="flex justify-between text-sm"><span className="text-slate-500">20% USt</span><span className="font-medium">€ {fmt(totals.once * 0.2)}</span></div>
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-slate-300"><span>Brutto</span><span className="text-red-700">€ {fmt(totals.once * 1.2)}</span></div>
          </div>
        </div>
      )}

      {/* Wartung pro Jahr (Melzer) */}
      {!isCopier && wartungItems.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-amber-200 mb-4 overflow-hidden">
          <div className="bg-amber-100 px-4 py-2 border-b border-amber-200">
            <span className="font-bold text-amber-900" style={{ fontSize: 13 }}>WARTUNG PRO JAHR</span>
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
                    <span className="text-sm font-medium text-slate-700">{totalQty}x {item.code ? item.code + ' ' : ''}{item.name}</span>
                    <span className="text-xs text-slate-400 ml-2">{item.servicePercent}% Wartung</span>
                  </div>
                  <span className="font-semibold text-amber-800 text-sm whitespace-nowrap">€ {fmt(line)}/Jahr</span>
                </div>
              );
            })}
          </div>
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Netto/Jahr</span><span className="font-medium">€ {fmt(totals.yearly)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">20% USt</span><span className="font-medium">€ {fmt(totals.yearly * 0.2)}</span></div>
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-slate-300"><span>Brutto/Jahr</span><span className="text-amber-700">€ {fmt(totals.yearly * 1.2)}</span></div>
          </div>
        </div>
      )}

      {/* Yearly summary */}
      {!isCopier && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0) && (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl mb-4 text-white overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
            <span className="font-bold" style={{ fontSize: 13 }}>GESAMTÜBERSICHT</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRabattActive(!rabattActive)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${rabattActive ? 'bg-red-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
                style={{ fontSize: 11 }}
              >
                2% Rabatt
              </button>
              <button
                type="button"
                onClick={() => setSkontoActive(!skontoActive)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${skontoActive ? 'bg-red-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
                style={{ fontSize: 11 }}
              >
                3% Skonto
              </button>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <div className="text-sm text-slate-300">Kosten im ersten Jahr</div>
                <div className="text-xs text-slate-400">(monatlich × Laufzeit + einmalig{totals.yearly > 0 ? ' + Wartung' : ''})</div>
              </div>
              <div className="text-right">
                {rabattActive ? (
                  <>
                    <div className="text-xs text-slate-500 line-through">€ {fmt(discount.baseNetto * 1.2)} brutto</div>
                    <div className="text-sm text-slate-400">€ {fmt(discount.netto)} netto</div>
                    <div className="font-bold text-lg text-red-400">€ {fmt(discount.brutto)} brutto</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-slate-400">€ {fmt(totals.periodTotal)} netto</div>
                    <div className="font-bold text-lg text-red-400">€ {fmt(totals.periodTotal * 1.2)} brutto</div>
                  </>
                )}
              </div>
            </div>
            {rabattActive && (
              <div className="flex justify-between items-center text-xs text-slate-300 -mt-1">
                <span>inkl. 2% Rabatt</span>
                <span className="text-emerald-400">− € {fmt(discount.rabattAmount)} netto</span>
              </div>
            )}
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
            {skontoActive && (
              <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 mt-3">
                <div>
                  <div className="text-sm text-emerald-300 font-medium">Bei Zahlung innerhalb {SKONTO_DAYS} Tagen</div>
                  <div className="text-xs text-slate-400">3% Skonto (− € {fmt(discount.skontoAmount)})</div>
                </div>
                <div className="font-bold text-emerald-300">€ {fmt(discount.skontoBrutto)} brutto</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Financing options (PoS only — copier offers carry their own Grenke leasing) */}
      {!isCopier && (totals.monthly > 0 || totals.once > 0 || totals.yearly > 0) && (
        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden">
          <button onClick={() => setFinanzOpen(!finanzOpen)} className="w-full bg-red-50 px-4 py-3 border-b border-red-100 flex items-center justify-between hover:bg-red-100 transition-colors">
            <span className="font-bold text-red-800" style={{ fontSize: 13 }}>FINANZIERUNGSOPTIONEN</span>
            <ChevronDown size={18} className={`text-red-600 transition-transform ${finanzOpen ? 'rotate-180' : ''}`} />
          </button>

          {finanzOpen && <>
            {/* Option 1: Ratenzahlung */}
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold" style={{ fontSize: 12 }}>1</span>
                <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>Ratenzahlung (+8%)</span>
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
                    <Select
                      value={String(raten)}
                      onChange={(v) => setRaten(Number(v))}
                      size="sm"
                      className="w-28"
                      options={[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
                        value: String(n),
                        label: `${n} Raten`,
                      }))}
                    />
                  </div>
                  <span className="font-semibold">€ {fmt(periodBrutto * 1.08 * 0.7 / raten)}/Rate</span>
                </div>
              </div>
            </div>

            {/* Option 2: Miete */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold" style={{ fontSize: 12 }}>2</span>
                <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>Miete (+8%)</span>
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
        <div className="bg-amber-50 rounded-xl border-2 border-amber-200 mb-4" style={{ padding: '14px 16px' }}>
          <span className="font-bold text-amber-900 block mb-2" style={{ fontSize: 13 }}>Bedingungen</span>
          <ul className="list-disc pl-5 text-amber-900 space-y-1" style={{ fontSize: 12 }}>
            {autoTerms.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-xl border-2 border-slate-200 mb-4" style={{ padding: '16px' }}>
        <span className="font-bold text-slate-700 block mb-2" style={{ fontSize: 13 }}>Anmerkungen</span>
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
                style={{ fontSize: 14 }}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : saveSuccess ? <Check size={18} /> : <Save size={18} />}
                {saving ? 'Speichern...' : saveSuccess ? 'Gespeichert!' : currentOfferId ? 'Aktualisieren' : 'Speichern'}
              </button>
              <button onClick={onSend} disabled={sending || !customer.email}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold py-3.5 active:scale-[0.98] transition-all ${!customer.email ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'} ${sending ? 'opacity-70 cursor-wait' : ''}`}
                style={{ fontSize: 14 }}>
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {sending ? 'Senden...' : 'Angebot senden'}
              </button>
            </div>
          )}
          {/* Row 2: Sign */}
          {supabase && currentOfferId && (
            <button onClick={onSign}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold py-3.5 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200"
              style={{ fontSize: 14 }}>
              <Pen size={18} /> Unterschreiben
            </button>
          )}
          {/* Row 3: Copy + PDF */}
          <div className="flex gap-2">
            <button onClick={onCopyLink}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 active:scale-[0.98] transition-all"
              style={{ fontSize: 14, minWidth: '100px' }}>
              {linkCopied ? <Check size={18} /> : <Link size={18} />}
              {linkCopied ? 'Link kopiert!' : 'Link'}
            </button>
            <button onClick={onCopy}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 active:scale-[0.98] transition-all"
              style={{ fontSize: 14, minWidth: '100px' }}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Kopiert!' : 'Text'}
            </button>
            <button onClick={onPrint} disabled={pdfLoading}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white font-semibold py-3.5 hover:bg-red-700 active:scale-[0.98] transition-all shadow-lg shadow-red-200 ${pdfLoading ? 'opacity-70 cursor-wait' : ''}`}
              style={{ fontSize: 14, minWidth: '120px' }}>
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
          availableGroups={availableGroups}
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

      {editingLeasingId && ALL[editingLeasingId] && (
        <LeasingConditionsModal
          item={ALL[editingLeasingId]}
          cartItem={cart[editingLeasingId] || {}}
          onClose={() => setEditingLeasingId(null)}
          onSave={(patch) => {
            onCopierField(editingLeasingId, patch);
            setEditingLeasingId(null);
          }}
        />
      )}
    </div>
  );
}

const fmtRate = (n) => n.toLocaleString('de-AT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

// Read-only Sharp/MFP summary shown in the Angebot tab: device + UHG + install
// + trade-in lines with the Angebotssumme, the Grenke leasing terms, and the
// All-in maintenance rates. All inputs (Kauf/Leasing, trade-in, override) live
// on the device card; this just mirrors what the PDF will print.
function CopierSummary({ copierOffer, onEditLine, onEditLeasing }) {
  const { lines, net, vat, gross, leasing, maintenance, saleMode } = copierOffer;
  return (
    <>
      <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 overflow-hidden">
        <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 flex items-center justify-between">
          <span className="font-bold text-amber-800" style={{ fontSize: 13 }}>SHARP MFP – DIGITALKOPIERGERÄT</span>
          <span className="text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 font-medium" style={{ fontSize: 10 }}>
            {saleMode === 'leasing' ? 'Leasing' : 'Kauf'}
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 gap-2">
              <span className={`text-sm ${line.kind === 'included' ? 'text-slate-400 pl-3' : line.kind === 'tradein' ? 'text-emerald-700' : 'text-slate-700 font-medium'}`}>
                {line.qty > 1 ? `${line.qty}× ` : ''}{line.code ? line.code + ' ' : ''}{line.name}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-sm whitespace-nowrap ${line.kind === 'tradein' ? 'text-emerald-700 font-semibold' : line.kind === 'included' ? 'text-slate-400' : 'font-semibold text-slate-800'}`}>
                  {line.kind === 'included' ? 'inkl.' : `€ ${fmt(line.lineTotal)}`}
                </span>
                {line.id && onEditLine && (
                  <button onClick={() => onEditLine(line.id)} className="text-slate-400 hover:text-red-500 transition-colors" title="Preis/Menge bearbeiten" aria-label="Bearbeiten">
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Nettosumme</span><span className="font-medium">€ {fmt(net)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">20% USt</span><span className="font-medium">€ {fmt(vat)}</span></div>
          <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-slate-300"><span>Angebotssumme</span><span className="text-red-700">€ {fmt(gross)}</span></div>
        </div>
      </div>

      {/* Grenke leasing terms */}
      <div className={`bg-white rounded-xl border-2 mb-4 overflow-hidden ${saleMode === 'leasing' ? 'border-red-300' : 'border-slate-200'}`}>
        <div className="bg-red-50 px-4 py-2 border-b border-red-100 flex items-center justify-between gap-2">
          <span className="font-bold text-red-800" style={{ fontSize: 13 }}>LEASING – GRENKE ({leasing.termMonths} MONATE)</span>
          <div className="flex items-center gap-2">
            <span className="text-red-700" style={{ fontSize: 10 }}>{saleMode === 'leasing' ? 'gewünscht' : 'Alternative'}</span>
            {onEditLeasing && (
              <button onClick={onEditLeasing} className="rounded-md bg-white/70 text-red-700 border border-red-200 px-2 py-0.5 hover:bg-white transition-colors" style={{ fontSize: 10 }}>
                Konditionen
              </button>
            )}
          </div>
        </div>
        <div className="p-4 space-y-1.5">
          <div className="flex justify-between text-sm"><span className="text-slate-600">Monatliche Leasingrate</span><span className="font-bold text-red-700">€ {fmt(leasing.rate)}/Mo {leasing.rateOverridden ? '(manuell)' : ''}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Restwert (5%)</span><span>€ {fmt(leasing.restwert)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Bearbeitungsgebühr (einmalig)</span><span>€ {fmt(leasing.bearbeitungsgebuehr)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Vertragsgebühr (1%)</span><span>€ {fmt(leasing.vertragsgebuehr)}</span></div>
          {leasing.mietsonderzahlung > 0 && (
            <div className="flex justify-between text-sm"><span className="text-slate-500">Mietsonderzahlung</span><span>€ {fmt(leasing.mietsonderzahlung)}</span></div>
          )}
          <p className="text-slate-400 pt-1" style={{ fontSize: 11 }}>Möglich nach erfolgreicher Bonitätsprüfung.</p>
        </div>
      </div>

      {/* All-in maintenance rates */}
      <div className="bg-amber-50 rounded-xl border-2 border-amber-200 mb-4" style={{ padding: '14px 16px' }}>
        <span className="font-bold text-amber-900 block mb-1" style={{ fontSize: 13 }}>All-in Kopienpreiswartung</span>
        <p className="text-amber-900" style={{ fontSize: 12 }}>Inkl. Service, Ersatzteile, Verbrauchsmaterial (Toner, Trommel, Developer), Arbeits- &amp; Wegzeit. Ausgenommen: Papier, Folien, Heftklammern.</p>
        <div className="mt-2 space-y-0.5">
          {maintenance.map((m, i) => (
            <p key={i} className="text-amber-900" style={{ fontSize: 12 }}>
              {maintenance.length > 1 ? `${m.deviceName}: ` : ''}s/w € {fmtRate(m.pageBw)} · Farbe € {fmtRate(m.pageColor)} · Scan € {fmtRate(m.pageScan)} (zzgl. 20% MwSt)
            </p>
          ))}
        </div>
        <p className="text-amber-700 mt-1" style={{ fontSize: 11 }}>Abrechnung des tatsächlichen Zählerstandes pro Quartal im Nachhinein.</p>
      </div>
    </>
  );
}
