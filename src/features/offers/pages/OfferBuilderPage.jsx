import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';

import OfferPdfDocument from '../../../pdf/OfferPdfDocument';
import { getOfferFromURL } from '../../../lib/urlState';
import {
  saveOffer,
  getOffer,
  sendOffer,
  setShareCode,
  getOfferByShareCode,
  updateOfferStage,
  signOffer,
} from '../../../lib/offerApi';
import { supabase } from '../../../lib/supabase';
import { generateAcceptQr } from '../../../lib/qr';
import { useAuth } from '../../../lib/auth';
import { TIERS, TIER_LABEL_OFFER, TIER_SHORT } from '../../../data/tiers';
import { computeAutoTerms } from '../../../data/autoTermRules';
import {
  hasDiscount,
  isMonthly,
  price,
  discountedPrice,
  yearlyServicePerUnit,
} from '../../../lib/pricing';
import { computeTotals } from '../../../lib/totals';
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
  isCustomItem,
} from '../data/catalogs';
import OfferView from '../components/OfferView';
import ItemCard from '../components/ItemCard';
import CatGroup from '../components/CatGroup';
import TabContent from '../components/TabContent';
import SignModal from '../components/modals/SignModal';
import CustomItemModal from '../components/modals/CustomItemModal';
import EmailPreviewModal from '../components/modals/EmailPreviewModal';
import OfferListPage from './OfferListPage';
import FollowUpsPage from './FollowUpsPage';
import { orderedCartEntries } from '../../../lib/cartOrder';
import { fmt } from '../../../lib/format';
import { findIdBySsoEmail } from '../../../lib/ssoMatch';
import AppShell from '../../../components/AppShell';
import VacationPage from '../../vacation/pages/VacationPage';
import { useApproverPendingCount } from '../../vacation/hooks/useApproverPendingCount';
import { useLocation, useNavigate } from 'react-router-dom';
import { pathForSection, sectionFromPath } from '../../../lib/sectionRoute';

const CrmPage = React.lazy(() => import('../../../components/CrmPage.jsx'));

const BUILDER_TABS = [
  { id: 'bessa', label: 'Bessa' },
  { id: 'melzer', label: 'Melzer' },
  { id: 'rch', label: 'RCH' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'angebot', label: 'Angebot' },
];

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
  const [offerView, setOfferView] = useState('list'); // 'list' | 'builder' | 'followups'
  // When set, the FollowUps page picks this up and immediately opens
  // SendFollowupModal for that offer. Driven by the digest deep-link
  // (?action=send-followup&offer=ID); cleared after first render so
  // a user-driven nav back to the page doesn't reopen the modal.
  const [pendingFollowupOfferId, setPendingFollowupOfferId] = useState(null);
  const [builderTab, setBuilderTab] = useState('bessa');
  const [globalTier, setGlobalTier] = useState('12mo');
  const [cart, setCart] = useState({});
  const [customer, setCustomer] = useState({ name: '', company: '', email: '', phone: '', address: '' });
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
      setCustomer(savedOffer.customer || { name: '', company: '', email: '', phone: '', address: '' });
      setCreator(savedOffer.creator || ssoCreatorId() || '');
      setNotes(savedOffer.notes || '');
      setRaten(savedOffer.raten || 12);
      setFinanzOpen(savedOffer.finanzOpen || false);
      setGlobalTier(savedOffer.globalTier || '12mo');
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
    const monthlyItems = allOrdered.filter(([id, c]) => isMonthly(ALL[id], c.mode));
    const onceItems = allOrdered.filter(([id, c]) => !isMonthly(ALL[id], c.mode));

    if (monthlyItems.length > 0) {
      lines.push('----------------------------------------');
      lines.push('MONATLICHE KOSTEN');
      lines.push('----------------------------------------');
      monthlyItems.forEach(([id, c], i) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode);
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

    if (onceItems.length > 0) {
      lines.push('----------------------------------------');
      lines.push('EINMALIGE KOSTEN');
      lines.push('----------------------------------------');
      onceItems.forEach(([id, c], i) => {
        const item = ALL[id];
        const p = price(item, c.tier, c.mode);
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
      const monthlyItems = validEntries
        .filter(([id, c]) => isMonthly(ALL[id], c.mode))
        .map(([id, c]) => {
          const item = ALL[id];
          const p = price(item, c.tier, c.mode);
          const dp = discountedPrice(item, c.tier, c.mode);
          const fullQty = c.qty || 0;
          const discQty = c.discountQty || 0;
          return {
            id, qty: fullQty, discountQty: discQty,
            code: item.code || '', name: item.name, info: item.info,
            tier: c.tier, mode: c.mode, type: item.t,
            unitPrice: p, discountPrice: dp,
            hasDiscount: hasDiscount(item), discountLabel: item.discount?.label,
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
            id, qty: fullQty, discountQty: discQty,
            code: item.code || '', name: item.name, info: item.info,
            tier: c.tier, mode: c.mode, type: item.t,
            unitPrice: p, discountPrice: dp,
            hasDiscount: hasDiscount(item), discountLabel: item.discount?.label,
            lineTotal: (p * fullQty) + (dp * discQty),
          };
        });

      const wartungItems = buildWartungItems(validEntries);
      const autoTerms = computeAutoTerms(cart);

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
            creatorEmail: creatorInfo?.email || null,
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
        />,
      ).toBlob();
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
        creatorEmail: creatorInfoForSave?.email || null,
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
        />,
      ).toBlob();

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
      />,
    ).toBlob();
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
    setCustomer({ name: '', company: '', email: '', phone: '', address: '' });
    setNotes('');
    setRaten(12);
    setCurrentOfferId(null);
    setShareCodeState(null);
    setCreator(ssoCreatorId() || '');
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
      setCustomer({ name: '', company: '', email: '', phone: '', address: '' });
      setNotes('');
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
      badges={{ urlaub: pendingApprovalsCount }}
    >
      {/* ═══ ANGEBOTE SECTION ═══ */}
      {section === 'angebote' && offerView === 'list' && (
        <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
          <OfferListPage
            onLoad={handleLoadOffer}
            onNew={handleNewOffer}
            onOpenFollowUps={() => setOfferView('followups')}
          />
        </div>
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
                    <OfferView
                      cart={cart} customer={customer} setCustomer={setCustomer} creator={creator} setCreator={setCreator} notes={notes} setNotes={setNotes}
                      totals={totals} onPrint={handlePrint} onCopy={handleCopy} copied={copied} onCopyLink={handleCopyLink} linkCopied={linkCopied} raten={raten} setRaten={setRaten} pdfLoading={pdfLoading} finanzOpen={finanzOpen} setFinanzOpen={setFinanzOpen} globalTier={globalTier}
                      serviceStartDate={serviceStartDate} setServiceStartDate={setServiceStartDate}
                      billingEnabled={billingEnabled}
                      onSave={handleSave} onSend={openEmailPreview} saving={saving} sending={sending} saveSuccess={saveSuccess} currentOfferId={currentOfferId}
                      onSign={() => setShowSignModal(true)} onAddCustom={() => setShowCustomModal(true)}
                      cartOrder={cartOrder} onReorder={setCartOrder} onRemoveItem={handlers.onRemove} onEditItem={handleEditItem}
                    />
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

      {/* ═══ URLAUB SECTION ═══ */}
      {section === 'urlaub' && <VacationPage />}
    </AppShell>
  );
}
