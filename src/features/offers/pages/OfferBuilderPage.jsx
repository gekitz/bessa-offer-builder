import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  Info,
  Loader2,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
// PDF generation is dynamically imported inside generateOfferPdfBlob
// to keep @react-pdf/renderer (~600 KB) out of the main bundle.
import { generateOfferPdfBlob } from '../../../pdf/generateOfferPdf';
import { lazyWithReload } from '../../../lib/lazyWithReload';
import { getOfferFromURL } from '../../../lib/urlState';
import {
  saveOffer,
  getOffer,
  sendOffer,
  setShareCode,
  getOfferByShareCode,
  updateOfferStage,
  signOffer,
  listActivities,
  getEmailEvents,
} from '../../../lib/offerApi';
import { supabase } from '../../../lib/supabase';
import { generateAcceptQr } from '../../../lib/qr';
import { useAuth } from '../../../lib/auth';
import { TIERS, TIER_LABEL_OFFER, TIER_SHORT } from '../../../data/tiers';
import { computeAutoTerms } from '../../../data/autoTermRules';
import {
  isMonthly,
  price,
  yearlyServicePerUnit,
} from '../../../lib/pricing';
import { computeTotals } from '../../../lib/totals';
import { buildCopierOffer, copierPersistTotals } from '../../../lib/copierOffer';
import { computeDiscounts, SKONTO_DAYS } from '../../../lib/discounts';
import { buildLineItems } from '../../../lib/offerLineItems';
import { applyOptionGroup, countedIds } from '../../../lib/optionGroups';
import {
  COMPANY_DEFAULT,
  BESSA,
  MELZER,
  GASTROTOUCH,
  UNIFY,
  RCH,
  HARDWARE,
  DRUCKER,
  KUECHENMONITORE,
  KUECHENMONITORE_SUNMI,
  KIOSK,
  DIENSTLEISTUNGEN,
  ORDERMAN,
  SHARP,
  SHARP_ZUBEHOR,
  BROTHER,
  TEAM,
  ALL,
  isCustomItem,
} from '../data/catalogs';
import OfferView from '../components/OfferView';
import CopierItemCard from '../components/CopierItemCard';
import NewOfferTypeModal from '../components/modals/NewOfferTypeModal';
import LeihstellungCalculator from '../components/LeihstellungCalculator';
import { emptyRentalState, rentalLineFields, RENTAL_LINE_ID } from '../../../lib/rentalOffer';
import ItemCard from '../components/ItemCard';
import CatGroup from '../components/CatGroup';
import TabContent from '../components/TabContent';
import SignModal from '../components/modals/SignModal';
import CustomItemModal from '../components/modals/CustomItemModal';
import EmailPreviewModal from '../components/modals/EmailPreviewModal';
import OfferDetailsModal from '../components/modals/OfferDetailsModal';
import OfferListPage from './OfferListPage';
import FollowUpsPage from './FollowUpsPage';
import { orderedCartEntries } from '../../../lib/cartOrder';
import { fmt } from '../../../lib/format';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import AppShell from '../../../components/AppShell';
// CalendarPage and TicketsPage are heavy (calendar grids, ticket
// tables) and only rendered when the user is on their respective
// section. Lazy import keeps them out of the main bundle.
const CalendarPage = lazyWithReload(() => import('../../calendar/pages/CalendarPage'));
const TicketsPage = lazyWithReload(() => import('../../tickets/pages/TicketsPage'));
const DispatcherPage = lazyWithReload(() => import('../../dispatcher/pages/DispatcherPage'));
import { useApproverPendingCount } from '../../vacation/hooks/useApproverPendingCount';
import { useMyTicketCount } from '../../tickets/hooks/useMyTicketCount';
import { useLocation, useNavigate } from 'react-router-dom';
import { pathForSection, sectionFromPath } from '../../../lib/sectionRoute';

const CrmPage = lazyWithReload(() => import('../../../components/CrmPage.jsx'));

const POS_TABS = [
  { id: 'bessa', label: 'Bessa' },
  { id: 'melzer', label: 'Melzer' },
  { id: 'gastrotouch', label: 'GastroTouch' },
  { id: 'rch', label: 'RCH' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'angebot', label: 'Angebot' },
];

const SHARP_TABS = [
  { id: 'sharp', label: 'Sharp MFP' },
  { id: 'zubehoer', label: 'Zubehör' },
  { id: 'angebot', label: 'Angebot' },
];

const BROTHER_TABS = [
  { id: 'brother', label: 'Brother' },
  { id: 'angebot', label: 'Angebot' },
];

const RENTAL_TABS = [
  { id: 'leihstellung', label: 'Leihstellung' },
  { id: 'angebot', label: 'Angebot' },
];

// The product tabs depend on the offer type. PoS keeps the existing tabs;
// Sharp shows the copier devices + accessories; Brother shows its printers;
// Rental (Leihstellung) shows the rental calculator.
function builderTabsFor(offerType) {
  if (offerType === 'sharp') return SHARP_TABS;
  if (offerType === 'brother') return BROTHER_TABS;
  if (offerType === 'rental') return RENTAL_TABS;
  return POS_TABS;
}

// First product tab to land on for a given offer type.
const FIRST_TAB = { pos: 'bessa', sharp: 'sharp', brother: 'brother', rental: 'leihstellung' };

// Build wartung rows for PDF rendering from filtered cart entries.
// Non-selected option-group alternatives are skipped — only the counted member
// contributes its yearly Wartung, matching computeTotals.
function buildWartungItems(entries) {
  const counted = countedIds(Object.fromEntries(entries));
  return entries
    .filter(([id]) => ALL[id]?.servicePercent > 0 && counted.has(id))
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

export default function OfferBuilderPage() {
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
  // Active section is derived from the URL path (HashRouter, see
  // App.jsx). Sidebar nav writes to history via useNavigate; the
  // browser back/forward buttons + deep links work for free.
  const location = useLocation();
  const navigate = useNavigate();
  const section = sectionFromPath(location.pathname);
  const pendingApprovalsCount = useApproverPendingCount();
  const myTicketCount = useMyTicketCount();
  const [offerView, setOfferView] = useState('list'); // 'list' | 'builder' | 'followups'
  // When set, the FollowUps page picks this up and immediately opens
  // SendFollowupModal for that offer. Driven by the digest deep-link
  // (?action=send-followup&offer=ID); cleared after first render so
  // a user-driven nav back to the page doesn't reopen the modal.
  const [pendingFollowupOfferId, setPendingFollowupOfferId] = useState(null);
  // Info / Details modal (shown via the builder header button). The
  // modal is read-only — to *edit* the offer the rep just stays in
  // the builder; the modal is purely the deep-context view (full
  // briefing, status, contact log, email events, lost reason).
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsOffer, setDetailsOffer] = useState(null);
  const [detailsActivities, setDetailsActivities] = useState([]);
  const [detailsEvents, setDetailsEvents] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [builderTab, setBuilderTab] = useState('bessa');
  // Product family this offer belongs to: 'pos' | 'sharp' | 'brother'.
  // Drives list filtering today; will gate builder tabs + PDF in later
  // phases. Defaults to 'pos' — the only kind that exists pre-Sharp.
  const [offerType, setOfferType] = useState('pos');
  // Leihstellung (rental) input state — only meaningful when offerType ===
  // 'rental'. The calculator edits this; an effect mirrors it into a single
  // custom cart line so the whole Save/Send/Print/PDF pipeline works unchanged.
  const [rental, setRental] = useState(emptyRentalState());
  // Type-picker modal shown when starting a new offer (PoS vs Sharp MFP tiles).
  const [showNewOfferModal, setShowNewOfferModal] = useState(false);
  const [globalTier, setGlobalTier] = useState('12mo');
  const [cart, setCart] = useState({});
  const [customer, setCustomer] = useState({ name: '', company: '', email: '', phone: '', address: '' });
  const [creator, setCreator] = useState('');
  const [notes, setNotes] = useState('');
  // Internal briefing — what the customer actually asked for. Never
  // rendered in the PDF, never sent to the customer. Surfaced to
  // reps in OfferView, the offer list row, and the follow-up modal
  // so the original ask stays anchored to the offer.
  const [briefing, setBriefing] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [raten, setRaten] = useState(12);
  const [search, setSearch] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [finanzOpen, setFinanzOpen] = useState(false);
  // Offer-level incentives: 2% Rabatt on the first-year total + 3% Skonto
  // for payment within 14 days. See src/lib/discounts.ts.
  const [rabattActive, setRabattActive] = useState(false);
  const [skontoActive, setSkontoActive] = useState(false);
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

  // Auto-select creator from the logged-in user. Email matching
  // logic lives in lib/ssoMatch (tested in isolation). Falls back to
  // user.email when the profile row's microsoft_email is missing.
  function ssoCreatorId() {
    const email = profile?.microsoft_email || user?.email;
    return email ? findIdBySsoEmail(email, TEAM) : null;
  }
  useEffect(() => {
    if (!creator) {
      const id = ssoCreatorId();
      if (id) setCreator(id);
    }
  }, [profile, user, creator]);

  // Filter out cart items whose IDs no longer exist in ALL (e.g. old offers with removed products)
  function sanitizeCart(rawCart, rawOrder) {
    const validCart = {};
    Object.entries(rawCart).forEach(([id, c]) => {
      if (ALL[id]) validCart[id] = c;
    });
    const validOrder = (rawOrder || []).filter(id => validCart[id]);
    return { cart: validCart, cartOrder: validOrder };
  }

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

  function handleAddCustomItem({ name, price: p, description }) {
    const id = crypto.randomUUID();
    ALL[id] = { id, name, price: p, t: 'o', ...(description ? { description } : {}) };
    setCart(c => ({ ...c, [id]: { qty: 1, discountQty: 0 } }));
    setCartOrder(prev => [...prev, id]);
    setShowCustomModal(false);
  }

  // Keep the single "Leihstellung POS" cart line in sync with the rental
  // calculator. The line is a custom once-item (its id isn't a catalog id), so
  // it persists via customItems and flows through OfferView/PDF like any other
  // line. Only active for rental offers.
  useEffect(() => {
    if (offerType !== 'rental') return;
    const fields = rentalLineFields(rental);
    if (!fields) {
      delete ALL[RENTAL_LINE_ID];
      setCart(c => { if (!c[RENTAL_LINE_ID]) return c; const { [RENTAL_LINE_ID]: _drop, ...rest } = c; return rest; });
      setCartOrder(prev => prev.filter(id => id !== RENTAL_LINE_ID));
      return;
    }
    ALL[RENTAL_LINE_ID] = { id: RENTAL_LINE_ID, name: fields.name, price: fields.price, t: 'o', description: fields.description };
    setCart(c => (c[RENTAL_LINE_ID] ? c : { ...c, [RENTAL_LINE_ID]: { qty: 1, discountQty: 0 } }));
    setCartOrder(prev => (prev.includes(RENTAL_LINE_ID) ? prev : [...prev, RENTAL_LINE_ID]));
  }, [rental, offerType]);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch (e) {} };
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
        setCreator(offer.creator_id || ssoCreatorId() || '');
        setNotes(data.notes || '');
        setBriefing(offer.briefing || '');
        setRaten(data.raten || 12);
        setFinanzOpen(data.finanzOpen || false);
        setRabattActive(data.rabattActive || false);
        setSkontoActive(data.skontoActive || false);
        setGlobalTier(data.globalTier || '12mo');
        setOfferType(offer.offer_type || data.offerType || 'pos');
        setRental(data.rental || emptyRentalState());
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
      setCustomer(savedOffer.customer || { name: '', company: '', email: '', phone: '', address: '' });
      setCreator(savedOffer.creator || ssoCreatorId() || '');
      setNotes(savedOffer.notes || '');
      setRaten(savedOffer.raten || 12);
      setFinanzOpen(savedOffer.finanzOpen || false);
      setRabattActive(savedOffer.rabattActive || false);
      setSkontoActive(savedOffer.skontoActive || false);
      setGlobalTier(savedOffer.globalTier || '12mo');
      setOfferType(savedOffer.offerType || 'pos');
      setRental(savedOffer.rental || emptyRentalState());
      if (savedOffer.mandatsRef) setMandatsRef(savedOffer.mandatsRef);
      setOfferView('builder'); setBuilderTab('angebot');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Phase 2 digest deep-link: ?action=send-followup&offer=<id>
  // The morning digest email links each row here so the rep can go
  // from "see the row" to "compose the follow-up" in one tap. We
  // route to the follow-ups view and stash the target id; the page
  // picks it up on next render and pre-opens SendFollowupModal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'send-followup') return;
    const offerId = params.get('offer');
    if (!offerId) return;

    setOfferView('followups');
    setPendingFollowupOfferId(offerId);
    // Strip the params so reload / pull-to-refresh doesn't re-trigger.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Cart handlers
  // Items that auto-add 10h Arbeitszeit when selected
  const WORK_INTENSIVE_ITEMS = ['f7a4cb27-d3cf-4e84-ba58-a273da596c06', 'ad5d1834-f864-43a1-8be4-2bae0bfeade4']; // Lagerverwaltung, Anbindung Schankanlage
  const ARBEITSZEIT_ID = 'b01429e1-672e-44ae-ae79-1d08c4f7f918';

  const handlers = {
    onAdd: (id, tier, mode) => {
      setCart(c => {
        const newCart = { ...c, [id]: { qty: 1, discountQty: 0, tier, mode } };
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
      setCart(c => { const n = { ...c }; delete n[id]; return n; });
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
          const n = { ...c }; delete n[id]; return n;
        }
        return { ...c, [id]: { ...cur, qty: nq } };
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
          const n = { ...c }; delete n[id]; return n;
        }
        return { ...c, [id]: { ...cur, discountQty: nq } };
      });
    },
    onTier: (id, tier) => setCart(c => c[id] ? { ...c, [id]: { ...c[id], tier } } : c),
    onMode: (id, mode) => setCart(c => c[id] ? { ...c, [id]: { ...c[id], mode } } : c),
    // Copier/MFP devices: add with a default Kauf sale mode, and patch
    // copier-specific fields (saleMode, tradeIn, leasingRateOverride,
    // mietsonderzahlung) in place.
    onAddCopier: (id) => {
      setCart(c => ({ ...c, [id]: { qty: 1, discountQty: 0, saleMode: 'kauf' } }));
      setCartOrder(prev => [...prev.filter(x => x !== id), id]);
    },
    onCopierField: (id, patch) => setCart(c => c[id] ? { ...c, [id]: { ...c[id], ...patch } } : c),
  };

  function handleEditItem(id, { qty, discountQty, price: newPrice, description, optionGroup, optionSelected }) {
    setCart(c => {
      if (!c[id]) return c;
      const next = { ...c[id], qty, discountQty };
      // Store the price as a per-line override on the cart item (so it
      // persists with the offer), rather than mutating the shared catalog.
      // If the price equals the catalog default, drop the override.
      if (newPrice !== undefined) {
        const item = ALL[id];
        const def = item ? price(item, next.tier, next.mode) : null;
        if (def !== null && Math.abs(newPrice - def) < 0.005) {
          delete next.priceOverride;
        } else {
          next.priceOverride = newPrice;
        }
      }
      return { ...c, [id]: next };
    });
    if (optionGroup !== undefined) {
      setCart(c => applyOptionGroup(c, id, optionGroup, !!optionSelected));
    }
    if (description !== undefined && ALL[id]) {
      if (description) ALL[id].description = description;
      else delete ALL[id].description;
    }
  }

  // Totals
  const totals = useMemo(() => computeTotals(cart, ALL), [cart]);
  // Sharp/MFP copier breakdown (device + Grenke leasing + maintenance). Empty
  // (isCopierOffer=false) for ordinary PoS carts, in which case the PDF falls
  // back to the standard monthly/once tables.
  const copierOffer = useMemo(() => buildCopierOffer(cart, ALL), [cart]);

  // Totals persisted to the offers row (and shown in the list / CRM / accept
  // page / email preview). computeTotals is 0 for copier carts, so for a Sharp
  // offer we surface the engine's figures instead: Kauf → net as a one-time
  // amount; Leasing → the monthly rate (and rate × term as the period value),
  // so the deal shows real pipeline value rather than €0.
  const persistTotals = useMemo(
    () => (copierOffer.isCopierOffer ? { ...totals, ...copierPersistTotals(copierOffer) } : totals),
    [copierOffer, totals],
  );

  // Online self-acceptance (QR + accept-link + Stripe plans on AcceptPage) is a
  // PoS-only flow: it offers Ratenzahlung/Miete with an 8% upcharge, which is
  // wrong for a Sharp deal. A copier lease also can't be self-accepted (needs a
  // Grenke Bonitätsprüfung), so we never surface the accept link for copier offers.
  const acceptEnabled = billingEnabled && !copierOffer.isCopierOffer;

  const builderTabs = builderTabsFor(offerType);

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

    // Sharp/MFP offers print their own copier block instead of the PoS tables.
    if (copierOffer.isCopierOffer) {
      const fmtRate = (n) => n.toLocaleString('de-AT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      lines.push('----------------------------------------');
      lines.push('SHARP MFP – DIGITALKOPIERGERÄT');
      lines.push('----------------------------------------');
      copierOffer.lines.forEach((l) => {
        const amount = l.kind === 'included' ? 'inkl.' : `EUR ${fmt(l.lineTotal)}`;
        lines.push(`  ${l.qty > 1 ? l.qty + 'x ' : ''}${l.code ? l.code + ' ' : ''}${l.name}: ${amount}`);
      });
      lines.push('');
      lines.push(`  Nettosumme:    EUR ${fmt(copierOffer.net)}`);
      lines.push(`  20% USt:       EUR ${fmt(copierOffer.vat)}`);
      lines.push(`  Angebotssumme: EUR ${fmt(copierOffer.gross)}`);
      lines.push('');
      lines.push(`  Leasing 60 Monate (GRENKE): EUR ${fmt(copierOffer.leasing.rate)}/Monat + 20% MwSt`);
      lines.push(`    Restwert EUR ${fmt(copierOffer.leasing.restwert)} | Bearbeitungsgebuehr EUR ${fmt(copierOffer.leasing.bearbeitungsgebuehr)} | Vertragsgebuehr 1%`);
      lines.push('    Moeglich nach erfolgreicher Bonitaetspruefung.');
      lines.push('');
      lines.push('  All-in Kopienpreiswartung (zzgl. 20% MwSt):');
      copierOffer.maintenance.forEach((m) => {
        lines.push(`    s/w EUR ${fmtRate(m.pageBw)} | Farbe EUR ${fmtRate(m.pageColor)} | Scan EUR ${fmtRate(m.pageScan)}`);
      });
      lines.push('    Abrechnung des tatsaechlichen Zaehlerstandes pro Quartal im Nachhinein.');
      lines.push('');
    }

    const allOrdered = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
    const monthlyItems = allOrdered.filter(([id, c]) => isMonthly(ALL[id], c.mode));
    const onceItems = allOrdered.filter(([id, c]) => !isMonthly(ALL[id], c.mode));

    if (!copierOffer.isCopierOffer && monthlyItems.length > 0) {
      lines.push('----------------------------------------');
      lines.push('MONATLICHE KOSTEN');
      lines.push('----------------------------------------');
      monthlyItems.forEach(([id, c], i) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode, c.priceOverride);
        const tierStr = c.tier ? ` (${TIER_LABEL_OFFER[c.tier]})` : '';
        const modeStr = c.mode === 'rent' && item.t === 'term' ? ' [Miete]' : '';
        lines.push(`  ${i + 1}. ${c.qty}x ${item.code ? item.code + ' ' : ''}${item.name}${tierStr}${modeStr}`);
        lines.push(`     = EUR ${fmt(p * c.qty)}/Monat`);
      });
      lines.push('');
      lines.push(`  Netto/Monat:   EUR ${fmt(totals.monthly)}`);
      lines.push(`  20% USt:       EUR ${fmt(totals.monthly * 0.2)}`);
      lines.push(`  Brutto/Monat:  EUR ${fmt(totals.monthly * 1.2)}`);
      lines.push('');
    }

    if (!copierOffer.isCopierOffer && onceItems.length > 0) {
      lines.push('----------------------------------------');
      lines.push('EINMALIGE KOSTEN');
      lines.push('----------------------------------------');
      onceItems.forEach(([id, c], i) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode, c.priceOverride);
        const modeStr = c.mode === 'buy' ? ' [Kauf]' : '';
        const hourStr = item.t === 'h' ? ` (${c.qty} Std.)` : '';
        lines.push(`  ${i + 1}. ${c.qty}x ${item.code ? item.code + ' ' : ''}${item.name}${modeStr}${hourStr}`);
        lines.push(`     = EUR ${fmt(p * c.qty)}`);
      });
      lines.push('');
      lines.push(`  Netto:         EUR ${fmt(totals.once)}`);
      lines.push(`  20% USt:       EUR ${fmt(totals.once * 0.2)}`);
      lines.push(`  Brutto:        EUR ${fmt(totals.once * 1.2)}`);
      lines.push('');
    }

    if (!copierOffer.isCopierOffer && (rabattActive || skontoActive) && totals.periodTotal > 0) {
      const d2 = computeDiscounts(totals.periodTotal, { rabattActive, skontoActive });
      lines.push('----------------------------------------');
      lines.push('GESAMT (erstes Jahr)');
      lines.push('----------------------------------------');
      lines.push(`  Netto:         EUR ${fmt(d2.baseNetto)}`);
      if (rabattActive) {
        lines.push(`  abzgl. 2% Rabatt: -EUR ${fmt(d2.rabattAmount)}`);
        lines.push(`  Netto neu:     EUR ${fmt(d2.netto)}`);
      }
      lines.push(`  Brutto:        EUR ${fmt(d2.brutto)}`);
      if (skontoActive) {
        lines.push('');
        lines.push(`  Bei Zahlung innerhalb von ${SKONTO_DAYS} Tagen: 3% Skonto`);
        lines.push(`  Skonto:        -EUR ${fmt(d2.skontoAmount)}`);
        lines.push(`  Zahlbetrag:    EUR ${fmt(d2.skontoBrutto)} brutto`);
      }
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
      const validEntries = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
      const { monthlyItems, onceItems } = buildLineItems(validEntries, ALL);

      const wartungItems = buildWartungItems(validEntries);
      const autoTerms = computeAutoTerms(cart);

      const creatorInfo = TEAM.find(t => t.id === creator) || null;

      // Ensure the offer is saved and has a share_code so the QR accept URL works
      let effectiveShareCode = shareCode;
      if (acceptEnabled) {
        let effectiveOfferId = currentOfferId;
        if (!effectiveOfferId) {
          const saved = await saveOffer({
            id: null,
            customer,
            creator,
            creatorName: creatorInfo?.name || creator,
            creatorEmail: creatorInfo?.email || null,
            briefing,
            cart, globalTier, notes, raten, finanzOpen, rabattActive, skontoActive,
            totalMonthly: persistTotals.monthly,
            totalOnce: persistTotals.once,
            totalPeriod: persistTotals.periodTotal,
            mandatsRef,
            customItems: getCustomItemsFromCart(),
            cartOrder,
            serviceStartDate,
            offerType,
            rental,
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

      const acceptQrDataUrl = acceptEnabled ? await generateAcceptQr(effectiveShareCode) : null;
      const pdfBlob = await generateOfferPdfBlob({
        customer,
        monthlyItems,
        onceItems,
        wartungItems,
        autoTerms,
        totals,
        notes,
        raten,
        rabattActive,
        skontoActive,
        showFinancing: finanzOpen,
        creator: creatorInfo,
        mandatsRef,
        acceptQrDataUrl,
        serviceStartDate,
        copierOffer,
      });
      const blob = new Blob([pdfBlob], { type: 'application/pdf' });

      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const customerName = (customer.company || customer.name || 'Kunde')
        .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 30);
      const filename = `KITZ_Angebot_${customerName}_${dateStr}.pdf`;

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
      const creatorInfo = TEAM.find(t => t.id === creator);
      const result = await saveOffer({
        id: currentOfferId,
        customer,
        creator,
        creatorName: creatorInfo?.name || creator,
        creatorEmail: creatorInfo?.email || null,
        briefing,
        cart,
        globalTier,
        notes,
        raten,
        finanzOpen,
        rabattActive,
        skontoActive,
        totalMonthly: persistTotals.monthly,
        totalOnce: persistTotals.once,
        totalPeriod: persistTotals.periodTotal,
        mandatsRef,
        customItems: getCustomItemsFromCart(),
        cartOrder,
        serviceStartDate,
        offerType,
        rental,
      });
      setCurrentOfferId(result.id);

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
        creatorEmail: creatorInfo?.email || null,
        briefing,
        cart,
        globalTier,
        notes,
        raten,
        finanzOpen,
        rabattActive,
        skontoActive,
        totalMonthly: persistTotals.monthly,
        totalOnce: persistTotals.once,
        totalPeriod: persistTotals.periodTotal,
        mandatsRef,
        customItems: getCustomItemsFromCart(),
        cartOrder,
        serviceStartDate,
        offerType,
        rental,
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
        creatorEmail: creatorInfoForSave?.email || null,
        briefing,
        cart, globalTier, notes, raten, finanzOpen, rabattActive, skontoActive,
        totalMonthly: persistTotals.monthly,
        totalOnce: persistTotals.once,
        totalPeriod: persistTotals.periodTotal,
        mandatsRef,
        customItems: getCustomItemsFromCart(),
        cartOrder,
        serviceStartDate,
        offerType,
        rental,
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
      const creatorInfo = TEAM.find(t => t.id === creator);
      const validSendEntries = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
      const { monthlyItems, onceItems } = buildLineItems(validSendEntries, ALL);

      const wartungItems = buildWartungItems(validSendEntries);
      const autoTerms = computeAutoTerms(cart);

      // Ensure a share_code exists so the accept URL works (only needed when billing is enabled)
      let effectiveShareCode = shareCode;
      if (acceptEnabled && !effectiveShareCode) {
        effectiveShareCode = Math.random().toString(36).slice(2, 10);
        await setShareCode(offerId, effectiveShareCode);
        setShareCodeState(effectiveShareCode);
      }
      const acceptQrDataUrl = acceptEnabled ? await generateAcceptQr(effectiveShareCode) : null;
      const pdfBlob = await generateOfferPdfBlob({
        customer, monthlyItems, onceItems, wartungItems, autoTerms,
        totals, notes, raten, rabattActive, skontoActive,
        showFinancing: finanzOpen, creator: creatorInfo,
        mandatsRef, acceptQrDataUrl, serviceStartDate, copierOffer,
      });

      const buffer = await pdfBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const customerName = (customer.company || customer.name || 'Kunde')
        .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_').substring(0, 30);
      const filename = `KITZ_Angebot_${customerName}_${dateStr}.pdf`;

      await sendOffer(offerId, base64, filename, emailText, { includeAcceptLink: acceptEnabled });
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
    const creatorInfo = TEAM.find(t => t.id === creator) || null;
    const validSignEntries = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
    const { monthlyItems, onceItems } = buildLineItems(validSignEntries, ALL);

    const wartungItems = buildWartungItems(validSignEntries);
    const autoTerms = computeAutoTerms(cart);

    const acceptQrDataUrl = acceptEnabled ? await generateAcceptQr(shareCode) : null;
    const pdfBlob = await generateOfferPdfBlob({
      customer, monthlyItems, onceItems, wartungItems, autoTerms,
      totals, notes, raten,
      showFinancing: finanzOpen, creator: creatorInfo,
      mandatsRef, signatures, acceptQrDataUrl, serviceStartDate, copierOffer,
    });
    const blob = new Blob([pdfBlob], { type: 'application/pdf' });

    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const customerName = (customer.company || customer.name || 'Kunde')
      .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_').substring(0, 30);
    const filename = `KITZ_Vertrag_${customerName}_${dateStr}.pdf`;

    await signOffer(currentOfferId, signatures, blob, filename);

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
      setCreator(offer.creator_id || ssoCreatorId() || '');
      setNotes(data.notes || '');
      setBriefing(offer.briefing || '');
      setRaten(data.raten || 12);
      setFinanzOpen(data.finanzOpen || false);
      setRabattActive(data.rabattActive || false);
      setSkontoActive(data.skontoActive || false);
      setGlobalTier(data.globalTier || '12mo');
      setOfferType(offer.offer_type || data.offerType || 'pos');
      setRental(data.rental || emptyRentalState());
      setMandatsRef(data.mandatsRef || Date.now().toString().slice(-12));
      setServiceStartDate(offer.service_start_date || new Date().toISOString().slice(0, 10));
      setCurrentOfferId(duplicate ? null : offer.id);
      setShareCodeState(duplicate ? null : offer.share_code || null);
      setOfferView('builder'); setBuilderTab('angebot');
    } catch (err) {
      alert('Fehler beim Laden: ' + err.message);
    }
  }

  function handleNewOffer(type = 'pos') {
    clearCustomItems();
    setCart({});
    setCartOrder([]);
    setCustomer({ name: '', company: '', email: '', phone: '', address: '' });
    setNotes('');
    setBriefing('');
    setRaten(12);
    setCurrentOfferId(null);
    setShareCodeState(null);
    setCreator(ssoCreatorId() || '');
    setFinanzOpen(false);
    setRabattActive(false);
    setSkontoActive(false);
    setGlobalTier('12mo');
    setOfferType(type);
    setRental(emptyRentalState());
    setMandatsRef(Date.now().toString().slice(-12));
    setServiceStartDate(new Date().toISOString().slice(0, 10));
    setBuilderTab(FIRST_TAB[type] || 'bessa');
    setOfferView('builder');
  }

  async function openDetailsModal() {
    if (!currentOfferId) return;
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsOffer(null);
    setDetailsActivities([]);
    setDetailsEvents([]);
    try {
      // Pull the canonical row + the contact log + email-event
      // history in parallel. Listing failures degrade to an empty
      // section rather than failing the whole modal.
      const [full, acts, evts] = await Promise.all([
        getOffer(currentOfferId),
        listActivities(currentOfferId).catch(() => []),
        getEmailEvents(currentOfferId).catch(() => []),
      ]);
      setDetailsOffer(full);
      setDetailsActivities(acts || []);
      setDetailsEvents(evts || []);
    } catch (err) {
      alert('Fehler beim Laden der Details: ' + err.message);
      setDetailsOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  }

  function handleReset() {
    if (confirm('Angebot zurücksetzen?')) {
      clearCustomItems();
      setCart({});
      setCartOrder([]);
      setCustomer({ name: '', company: '', email: '', phone: '', address: '' });
      setNotes('');
      setBriefing('');
      setRaten(12);
      setCurrentOfferId(null);
      setMandatsRef(Date.now().toString().slice(-12));
    }
  }

  return (
    <AppShell
      activeSection={section}
      onNavigate={(s) => {
        navigate(pathForSection(s));
        if (s === 'angebote') setOfferView('list');
      }}
      showBillingToggle={isBillingAdmin}
      billingToggle={billingToggle}
      onToggleBilling={setBillingToggle}
      badges={{ kalender: pendingApprovalsCount, tickets: myTicketCount }}
    >
      {/* ═══ ANGEBOTE SECTION ═══ */}
      {section === 'angebote' && offerView === 'list' && (
        <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
          <OfferListPage
            onLoad={handleLoadOffer}
            onNew={() => setShowNewOfferModal(true)}
            onOpenFollowUps={() => setOfferView('followups')}
          />
        </div>
      )}

      {showNewOfferModal && (
        <NewOfferTypeModal
          onSelect={(type) => { setShowNewOfferModal(false); handleNewOffer(type); }}
          onClose={() => setShowNewOfferModal(false)}
        />
      )}

      {section === 'angebote' && offerView === 'followups' && (
        <FollowUpsPage
          onBack={() => setOfferView('list')}
          onLoad={(id) => handleLoadOffer(id, false)}
          autoOpenFollowupOfferId={pendingFollowupOfferId}
          onAutoOpenConsumed={() => setPendingFollowupOfferId(null)}
        />
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
                {currentOfferId && (
                  <button
                    onClick={openDetailsModal}
                    className="flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1.5 md:px-3 hover:bg-blue-100 transition-colors font-medium"
                    style={{ fontSize: 12 }}
                    title="Volle Angebots-Info: Briefing, Kontaktverlauf, E-Mail-Events"
                  >
                    <Info size={13} /> Info
                  </button>
                )}
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
                {builderTabs.map(t => (
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
            {builderTab !== 'angebot' && builderTab !== 'leihstellung' && (
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
            {search.trim() && builderTab !== 'angebot' && builderTab !== 'leihstellung' ? (
              (() => {
                const q = search.toLowerCase().trim();
                const allItems = offerType === 'sharp'
                  ? [...SHARP, ...SHARP_ZUBEHOR]
                  : offerType === 'brother'
                  ? [...BROTHER]
                  : [...BESSA, ...MELZER, ...GASTROTOUCH, ...RCH, ...HARDWARE, ...UNIFY, ...KUECHENMONITORE, ...KUECHENMONITORE_SUNMI, ...KIOSK, ...ORDERMAN, ...DIENSTLEISTUNGEN];
                const results = allItems.filter(item =>
                  item.name.toLowerCase().includes(q)
                  || (item.code && item.code.toLowerCase().includes(q))
                  || (item.note && item.note.toLowerCase().includes(q)),
                );
                return (
                  <div>
                    <div className="text-sm text-slate-500 mb-3">{results.length} Ergebnis{results.length !== 1 ? 'se' : ''} für &ldquo;{search}&rdquo;</div>
                    {results.length > 0 ? (
                      <div className="space-y-2">
                        {results.map(item => (
                          item.t === 'copier'
                            ? <CopierItemCard key={item.id} item={item} cartItem={cart[item.id]} {...handlers} />
                            : <ItemCard key={item.id} item={item} cartItem={cart[item.id]} globalTier={globalTier} {...handlers} />
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
                {builderTab === 'sharp' && (
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
                    {SHARP.map(item => (
                      <CopierItemCard key={item.id} item={item} cartItem={cart[item.id]} {...handlers} />
                    ))}
                  </div>
                )}
                {builderTab === 'zubehoer' && <TabContent items={SHARP_ZUBEHOR} cart={cart} globalTier={globalTier} handlers={handlers} />}
                {builderTab === 'brother' && <TabContent items={BROTHER} cart={cart} globalTier={globalTier} handlers={handlers} />}
                {builderTab === 'leihstellung' && <LeihstellungCalculator rental={rental} onChange={setRental} />}
                {builderTab === 'bessa' && <TabContent items={BESSA} cart={cart} globalTier={globalTier} handlers={handlers} />}
                {builderTab === 'melzer' && <TabContent items={MELZER} cart={cart} globalTier={globalTier} handlers={handlers} />}
                {builderTab === 'gastrotouch' && <TabContent items={GASTROTOUCH} cart={cart} globalTier={globalTier} handlers={handlers} />}
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
                    <CatGroup title="Kiosk" items={KIOSK} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Orderman" items={ORDERMAN} cart={cart} globalTier={globalTier} handlers={handlers} />
                    <CatGroup title="Dienstleistungen" items={DIENSTLEISTUNGEN} cart={cart} globalTier={globalTier} handlers={handlers} />
                  </>
                )}
                {builderTab === 'angebot' && (
                  <>
                    <OfferView
                      cart={cart} copierOffer={copierOffer} customer={customer} setCustomer={setCustomer} creator={creator} setCreator={setCreator} notes={notes} setNotes={setNotes} briefing={briefing} setBriefing={setBriefing}
                      totals={totals} onPrint={handlePrint} onCopy={handleCopy} copied={copied} onCopyLink={handleCopyLink} linkCopied={linkCopied} raten={raten} setRaten={setRaten} pdfLoading={pdfLoading} finanzOpen={finanzOpen} setFinanzOpen={setFinanzOpen} globalTier={globalTier}
                      rabattActive={rabattActive} setRabattActive={setRabattActive} skontoActive={skontoActive} setSkontoActive={setSkontoActive}
                      serviceStartDate={serviceStartDate} setServiceStartDate={setServiceStartDate}
                      billingEnabled={billingEnabled}
                      onSave={handleSave} onSend={openEmailPreview} saving={saving} sending={sending} saveSuccess={saveSuccess} currentOfferId={currentOfferId}
                      onSign={() => setShowSignModal(true)} onAddCustom={() => setShowCustomModal(true)}
                      cartOrder={cartOrder} onReorder={setCartOrder} onRemoveItem={handlers.onRemove} onEditItem={handleEditItem} onCopierField={handlers.onCopierField}
                    />
                    {showEmailPreview && (
                      <EmailPreviewModal
                        customer={customer}
                        creator={TEAM.find(t => t.id === creator)}
                        totals={persistTotals}
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
                        rabattActive={rabattActive} skontoActive={skontoActive}
                        onConfirm={handleSign} onClose={() => setShowSignModal(false)}
                      />
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
                    {offerType === 'rental' ? (
                      totals.once > 0
                        ? <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>€ {fmt(totals.once)}<span className="font-normal text-slate-400" style={{ fontSize: 11 }}> Leihpreis netto</span></span>
                        : <span className="text-slate-400" style={{ fontSize: 13 }}>Noch keine Auswahl</span>
                    ) : copierOffer.isCopierOffer ? (
                      copierOffer.saleMode === 'leasing'
                        ? <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>€ {fmt(copierOffer.leasing.rate)}<span className="font-normal text-slate-400" style={{ fontSize: 11 }}>/Mo Leasing</span></span>
                        : <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>€ {fmt(copierOffer.net)}<span className="font-normal text-slate-400" style={{ fontSize: 11 }}> netto (Kauf)</span></span>
                    ) : (
                      <>
                        {totals.monthly > 0 && <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>€ {fmt(totals.monthly)}<span className="font-normal text-slate-400" style={{ fontSize: 11 }}>/Mo</span></span>}
                        {totals.once > 0 && <span className="font-bold text-slate-800" style={{ fontSize: 14 }}>€ {fmt(totals.once)}<span className="font-normal text-slate-400" style={{ fontSize: 11 }}> einm.</span></span>}
                        {totals.monthly === 0 && totals.once === 0 && <span className="text-slate-400" style={{ fontSize: 13 }}>Noch keine Auswahl</span>}
                      </>
                    )}
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

      {/* ═══ KALENDER SECTION ═══ */}
      {section === 'kalender' && (
        <React.Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-red-400" size={24} /></div>}>
          <CalendarPage />
        </React.Suspense>
      )}

      {/* ═══ TICKETS SECTION ═══ */}
      {section === 'tickets' && (
        <React.Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-red-400" size={24} /></div>}>
          <TicketsPage />
        </React.Suspense>
      )}

      {/* ═══ DISPATCHER SECTION ═══ */}
      {section === 'dispatcher' && (
        <React.Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-red-400" size={24} /></div>}>
          <DispatcherPage />
        </React.Suspense>
      )}

      {detailsOpen && (
        <OfferDetailsModal
          offer={detailsOffer}
          activities={detailsActivities}
          events={detailsEvents}
          activitiesLoading={detailsLoading && detailsActivities.length === 0}
          eventsLoading={detailsLoading && detailsEvents.length === 0}
          loading={detailsLoading}
          onClose={() => { setDetailsOpen(false); setDetailsLoading(false); }}
        />
      )}
    </AppShell>
  );
}
