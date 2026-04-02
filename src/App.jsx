import React, { useState, useMemo, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { Plus, Minus, X, Download, ShoppingCart, ChevronDown, User, FileText, Trash2, Copy, Check, Search, Loader2, Link, Save, Send, Mail, Clock, Eye, RefreshCw, ArrowLeft, Calendar, Building2, AlertCircle, CheckCircle2, XCircle, MailOpen, Archive, Pen, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from './pdf/OfferPdfDocument';
import { getOfferFromURL } from './lib/urlState';
import { saveOffer, listOffers, getOffer, deleteOffer, sendOffer, getEmailEvents, setShareCode, getOfferByShareCode, updateOfferStage, signOffer, getSignedPdfUrl } from './lib/offerApi';
import { supabase } from './lib/supabase';
import { useAuth } from './lib/auth';

// ═══════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════

const TIERS = ['12mo','6mo','2mo','event'];
const TIER_LABEL = { '12mo':'12 Monate','6mo':'6 Monate','2mo':'2 Monate','event':'1-3 Tage' };
const TIER_SHORT = { '12mo':'Jahr','6mo':'Saison','2mo':'Märkte','event':'Events' };
const TIER_LABEL_OFFER = { '12mo':'12 Monate mtl.','6mo':'6 Monate mtl.','2mo':'2 Monate mtl.','event':'1-3 Tage/Event' };

const COMPANY_DEFAULT = {
  name: 'KITZ Computer + Office GmbH',
  address1: 'Rosentaler Straße 1, A-9020 Klagenfurt',
  address2: 'Johann-Offner-Straße 17, A-9400 Wolfsberg',
  phone1: '+43 (0) 463 504454',
  phone2: '+43 (0) 4352 4176',
  email: 'officekl@kitz.co.at',
  website: 'www.kitz.co.at',
  logo: 'https://www.kitz.co.at/wp-content/uploads/2019/12/kitz-logo-2020-300x138.png',
};

const KASSA = [
  { id:'3942f638-1abb-4be9-85a5-d3bf442aa3d8', code:'100', name:'Mobile Kassa', cat:'Mobil', p:{y:19,s:25,m:30,e:38}, t:'m' },
  { id:'c4aca644-5fb4-46cf-9fea-8ddc1bee8c30', code:'109', name:'bessa Mobil', cat:'Mobil', p:{y:119}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'cb003c42-11dc-48c9-a5de-68a2c998501a', code:'110', name:'Kleiner Handelsbetrieb', cat:'Handel', p:{y:24,s:30,m:40,e:48}, t:'m' },
  { id:'4d6ee0aa-32ad-480a-aa2f-4d1ddf620b12', code:'111', name:'Großer Handelsbetrieb', cat:'Handel', p:{y:42,s:55,m:70,e:84}, t:'m' },
  { id:'6fa5da94-d90b-41a1-ab17-f515d172b940', code:'115', name:'Web Kassa / Auftragsverwaltung', cat:'Handel', p:{y:19,s:25,m:30}, t:'m' },
  { id:'1dfe4874-04a7-47e9-9230-e1696b6e8901', code:'119', name:'bessa Handelsbetrieb', cat:'Handel', p:{y:160}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'a4e9ba39-ee22-41b9-8f94-936ee3ce3de3', code:'120', name:'Kleiner Gastrobetrieb', cat:'Gastro', p:{y:45,s:55,m:70,e:90}, t:'m' },
  { id:'95cd9f0f-ec0d-46eb-aaa6-330a8ce129d4', code:'121', name:'Großer Gastrobetrieb', cat:'Gastro', p:{y:62,s:80,m:100,e:124}, t:'m' },
  { id:'6f8ed70a-8388-40d6-8e9e-516f524cd3e5', code:'129', name:'bessa Gastrobetrieb', cat:'Gastro', p:{y:240}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'40769d58-ebbb-40f8-b4b8-9a89da35a934', code:'020', name:'Zusätzlicher Bediener', cat:'Einzelfunktionen', p:{y:3,s:4,m:5,e:6}, t:'m' },
  { id:'4bc73978-ee15-4858-8107-87d3faa210e2', code:'021', name:'Kundenverwaltung', cat:'Einzelfunktionen', p:{y:10,s:12,m:16,e:20}, t:'m' },
  { id:'f7a4cb27-d3cf-4e84-ba58-a273da596c06', code:'022', name:'Lagerverwaltung', cat:'Einzelfunktionen', p:{y:15,s:18,m:20,e:30}, t:'m', note:'+10h Arbeitszeit' },
  { id:'00c9aca1-e463-4c63-a5c2-9fd51d70010a', code:'023', name:'Lokale Gutscheinverwaltung', cat:'Einzelfunktionen', p:{y:10,s:12,m:16,e:20}, t:'m' },
  { id:'3296ada4-f7f8-47a1-9cf5-a3dc64326f3a', code:'024', name:'Erweitertes Berichtswesen', cat:'Einzelfunktionen', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'b2a3bb5a-370c-49d4-96e3-874b5df66c56', code:'030', name:'bessa Signieren', cat:'Einzelfunktionen', p:{y:9,s:11,m:25,e:50}, t:'m', note:'derzeit nur DE' },
  { id:'14105277-c0ca-400f-9444-3ec9414fb279', code:'040a', name:'Anbindung bessa Zahlen (Kartenzahlung)', cat:'Externe Systeme', p:{y:0,s:0,m:0,e:0}, t:'m' },
  { id:'65e7e1a8-23b3-444f-8b18-c5ca7312cf28', code:'040', name:'Anbindung Kartenzahlungsterminal', cat:'Externe Systeme', p:{y:12,s:15,m:18,e:24}, t:'m' },
  { id:'117be9d9-f2b0-409d-9ec6-9497f943ff4f', code:'041', name:'Anbindung Barzahlungsterminal', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'eceb4278-06cc-4fe5-9413-d41ae999166c', code:'042', name:'Nebenterminal', cat:'Externe Systeme', p:{y:14,s:16,m:18,e:28}, t:'m' },
  { id:'0824405f-8780-4371-919b-5cee2c6efb07', code:'043', name:'Bestellmonitor', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'ad5d1834-f864-43a1-8be4-2bae0bfeade4', code:'044', name:'Anbindung Schankanlage', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m', note:'+10h Arbeitszeit' },
  { id:'a336d467-a39f-4acd-8872-e7d185c45ea9', code:'049', name:'Öffentliche Schnittstelle', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
];

const MODULE = [
  { id:'3ad3609d-c87a-485f-b96f-827e60c79e81', code:'300', name:'App (pro Filiale)', cat:'Pakete', p:{y:109}, t:'m', note:'50% Rabatt je weitere Filiale', discount:{type:'percent',value:50,label:'Weitere Filiale'} },
  { id:'d3a94a99-982c-4969-aab8-9aed654ed0cb', code:'310', name:'Handel (pro Filiale)', cat:'Pakete', p:{y:139}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'37551e30-8b3f-44cf-a126-702dfd2539ea', code:'320', name:'Gastro (pro Filiale)', cat:'Pakete', p:{y:199}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'bfa4ca0e-b5ed-4cd2-a1a7-12c02854082f', code:'200', name:'Web-Bestellungen', cat:'Einzelfunktionen', p:{y:39,s:49}, t:'m' },
  { id:'48065ab3-b47f-46ae-a32e-2176ae41dd30', code:'201', name:'Kundenbindung Kundenkarte', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'35518df7-6eb3-4bd3-a21c-33e379d23271', code:'202', name:'Lieferservice-Bestellungen', cat:'Einzelfunktionen', p:{y:39}, t:'m', info:'Lieferando, Foodora, Wolt and UberEATS' },
  { id:'d2c207cf-3c6f-41f6-a1df-739e8e48d4bb', code:'203', name:'Gastro-Kiosk-Bestellungen', cat:'Einzelfunktionen', p:{y:99,s:125}, t:'m', note:'50% je weiterer Kiosk', discount:{type:'percent',value:50,label:'Weiterer Kiosk'} },
  { id:'d0c56974-678a-41b0-9924-e5353cc0891b', code:'204', name:'Tisch-Tablet-Bestellungen', cat:'Einzelfunktionen', p:{y:9,s:12}, t:'m' },
  { id:'cdc84a4d-99b6-48c5-b414-c5be9daeff03', code:'205', name:'Schank-Bestellungen', cat:'Einzelfunktionen', p:{y:99,s:125}, t:'m', note:'50% je weitere Schank', discount:{type:'percent',value:50,label:'Weitere Schank'} },
  { id:'ec32520e-cbba-4739-8cf0-fd8bb918ca55', code:'206', name:'Kantinen-Bestellungen', cat:'Einzelfunktionen', p:{y:99}, t:'m', note:'50% für öffentl. Einr.' },
  { id:'01289762-3f01-486f-8ab8-d5aa9038996e', code:'207', name:'Online Gutscheinverwaltung', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'33da16d1-bbaf-40b1-bac4-9160ce593952', code:'208', name:'Gutscheine Shopify/WooCommerce', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'f2d30dd5-e54f-426d-8ea5-20ccb6396b06', code:'209', name:'Gastrotouch Kennzahlen', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
];

const HARDWARE = [
  { id:'fdb37b6a-4ad5-4a46-ba8f-53e4a2154ce3', name:'Sunmi D3 Pro', price:1024, t:'o' },
  { id:'c36c776a-194a-4c32-b758-8ffc09cf991b', name:'Sunmi D3 Mini', price:690, t:'o' },
  { id:'bbcba755-3fa2-4c21-85e2-9842a1baa541', name:'D3 Pro Garantieverlängerung', price:190, t:'o', info:'auf 48 Monate' },
  { id:'91b8a7fa-5b0c-44a4-a4a7-fd6c6f0b25f6', name:'Sunmi V3H', price:649, t:'o' },
  { id:'4bc17b56-5e4e-49cf-b4fb-a0e4d295335a', name:'Sunmi L3H', price:599, t:'o' },
  { id:'1a4f3300-edd2-477f-8188-604b8ef8fba3', name:'V3H/L3H/D3 mini Garantieverlängerung', price:90, t:'o', info:'auf 48 Monate' },
  { id:'7ea30866-25d7-4fa2-b970-0fd6911a3de8', name:'Hobex ViA PRO', price:1149, t:'o' },
  { id:'4be8df2f-6293-4a06-b559-d7856c12c1bf', name:'Addminat-Kellnerschloss', price:178, t:'o', info:'inkl 5 Schlüssel' },
];

const DRUCKER = [
  { id:'d2769912-6880-4996-b6b9-07d4fdbc9406', name:'Epson TMT20 Bondrucker', price:280, t:'o' },
  { id:'2ce55292-b567-488a-bd35-20f280dc8381', name:'Bixolon SPP-R200III', price:376, t:'o' },
];

const KUECHENMONITORE = [
  // KitchenSpeed Lite
  { id:'b98e4215-ab79-45b0-a365-32a6bb9367a5', name:'KitchenSpeed Lite 15,6" Intel J6412', price:1960, t:'o' },
  { id:'be7b9177-1682-4388-bfe5-07615adf7cde', name:'KitchenSpeed Lite 15,6" Intel i3', price:2400, t:'o' },
  { id:'ca26b2dd-e2ee-4068-baeb-0b30bef3652f', name:'KitchenSpeed Lite 15,6" Android PoE++', price:1960, t:'o' },
  { id:'fcb98549-60de-4634-bf8d-267648cde83e', name:'KitchenSpeed Lite 21,5" Intel J6412', price:2390, t:'o' },
  { id:'82dfb1e9-37e8-465c-8f08-d56fbe5cd525', name:'KitchenSpeed Lite 21,5" Intel i3', price:2830, t:'o' },
  { id:'227beac0-cae4-444b-b349-75692a4c288f', name:'KitchenSpeed Lite 21,5" Android PoE++', price:2390, t:'o' },
  { id:'ba4b1c27-d6dc-4120-b348-236430abecc8', name:'KitchenSpeed Lite 32" Intel J6412', price:3520, t:'o' },
  { id:'c659e63f-1305-4729-89ab-560e527cd8a2', name:'KitchenSpeed Lite 32" Intel i3', price:3980, t:'o' },
  { id:'ce5d9b69-52e4-4199-8adf-97f192a9b4e3', name:'KitchenSpeed Lite 32" Android PoE++', price:3520, t:'o' },
  // KitchenSpeed Ultra
  { id:'4a898f54-638b-45e8-8f29-d1d3f573d9ad', name:'KitchenSpeed Ultra 22" Intel N97', price:4760, t:'o' },
  { id:'bd6f02cc-856f-42b2-b3a2-90aacf32c76f', name:'KitchenSpeed Ultra 32" Intel N97', price:5780, t:'o' },
  // Zubehör
  { id:'3fff9523-d8bd-4c3f-bcd2-00068feba867', name:'Windows 10 IoT Enterprise LTSC', price:110, t:'o' },
  { id:'7e3f6afa-b17a-4254-aa8a-a40d80610aa1', name:'Halterungslösung (Wand/Decke/Standfuß)', price:358, t:'o' },
  { id:'94561292-0c42-47a1-b938-ed3337d8583e', name:'Signalisierungslautsprecher', price:56, t:'o', info:'für Lite' },
  // Service
  { id:'69363519-c612-4ecb-9733-02bd782bd654', name:'Black Pepper-Protect Upgrade', price:96, t:'o', info:'für Lite' },
  { id:'9472265f-181b-403c-bec5-1a53cdc88117', name:'Garantieverlängerung Lite +1 Jahr', price:196, t:'o' },
  { id:'767029e1-52cf-40a3-9f76-e49c145b94eb', name:'Garantieverlängerung Ultra +1 Jahr', price:360, t:'o' },
  { id:'90dc559f-f14a-457d-a328-eb7c6945a5c3', name:'Garantieverlängerung Ultra +2 Jahre', price:640, t:'o' },
];

const KUECHENMONITORE_SUNMI = [
  { id:'5c1b7d35-27b4-4bc1-b44c-fb8a2f1ca153', name:'Flex 3 22\'\'', price:1139, t:'o' },
  { id:'9105cea7-5ce7-4cab-87ba-12395c184861', name:'Flex 3 27\'\'', price:1749, t:'o' },
  { id:'dcfacd8a-e274-44ae-89f7-ecc03164c439', name:'Flex 3 Garantieverlängerung', price:190, t:'o', info:'auf 48 Monate' },
];

const DIENSTLEISTUNGEN = [
  { id:'00caa501-4266-4459-bbf6-38074fa7a00d', name:'Fiskalisierung', price:190, t:'o' },
  { id:'b01429e1-672e-44ae-ae79-1d08c4f7f918', name:'Arbeitszeit', price:118, t:'o', info:'pro Stunde' },
];

const ORDERMAN = [
  { id:'591d5910-776c-4864-8cfc-0ad55c6ccca9', name:'Orderman 10', price:900, t:'o' },
  { id:'24931794-f0f7-44a8-a476-f0a1c5380484', name:'Orderman Garantieverlängerung', price:270, t:'o', info:'auf 48 Monate' },
  { id:'6b8ccb5b-d690-4daf-82d5-ef637822817f', name:'Orderman Ladestation inkl. Netzteil', price:210, t:'o' },
  { id:'a252444d-0ac6-4809-9ede-16125a3bc5f0', name:'Orderman Ersatzbatterie', price:60, t:'o' },
  { id:'d1697574-cac7-4fec-8e72-89a582a0d6d5', name:'Orderman Gürteltasche', price:25, t:'o' },
  { id:'0134901e-4d85-4e1d-a65b-c53be99e8ef4', name:'Orderman Safety-Cord', price:14, t:'o' },
];

const TEAM = [
  { id:'gkitz', name:'Georg Kitz', role:'Geschäftsführung', phone:'+43 463 504454 77', email:'g.kitz@kitz.co.at', location:'Klagenfurt' },
  { id:'hbauer', name:'Helmut Bauer', role:'Verkauf', phone:'+43 4352 4176 21', email:'h.bauer@kitz.co.at', location:'Wolfsberg' },
  { id:'dscharf', name:'Daniel Scharf', role:'Verkauf', phone:'+43 4352 4176 22', email:'d.scharf@kitz.co.at', location:'Wolfsberg' },
  { id:'anowak', name:'Andreas Nowak', role:'Verkauf', phone:'+43 463 504454 82', email:'a.nowak@kitz.co.at', location:'Klagenfurt' },
  { id:'thuber', name:'Toni Huber', role:'Kassensystemberater', phone:'+43 664 886 033 14', email:'t.huber@kitz.co.at', location:'Klagenfurt' },
  { id:'hscheiber', name:'Heribert Scheiber', role:'Software Support', phone:'+43 4352 4176 43', email:'h.scheiber@kitz.co.at', location:'Wolfsberg' },
  { id:'mklein', name:'Marcel Klein', role:'Support', phone:'+43 463 504454 73', email:'m.klein@kitz.co.at', location:'Klagenfurt' },
  { id:'hrussnig', name:'Heimo Russnig', role:'EDV / Technik', phone:'+43 463 504454 71', email:'h.russnig@kitz.co.at', location:'Klagenfurt' },
  { id:'coberlerchner', name:'Christian Oberlerchner', role:'Technik', phone:'+43 4352 4176 38', email:'c.oberlerchner@kitz.co.at', location:'Wolfsberg' },
  { id:'hkitz', name:'Herbert Kitz', role:'Geschäftsführer', phone:'+43 4352 4176 15', email:'h.kitz@kitz.co.at', location:'Wolfsberg' },
];

// Build lookup
const ALL = {};
[...KASSA,...MODULE,...HARDWARE,...DRUCKER,...KUECHENMONITORE,...KUECHENMONITORE_SUNMI,...ORDERMAN,...DIENSTLEISTUNGEN].forEach(i => ALL[i.id] = i);
const CATALOG_IDS = new Set(Object.keys(ALL));
const isCustomItem = (id) => !CATALOG_IDS.has(id);

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const fmt = n => n.toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2});
const TKEY = {y:'12mo',s:'6mo',m:'2mo',e:'event'};
const TKEY_REV = {'12mo':'y','6mo':'s','2mo':'m','event':'e'};

function availableTiers(item) {
  if (item.t !== 'm') return [];
  return TIERS.filter(t => item.p[TKEY_REV[t]] !== undefined);
}

function bestTier(item, global) {
  const av = availableTiers(item);
  if (av.includes(global)) return global;
  return av[0] || null;
}

function price(item, tier, mode) {
  if (!item) return null;
  if (item.t === 'o') return item.p?.o ?? item.price ?? 0;
  if (item.t === 'h') return item.p?.o ?? item.price ?? 0;
  if (item.t === 'term') return mode === 'buy' ? item.buy : item.rent;
  if (item.t === 'm') {
    const k = TKEY_REV[tier];
    if (k && item.p[k] !== undefined) return item.p[k];
    const av = availableTiers(item);
    if (av.length) return item.p[TKEY_REV[av[0]]];
  }
  return null;
}

function discountedPrice(item, tier, mode) {
  const basePrice = price(item, tier, mode);
  if (!item.discount || basePrice === null) return basePrice;
  if (item.discount.type === 'fixed') return Math.max(0, basePrice - item.discount.value);
  if (item.discount.type === 'percent') return basePrice * (1 - item.discount.value / 100);
  return basePrice;
}

function hasDiscount(item) {
  return !!item.discount;
}

function isMonthly(item, mode) {
  if (!item) return false;
  if (item.t === 'term') return mode === 'rent';
  return item.t === 'm';
}

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
        </div>
      )}

      {!inCart && p !== null && (
        <div className="text-right mt-1">
          <span className="text-slate-500" style={{fontSize:12}}>
            € {fmt(p)}{monthly ? '/Mo' : item.t==='h' ? '/h' : ''}
          </span>
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
// SIGNATURE PAD + SIGN MODAL
// ═══════════════════════════════════════════════════════

const SignaturePad = forwardRef(function SignaturePad({ width = 400, height = 150 }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const empty = useRef(true);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * (canvasRef.current.width / rect.width), y: (t.clientY - rect.top) * (canvasRef.current.height / rect.height) };
  }

  function begin(e) {
    e.preventDefault();
    drawing.current = true;
    empty.current = false;
    const ctx = canvasRef.current.getContext('2d');
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() { drawing.current = false; }

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
  }, []);

  useImperativeHandle(ref, () => ({
    clear() {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      empty.current = true;
    },
    toDataURL() { return canvasRef.current.toDataURL('image/png'); },
    isEmpty() { return empty.current; },
  }));

  return (
    <canvas ref={canvasRef} width={width * 2} height={height * 2}
      style={{ width, height, border: '2px solid #e2e8f0', borderRadius: 12, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
      onMouseDown={begin} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
      onTouchStart={begin} onTouchMove={move} onTouchEnd={end} />
  );
});

function SignModal({ customer, totals, finanzOpen, globalTier, onConfirm, onClose }) {
  const offerPadRef = useRef(null);
  const sepaPadRef = useRef(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(null);
  const showSepa = finanzOpen && (totals.monthly > 0 || totals.once > 0);

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

// ═══════════════════════════════════════════════════════
// SORTABLE ITEM ROW
// ═══════════════════════════════════════════════════════

function SortableOfferRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <button {...attributes} {...listeners} className="flex-shrink-0 touch-none px-2 py-2.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing">
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// OFFER / ANGEBOT VIEW
// ═══════════════════════════════════════════════════════

function OfferView({ cart, customer, setCustomer, creator, setCreator, notes, setNotes, totals, onPrint, onCopy, copied, onCopyLink, linkCopied, raten, setRaten, pdfLoading, finanzOpen, setFinanzOpen, globalTier, onSave, onSend, saving, sending, saveSuccess, currentOfferId, onSign, signLoading, onAddCustom, cartOrder, onReorder, onRemoveItem }) {
  const allOrdered = orderedCartEntries(cart, cartOrder).filter(([id]) => ALL[id]);
  const monthlyItems = allOrdered.filter(([id,c]) => isMonthly(ALL[id], c.mode));
  const onceItems = allOrdered.filter(([id,c]) => !isMonthly(ALL[id], c.mode));

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
        <div className="flex items-center gap-2 mb-3">
          <User size={16} className="text-red-600" />
          <span className="font-bold text-slate-700" style={{fontSize:14}}>Kundendaten</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Name" value={customer.name} onChange={e => setCustomer({...customer,name:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="Firma" value={customer.company} onChange={e => setCustomer({...customer,company:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="E-Mail" type="email" value={customer.email} onChange={e => setCustomer({...customer,email:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          <input placeholder="Telefon" type="tel" value={customer.phone} onChange={e => setCustomer({...customer,phone:e.target.value})}
            className="w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
        </div>
        <input placeholder="Adresse (Straße, PLZ Ort)" value={customer.address} onChange={e => setCustomer({...customer,address:e.target.value})}
          className="w-full mt-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
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
          <p style={{fontSize:13}}>Wechsle zu Kassa, Module oder Hardware um Produkte hinzuzufügen.</p>
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
                        {isCustomItem(id) && <button onClick={() => onRemoveItem(id)} className="ml-2 text-slate-400 hover:text-red-500 transition-colors"><X size={14} /></button>}
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
                        {isCustomItem(id) && <button onClick={() => onRemoveItem(id)} className="ml-2 text-slate-400 hover:text-red-500 transition-colors"><X size={14} /></button>}
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

      {/* Yearly summary */}
      {(totals.monthly > 0 || totals.once > 0) && (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl mb-4 text-white overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <span className="font-bold" style={{fontSize:13}}>GESAMTÜBERSICHT</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <div className="text-sm text-slate-300">Kosten im ersten Jahr</div>
                <div className="text-xs text-slate-400">(monatlich × Laufzeit + einmalig)</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">€ {fmt(totals.periodTotal)} netto</div>
                <div className="font-bold text-lg text-red-400">€ {fmt(totals.periodTotal * 1.2)} brutto</div>
              </div>
            </div>
            {totals.monthly > 0 && totals.once > 0 && (
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-slate-300">Kosten jedes weitere Jahr</div>
                  <div className="text-xs text-slate-400">(monatlich × Laufzeit)</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400">€ {fmt(totals.periodMonthly)} netto</div>
                  <div className="font-bold text-lg text-white">€ {fmt(totals.periodMonthly * 1.2)} brutto</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Financing options */}
      {(totals.monthly > 0 || totals.once > 0) && (
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════

const TABS = [
  { id: 'kassa', label: 'Kassa' },
  { id: 'module', label: 'Module' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'angebot', label: 'Angebot' },
  { id: 'angebote', label: 'Angebote' },
];

const STATUS_CONFIG = {
  draft:     { label: 'Entwurf',    color: 'bg-slate-100 text-slate-600' },
  sent:      { label: 'Gesendet',   color: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Zugestellt', color: 'bg-green-100 text-green-700' },
  opened:    { label: 'Gelesen',    color: 'bg-yellow-100 text-yellow-700' },
  accepted:  { label: 'Angenommen', color: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: 'Abgelehnt', color: 'bg-red-100 text-red-700' },
  expired:   { label: 'Abgelaufen', color: 'bg-slate-100 text-slate-400' },
  bounced:   { label: 'Unzustellbar', color: 'bg-red-100 text-red-700' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cfg.color}`} style={{fontSize:11}}>
      {cfg.label}
    </span>
  );
}

const STAGE_CONFIG = {
  new:        { label: 'Neu',                color: 'bg-slate-100 text-slate-600' },
  offer_sent: { label: 'Angebot gesendet',  color: 'bg-blue-100 text-blue-700' },
  closed:     { label: 'Abgeschlossen',     color: 'bg-emerald-100 text-emerald-700' },
  lost:       { label: 'Verloren',           color: 'bg-red-100 text-red-700' },
};

function StageBadge({ stage }) {
  const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.new;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cfg.color}`} style={{fontSize:11}}>
      {cfg.label}
    </span>
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

  const filteredOffers = stageFilter === 'all' ? offers : offers.filter(o => o.stage === stageFilter);
  const stageCounts = { all: offers.length };
  for (const s of ['new', 'offer_sent', 'closed', 'lost']) {
    stageCounts[s] = offers.filter(o => o.stage === s).length;
  }
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
        <div className="flex items-center gap-2">
          <Archive size={16} className="text-red-600" />
          <span className="font-bold text-slate-700" style={{fontSize:14}}>Gespeicherte Angebote</span>
          <span className="text-slate-400" style={{fontSize:12}}>({offers.length})</span>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOffers} className="rounded-lg bg-slate-100 text-slate-600 px-3 py-1.5 hover:bg-slate-200 transition-colors flex items-center gap-1" style={{fontSize:12}}>
            <RefreshCw size={13} /> Aktualisieren
          </button>
          <button onClick={onNew} className="rounded-lg bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 transition-colors flex items-center gap-1" style={{fontSize:12}}>
            <Plus size={13} /> Neues Angebot
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

  const { profile } = useAuth();
  const [tab, setTab] = useState('kassa');
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
  const [currentOfferId, setCurrentOfferId] = useState(null);
  const [shareCode, setShareCodeState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
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
        setCurrentOfferId(offer.id);
        setShareCodeState(offer.share_code);
        setTab('angebot');
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
      setTab('angebot');
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

  // Tier period multipliers
  const TIER_MONTHS = { '12mo': 12, '6mo': 6, '2mo': 2, 'event': 1 };

  // Totals
  const totals = useMemo(() => {
    let monthly = 0, once = 0, periodTotal = 0, periodMonthly = 0, maxMonths = 0;
    Object.entries(cart).forEach(([id, c]) => {
      const item = ALL[id];
      if (!item) return;
      const p = price(item, c.tier, c.mode);
      const dp = discountedPrice(item, c.tier, c.mode);
      if (p === null) return;
      const fullQty = c.qty || 0;
      const discQty = c.discountQty || 0;
      const line = (p * fullQty) + (dp * discQty);
      if (isMonthly(item, c.mode)) {
        monthly += line;
        const months = TIER_MONTHS[c.tier] || 12;
        periodMonthly += line * months;
        periodTotal += line * months;
        if (months > maxMonths) maxMonths = months;
      } else {
        once += line;
        periodTotal += line;
      }
    });
    return { monthly, once, periodTotal, periodMonthly, maxMonths: maxMonths || 12 };
  }, [cart]);

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

      // Find creator info
      const creatorInfo = TEAM.find(t => t.id === creator) || null;

      // Generate PDF blob
      const pdfBlob = await pdf(
        <OfferPdfDocument
          customer={customer}
          monthlyItems={monthlyItems}
          onceItems={onceItems}
          totals={totals}
          notes={notes}
          raten={raten}
          showFinancing={finanzOpen}
          creator={creatorInfo}
          mandatsRef={mandatsRef}
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

  async function handleSend() {
    if (!supabase) { alert('Supabase nicht konfiguriert'); return; }
    if (!customer.email) { alert('Bitte eine Kunden-E-Mail angeben.'); return; }
    if (!creator) { alert('Bitte einen Ersteller auswählen.'); return; }

    if (!confirm(`Angebot an ${customer.email} senden?`)) return;

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

      const pdfBlob = await pdf(
        <OfferPdfDocument
          customer={customer} monthlyItems={monthlyItems} onceItems={onceItems}
          totals={totals} notes={notes} raten={raten}
          showFinancing={finanzOpen} creator={creatorInfo}
          mandatsRef={mandatsRef}
        />
      ).toBlob();

      // Convert to base64
      const buffer = await pdfBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const customerName = (customer.company || customer.name || 'Kunde')
        .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_').substring(0, 30);
      const filename = `KITZ_Angebot_${customerName}_${dateStr}.pdf`;

      await sendOffer(offerId, base64, filename);
      try { await updateOfferStage(offerId, 'offer_sent'); } catch {}
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

    // Generate signed PDF
    const pdfBlob = await pdf(
      <OfferPdfDocument
        customer={customer} monthlyItems={monthlyItems} onceItems={onceItems}
        totals={totals} notes={notes} raten={raten}
        showFinancing={finanzOpen} creator={creatorInfo}
        mandatsRef={mandatsRef} signatures={signatures}
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
      setCurrentOfferId(duplicate ? null : offer.id);
      setShareCodeState(duplicate ? null : offer.share_code || null);
      setTab('angebot');
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
    setTab('kassa');
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
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",minHeight:'100vh',background:'#f1f5f9',display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div className="no-print" style={{background:'linear-gradient(135deg,#32373c 0%,#23272b 100%)',padding:'16px 20px',color:'white'}}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center bg-white text-red-600 font-bold rounded-lg" style={{width:40,height:40,fontSize:14}}>KITZ</div>
            <div>
              <div className="font-bold" style={{fontSize:16,letterSpacing:'-0.3px'}}>Angebotsersteller</div>
              <div style={{fontSize:11,opacity:0.6}}>bessa Kassa & Module <span style={{opacity:0.5}}>v{__GIT_HASH__}</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cartCount > 0 && (
              <button onClick={handleReset} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20 transition-colors" style={{fontSize:12}}>
                <Trash2 size={13} /> Neu
              </button>
            )}
          </div>
        </div>

        {/* Global tier selector */}
        {tab !== 'angebot' && (
          <div className="flex gap-1.5 mt-3">
            {TIERS.map(t => (
              <button key={t} onClick={() => setGlobalTier(t)}
                className={`rounded-lg font-medium transition-all ${globalTier===t ? 'bg-red-500 text-white shadow-lg' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                style={{fontSize:12,padding:'6px 12px',flex:1}}>
                {TIER_SHORT[t]}
              </button>
            ))}
          </div>
        )}

        {/* Search box */}
        {tab !== 'angebot' && (
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Produkt suchen..."
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 pl-9 pr-8 py-2 text-sm focus:outline-none focus:bg-white/20 focus:border-white/30"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                <X size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex bg-white border-b border-slate-200 shadow-sm no-print" style={{position:'sticky',top:0,zIndex:20}}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 font-semibold transition-colors relative ${tab===t.id ? 'text-red-600' : 'text-slate-400 hover:text-slate-600'}`}
            style={{fontSize:13}}>
            <span>{t.label}</span>
            {t.id === 'angebot' && cartCount > 0 && (
              <span className="absolute top-1.5 bg-red-600 text-white rounded-full" style={{fontSize:10,padding:'0 5px',lineHeight:'16px',right:'calc(50% - 36px)'}}>{cartCount}</span>
            )}
            {tab===t.id && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-red-600 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{padding:'16px 16px calc(120px + env(safe-area-inset-bottom, 0px))'}}>
        {search.trim() && tab !== 'angebot' ? (
          // Search results
          (() => {
            const q = search.toLowerCase().trim();
            const allItems = [...KASSA, ...MODULE, ...HARDWARE, ...KUECHENMONITORE, ...KUECHENMONITORE_SUNMI, ...ORDERMAN, ...DIENSTLEISTUNGEN];
            const results = allItems.filter(item =>
              item.name.toLowerCase().includes(q) ||
              (item.code && item.code.toLowerCase().includes(q)) ||
              (item.note && item.note.toLowerCase().includes(q))
            );
            return (
              <div>
                <div className="text-sm text-slate-500 mb-3">{results.length} Ergebnis{results.length !== 1 ? 'se' : ''} für "{search}"</div>
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
            {tab === 'kassa' && <TabContent items={KASSA} cart={cart} globalTier={globalTier} handlers={handlers} />}
            {tab === 'module' && <TabContent items={MODULE} cart={cart} globalTier={globalTier} handlers={handlers} />}
            {tab === 'hardware' && (
              <>
                <CatGroup title="Hardware" items={HARDWARE} cart={cart} globalTier={globalTier} handlers={handlers} />
                <CatGroup title="Drucker" items={DRUCKER} cart={cart} globalTier={globalTier} handlers={handlers} />
                <CatGroup title="Küchenmonitore" items={KUECHENMONITORE} cart={cart} globalTier={globalTier} handlers={handlers} />
                <CatGroup title="Küchenmonitore Sunmi" items={KUECHENMONITORE_SUNMI} cart={cart} globalTier={globalTier} handlers={handlers} />
                <CatGroup title="Orderman" items={ORDERMAN} cart={cart} globalTier={globalTier} handlers={handlers} />
                <CatGroup title="Dienstleistungen" items={DIENSTLEISTUNGEN} cart={cart} globalTier={globalTier} handlers={handlers} />
              </>
            )}
            {tab === 'angebot' && (
              <>
                <OfferView cart={cart} customer={customer} setCustomer={setCustomer} creator={creator} setCreator={setCreator} notes={notes} setNotes={setNotes}
                  totals={totals} onPrint={handlePrint} onCopy={handleCopy} copied={copied} onCopyLink={handleCopyLink} linkCopied={linkCopied} raten={raten} setRaten={setRaten} pdfLoading={pdfLoading} finanzOpen={finanzOpen} setFinanzOpen={setFinanzOpen} globalTier={globalTier}
                  onSave={handleSave} onSend={handleSend} saving={saving} sending={sending} saveSuccess={saveSuccess} currentOfferId={currentOfferId}
                  onSign={() => setShowSignModal(true)} onAddCustom={() => setShowCustomModal(true)}
                  cartOrder={cartOrder} onReorder={setCartOrder} onRemoveItem={handlers.onRemove} />
                {showCustomModal && (
                  <CustomItemModal onConfirm={handleAddCustomItem} onClose={() => setShowCustomModal(false)} />
                )}
                {showSignModal && (
                  <SignModal customer={customer} totals={totals} finanzOpen={finanzOpen} globalTier={globalTier}
                    onConfirm={handleSign} onClose={() => setShowSignModal(false)} />
                )}
              </>
            )}
            {tab === 'angebote' && (
              <OfferList onLoad={handleLoadOffer} onNew={handleNewOffer} />
            )}
          </>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-200 shadow-2xl no-print" style={{padding:'12px 20px',paddingBottom:'calc(12px + env(safe-area-inset-bottom, 0px))',zIndex:30}}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1 text-slate-400" style={{fontSize:11}}>
              <ShoppingCart size={13} />
              <span>{cartCount} {cartCount === 1 ? 'Position' : 'Positionen'}</span>
            </div>
            <div className="flex gap-4 mt-0.5">
              {totals.monthly > 0 && <span className="font-bold text-slate-800" style={{fontSize:14}}>€ {fmt(totals.monthly)}<span className="font-normal text-slate-400" style={{fontSize:11}}>/Mo</span></span>}
              {totals.once > 0 && <span className="font-bold text-slate-800" style={{fontSize:14}}>€ {fmt(totals.once)}<span className="font-normal text-slate-400" style={{fontSize:11}}> einm.</span></span>}
              {totals.monthly === 0 && totals.once === 0 && <span className="text-slate-400" style={{fontSize:13}}>Noch keine Auswahl</span>}
            </div>
          </div>
          <button onClick={() => { setTab('angebot'); }}
            className="flex items-center gap-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 active:scale-[0.97] transition-all shadow-lg shadow-red-200"
            style={{padding:'10px 20px',fontSize:14}}>
            <FileText size={16} />
            Angebot
          </button>
        </div>
      </div>
    </div>
  );
}
