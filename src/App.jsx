import { useState, useMemo, useEffect } from "react";
import { Plus, Minus, X, Download, ShoppingCart, ChevronDown, User, FileText, Trash2, Copy, Check, Search, Loader2, Link } from "lucide-react";
import { pdf } from '@react-pdf/renderer';
import OfferPdfDocument from './pdf/OfferPdfDocument';
import { getOfferFromURL, generateShareableURL } from './lib/urlState';

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
  { id:'k100', code:'100', name:'Mobile Kassa', cat:'Mobil', p:{y:19,s:25,m:30,e:38}, t:'m' },
  { id:'k109', code:'109', name:'bessa Mobil', cat:'Mobil', p:{y:119}, t:'m', note:'-50 € je weitere Filiale' },
  { id:'k110', code:'110', name:'Kleiner Handelsbetrieb', cat:'Handel', p:{y:24,s:30,m:40,e:48}, t:'m' },
  { id:'k111', code:'111', name:'Großer Handelsbetrieb', cat:'Handel', p:{y:42,s:55,m:70,e:84}, t:'m' },
  { id:'k115', code:'115', name:'Web Kassa / Auftragsverwaltung', cat:'Handel', p:{y:19,s:25,m:30}, t:'m' },
  { id:'k119', code:'119', name:'bessa Handelsbetrieb', cat:'Handel', p:{y:160}, t:'m', note:'-50 € je weitere Filiale' },
  { id:'k120', code:'120', name:'Kleiner Gastrobetrieb', cat:'Gastro', p:{y:45,s:55,m:70,e:90}, t:'m' },
  { id:'k121', code:'121', name:'Großer Gastrobetrieb', cat:'Gastro', p:{y:62,s:80,m:100,e:124}, t:'m' },
  { id:'k129', code:'129', name:'bessa Gastrobetrieb', cat:'Gastro', p:{y:240}, t:'m', note:'-50 € je weitere Filiale' },
  { id:'k020', code:'020', name:'Zusätzlicher Bediener', cat:'Einzelfunktionen', p:{y:3,s:4,m:5,e:6}, t:'m' },
  { id:'k021', code:'021', name:'Kundenverwaltung', cat:'Einzelfunktionen', p:{y:10,s:12,m:16,e:20}, t:'m' },
  { id:'k022', code:'022', name:'Lagerverwaltung', cat:'Einzelfunktionen', p:{y:15,s:18,m:20,e:30}, t:'m' },
  { id:'k023', code:'023', name:'Lokale Gutscheinverwaltung', cat:'Einzelfunktionen', p:{y:10,s:12,m:16,e:20}, t:'m' },
  { id:'k024', code:'024', name:'Erweitertes Berichtswesen', cat:'Einzelfunktionen', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'k030', code:'030', name:'bessa Signieren', cat:'Einzelfunktionen', p:{y:9,s:11,m:25,e:50}, t:'m', note:'derzeit nur DE' },
  { id:'k040a', code:'040a', name:'Anbindung bessa Zahlen (Kartenzahlung)', cat:'Externe Systeme', p:{y:0,s:0,m:0,e:0}, t:'m' },
  { id:'k040', code:'040', name:'Anbindung Kartenzahlungsterminal', cat:'Externe Systeme', p:{y:12,s:15,m:18,e:24}, t:'m' },
  { id:'k041', code:'041', name:'Anbindung Barzahlungsterminal', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'k042', code:'042', name:'Nebenterminal', cat:'Externe Systeme', p:{y:14,s:16,m:18,e:28}, t:'m' },
  { id:'k043', code:'043', name:'Bestellmonitor', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'k044', code:'044', name:'Anbindung Schankanlage', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'k049', code:'049', name:'Öffentliche Schnittstelle', cat:'Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'k060', code:'060', name:'Entwurf Rechnungsvorlage', cat:'Sonstige Leistungen', p:{o:499}, t:'o' },
  { id:'k061', code:'061', name:'Anpassung Kassendesign', cat:'Sonstige Leistungen', p:{o:999}, t:'o' },
  { id:'k090', code:'090', name:'Fiskalisierung durch Techniker', cat:'Sonstige Leistungen', p:{y:10}, t:'m', note:'pro Kassa/Monat' },
  { id:'k091', code:'091', name:'Neufiskalisierung', cat:'Sonstige Leistungen', p:{o:90}, t:'o' },
  { id:'k095', code:'095', name:'Support-Paket 5h', cat:'Sonstige Leistungen', p:{o:750}, t:'o' },
  { id:'k099', code:'099', name:'Techniker', cat:'Sonstige Leistungen', p:{o:180}, t:'h', note:'pro Stunde' },
];

const MODULE = [
  { id:'m300', code:'300', name:'App (pro Filiale)', cat:'Pakete', p:{y:109}, t:'m', note:'50% Rabatt je weitere Filiale' },
  { id:'m310', code:'310', name:'Handel (pro Filiale)', cat:'Pakete', p:{y:139}, t:'m', note:'-50 € je weitere Filiale' },
  { id:'m320', code:'320', name:'Gastro (pro Filiale)', cat:'Pakete', p:{y:199}, t:'m', note:'-50 € je weitere Filiale' },
  { id:'m200', code:'200', name:'Web-Bestellungen', cat:'Einzelfunktionen', p:{y:39,s:49}, t:'m' },
  { id:'m201', code:'201', name:'Kundenbindung Kundenkarte', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'m202', code:'202', name:'Lieferservice-Bestellungen', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'m203', code:'203', name:'Gastro-Kiosk-Bestellungen', cat:'Einzelfunktionen', p:{y:99,s:125}, t:'m', note:'50% je weiterer Kiosk' },
  { id:'m204', code:'204', name:'Tisch-Tablet-Bestellungen', cat:'Einzelfunktionen', p:{y:9,s:12}, t:'m' },
  { id:'m205', code:'205', name:'Schank-Bestellungen', cat:'Einzelfunktionen', p:{y:99,s:125}, t:'m', note:'50% je weitere Schank' },
  { id:'m206', code:'206', name:'Kantinen-Bestellungen', cat:'Einzelfunktionen', p:{y:99}, t:'m', note:'50% für öffentl. Einr.' },
  { id:'m207', code:'207', name:'Online Gutscheinverwaltung', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'m208', code:'208', name:'Gutscheine Shopify/WooCommerce', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'m209', code:'209', name:'Gastrotouch Kennzahlen', cat:'Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'m250', code:'250', name:'Design-Paket Web/Kiosk/Kantine', cat:'Sonstige Leistungen', p:{o:499}, t:'o' },
  { id:'m295', code:'295', name:'Support-Paket 5h (Module)', cat:'Sonstige Leistungen', p:{o:750}, t:'o' },
  { id:'m299', code:'299', name:'Techniker (Module)', cat:'Sonstige Leistungen', p:{o:180}, t:'h', note:'pro Stunde' },
];

const TERMINALS = [
  { id:'t400', code:'400', name:'SoftPos In-App Terminal (NFC)', cat:'Terminals', rent:0, buy:null, t:'term' },
  { id:'t401', code:'401', name:'Bluetooth Terminal', cat:'Terminals', rent:8, buy:79, t:'term' },
  { id:'t402', code:'402', name:'WiFi Terminal 5"', cat:'Terminals', rent:25, buy:299, t:'term', note:'keine GiroCard' },
  { id:'t403', code:'403', name:'WiFi Terminal 5.5"', cat:'Terminals', rent:39, buy:399, t:'term' },
];

const HARDWARE = [
  { id:'h1', name:'Sunmi D3 Pro', price:1024, t:'o' },
  { id:'h3', name:'Sunmi D3 Mini', price:790, t:'o' },
  { id:'h10', name:'D3 Garantieverlängerung', price:190, t:'o', info:'auf 48 Monate' },
  { id:'h2', name:'Sunmi V3H', price:649, t:'o' },
  { id:'h4', name:'Sunmi L3H', price:599, t:'o' },
  { id:'h11', name:'V3H/L3H Garantieverlängerung', price:190, t:'o', info:'auf 48 Monate' },
  { id:'h12', name:'Hobex ViA PRO', price:1149, t:'o' },
  { id:'h6', name:'Caregold Garantieerweiterung', price:270, t:'o' },
  { id:'h9', name:'Epson TMT20 Bondrucker', price:220, t:'o' },
];

const DIENSTLEISTUNGEN = [
  { id:'h7', name:'Fiskalisierung', price:190, t:'o' },
  { id:'h8', name:'Arbeitszeit', price:118, t:'o', info:'pro Stunde' },
];

const ORDERMAN = [
  { id:'o1', name:'Orderman 10', price:900, t:'o' },
  { id:'o2', name:'Orderman Garantieverlängerung', price:270, t:'o', info:'auf 48 Monate' },
  { id:'o3', name:'Orderman Ladestation inkl. Netzteil', price:210, t:'o' },
  { id:'o4', name:'Orderman Ersatzbatterie', price:60, t:'o' },
  { id:'o5', name:'Orderman Gürteltasche', price:25, t:'o' },
  { id:'o6', name:'Orderman Safety-Cord', price:14, t:'o' },
];

// Build lookup
const ALL = {};
[...KASSA,...MODULE,...TERMINALS,...HARDWARE,...ORDERMAN,...DIENSTLEISTUNGEN].forEach(i => ALL[i.id] = i);

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

function isMonthly(item, mode) {
  if (item.t === 'term') return mode === 'rent';
  return item.t === 'm';
}

function groupBy(items, key) {
  const g = {};
  items.forEach(i => { const k = i[key] || 'Sonstige'; (g[k] = g[k]||[]).push(i); });
  return g;
}

// ═══════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════

function ItemCard({ item, cartItem, globalTier, onAdd, onRemove, onQty, onTier, onMode }) {
  const inCart = !!cartItem;
  const tier = cartItem?.tier || bestTier(item, globalTier);
  const mode = cartItem?.mode || 'rent';
  const p = price(item, tier, mode);
  const av = availableTiers(item);
  const monthly = isMonthly(item, mode);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => onQty(item.id,-1)}
                className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
                style={{width:32,height:32}}>
                <Minus size={14} />
              </button>
              <span className="font-bold text-slate-800 text-center" style={{width:28,fontSize:14}}>{cartItem.qty}</span>
              <button onClick={() => onQty(item.id,1)}
                className="rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-transform"
                style={{width:32,height:32}}>
                <Plus size={14} />
              </button>
              {item.t === 'h' && <span className="text-slate-400 ml-1" style={{fontSize:11}}>Stunden</span>}
            </div>
            <span className="font-bold text-red-700" style={{fontSize:14}}>
              € {fmt(p * cartItem.qty)}{monthly ? '/Mo' : ''}
            </span>
          </div>
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
// OFFER / ANGEBOT VIEW
// ═══════════════════════════════════════════════════════

function OfferView({ cart, customer, setCustomer, notes, setNotes, totals, onPrint, onCopy, copied, onCopyLink, linkCopied, raten, setRaten, pdfLoading, finanzOpen, setFinanzOpen, globalTier }) {
  const monthlyItems = Object.entries(cart).filter(([id,c]) => isMonthly(ALL[id], c.mode));
  const onceItems = Object.entries(cart).filter(([id,c]) => !isMonthly(ALL[id], c.mode));

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
      </div>

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
          <div className="divide-y divide-slate-100">
            {monthlyItems.map(([id, c]) => {
              const item = ALL[id];
              const p = price(item, c.tier, c.mode);
              return (
                <div key={id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">{c.qty}x {item.code ? item.code+' ' : ''}{item.name}</span>
                    {c.tier && <span className="text-xs text-slate-400 ml-2">{TIER_LABEL[c.tier]}</span>}
                    {c.mode === 'rent' && item.t === 'term' && <span className="text-xs text-slate-400 ml-2">Miete</span>}
                  </div>
                  <span className="font-semibold text-slate-800 text-sm">€ {fmt(p * c.qty)}/Mo</span>
                </div>
              );
            })}
          </div>
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
          <div className="divide-y divide-slate-100">
            {onceItems.map(([id, c]) => {
              const item = ALL[id];
              const p = price(item, c.tier, c.mode);
              return (
                <div key={id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">{c.qty}x {item.code ? item.code+' ' : ''}{item.name}</span>
                    {c.mode === 'buy' && <span className="text-xs text-slate-400 ml-2">Kauf</span>}
                    {item.t === 'h' && <span className="text-xs text-slate-400 ml-2">({c.qty} Std.)</span>}
                  </div>
                  <span className="font-semibold text-slate-800 text-sm">€ {fmt(p * c.qty)}</span>
                </div>
              );
            })}
          </div>
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
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-slate-300">Vertragslaufzeit gesamt</div>
                <div className="text-xs text-slate-400">(monatlich × Laufzeit + einmalig)</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">€ {fmt(totals.periodTotal)} netto</div>
                <div className="font-bold text-lg text-red-400">€ {fmt(totals.periodTotal * 1.2)} brutto</div>
              </div>
            </div>
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
        <div className="flex gap-2 no-print flex-wrap">
          <button onClick={onCopyLink}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 active:scale-[0.98] transition-all"
            style={{fontSize:14, minWidth:'120px'}}>
            {linkCopied ? <Check size={18} /> : <Link size={18} />}
            {linkCopied ? 'Link kopiert!' : 'Link kopieren'}
          </button>
          <button onClick={onCopy}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3.5 hover:bg-slate-200 active:scale-[0.98] transition-all"
            style={{fontSize:14, minWidth:'120px'}}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Kopiert!' : 'Text kopieren'}
          </button>
          <button onClick={onPrint} disabled={pdfLoading}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white font-semibold py-3.5 hover:bg-red-700 active:scale-[0.98] transition-all shadow-lg shadow-red-200 ${pdfLoading ? 'opacity-70 cursor-wait' : ''}`}
            style={{fontSize:14, minWidth:'140px'}}>
            {pdfLoading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            {pdfLoading ? 'PDF wird erstellt...' : 'PDF herunterladen'}
          </button>
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
];

export default function App() {
  const [tab, setTab] = useState('kassa');
  const [globalTier, setGlobalTier] = useState('12mo');
  const [cart, setCart] = useState({});
  const [customer, setCustomer] = useState({ name:'', company:'', email:'', phone:'' });
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [raten, setRaten] = useState(12);
  const [search, setSearch] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [finanzOpen, setFinanzOpen] = useState(false);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch(e){} };
  }, []);

  // Load offer from URL on mount
  useEffect(() => {
    const savedOffer = getOfferFromURL();
    if (savedOffer) {
      setCart(savedOffer.cart || {});
      setCustomer(savedOffer.customer || { name:'', company:'', email:'', phone:'' });
      setNotes(savedOffer.notes || '');
      setRaten(savedOffer.raten || 12);
      setFinanzOpen(savedOffer.finanzOpen || false);
      setGlobalTier(savedOffer.globalTier || '12mo');
      // Switch to offer tab when loading from URL
      setTab('angebot');
    }
  }, []);

  // Cart handlers
  const handlers = {
    onAdd: (id, tier, mode) => setCart(c => ({...c, [id]: { qty:1, tier, mode }})),
    onRemove: (id) => setCart(c => { const n = {...c}; delete n[id]; return n; }),
    onQty: (id, d) => setCart(c => {
      const cur = c[id];
      if (!cur) return c;
      const nq = cur.qty + d;
      if (nq < 1) { const n = {...c}; delete n[id]; return n; }
      return {...c, [id]: {...cur, qty: nq}};
    }),
    onTier: (id, tier) => setCart(c => c[id] ? {...c, [id]: {...c[id], tier}} : c),
    onMode: (id, mode) => setCart(c => c[id] ? {...c, [id]: {...c[id], mode}} : c),
  };

  // Tier period multipliers
  const TIER_MONTHS = { '12mo': 12, '6mo': 6, '2mo': 2, 'event': 1 };

  // Totals
  const totals = useMemo(() => {
    let monthly = 0, once = 0, periodTotal = 0, maxMonths = 0;
    Object.entries(cart).forEach(([id, c]) => {
      const item = ALL[id];
      const p = price(item, c.tier, c.mode);
      if (p === null) return;
      const line = p * c.qty;
      if (isMonthly(item, c.mode)) {
        monthly += line;
        const months = TIER_MONTHS[c.tier] || 12;
        periodTotal += line * months;
        if (months > maxMonths) maxMonths = months;
      } else {
        once += line;
        periodTotal += line;
      }
    });
    return { monthly, once, periodTotal, maxMonths: maxMonths || 12 };
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

    const monthlyItems = Object.entries(cart).filter(([id,c]) => isMonthly(ALL[id],c.mode));
    const onceItems = Object.entries(cart).filter(([id,c]) => !isMonthly(ALL[id],c.mode));

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
      const monthlyItems = Object.entries(cart)
        .filter(([id, c]) => isMonthly(ALL[id], c.mode))
        .map(([id, c]) => {
          const item = ALL[id];
          const p = price(item, c.tier, c.mode);
          return {
            id,
            qty: c.qty,
            code: item.code || '',
            name: item.name,
            tier: c.tier,
            mode: c.mode,
            type: item.t,
            lineTotal: p * c.qty,
          };
        });

      const onceItems = Object.entries(cart)
        .filter(([id, c]) => !isMonthly(ALL[id], c.mode))
        .map(([id, c]) => {
          const item = ALL[id];
          const p = price(item, c.tier, c.mode);
          return {
            id,
            qty: c.qty,
            code: item.code || '',
            name: item.name,
            tier: c.tier,
            mode: c.mode,
            type: item.t,
            lineTotal: p * c.qty,
          };
        });

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

  function handleCopyLink() {
    const state = {
      cart,
      customer,
      notes,
      raten,
      finanzOpen,
      globalTier,
    };
    const url = generateShareableURL(state);
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function handleReset() {
    if (confirm('Angebot zurücksetzen?')) {
      setCart({});
      setCustomer({name:'',company:'',email:'',phone:''});
      setNotes('');
      setRaten(12);
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
              <div style={{fontSize:11,opacity:0.6}}>bessa Kassa & Module</div>
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
            const allItems = [...KASSA, ...MODULE, ...HARDWARE, ...ORDERMAN, ...TERMINALS, ...DIENSTLEISTUNGEN];
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
                <CatGroup title="Orderman" items={ORDERMAN} cart={cart} globalTier={globalTier} handlers={handlers} />
                <CatGroup title="Dienstleistungen" items={DIENSTLEISTUNGEN} cart={cart} globalTier={globalTier} handlers={handlers} />
                <CatGroup title="bessa Zahlen Terminals" items={TERMINALS} cart={cart} globalTier={globalTier} handlers={handlers} />
              </>
            )}
            {tab === 'angebot' && (
              <OfferView cart={cart} customer={customer} setCustomer={setCustomer} notes={notes} setNotes={setNotes}
                totals={totals} onPrint={handlePrint} onCopy={handleCopy} copied={copied} onCopyLink={handleCopyLink} linkCopied={linkCopied} raten={raten} setRaten={setRaten} pdfLoading={pdfLoading} finanzOpen={finanzOpen} setFinanzOpen={setFinanzOpen} globalTier={globalTier} />
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
