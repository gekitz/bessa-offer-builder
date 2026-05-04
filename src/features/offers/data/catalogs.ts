import type { Item, Catalog } from '../../../lib/pricing';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  location: string;
}

export const COMPANY_DEFAULT = {
  name: 'KITZ Computer + Office GmbH',
  address1: 'Rosentaler Straße 1, A-9020 Klagenfurt',
  address2: 'Johann-Offner-Straße 17, A-9400 Wolfsberg',
  phone1: '+43 (0) 463 504454',
  phone2: '+43 (0) 4352 4176',
  email: 'officekl@kitz.co.at',
  website: 'www.kitz.co.at',
  logo: 'https://www.kitz.co.at/wp-content/uploads/2019/12/kitz-logo-2020-300x138.png',
} as const;

export const BESSA: Item[] = [
  // Kassa
  { id:'3942f638-1abb-4be9-85a5-d3bf442aa3d8', code:'100', name:'Mobile Kassa', cat:'Kassa – Mobil', p:{y:19,s:25,m:30,e:38}, t:'m' },
  { id:'c4aca644-5fb4-46cf-9fea-8ddc1bee8c30', code:'109', name:'bessa Mobil', cat:'Kassa – Mobil', p:{y:119}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'cb003c42-11dc-48c9-a5de-68a2c998501a', code:'110', name:'Kleiner Handelsbetrieb', cat:'Kassa – Handel', p:{y:24,s:30,m:40,e:48}, t:'m' },
  { id:'4d6ee0aa-32ad-480a-aa2f-4d1ddf620b12', code:'111', name:'Großer Handelsbetrieb', cat:'Kassa – Handel', p:{y:42,s:55,m:70,e:84}, t:'m' },
  { id:'6fa5da94-d90b-41a1-ab17-f515d172b940', code:'115', name:'Web Kassa / Auftragsverwaltung', cat:'Kassa – Handel', p:{y:19,s:25,m:30}, t:'m' },
  { id:'1dfe4874-04a7-47e9-9230-e1696b6e8901', code:'119', name:'bessa Handelsbetrieb', cat:'Kassa – Handel', p:{y:160}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'a4e9ba39-ee22-41b9-8f94-936ee3ce3de3', code:'120', name:'Kleiner Gastrobetrieb', cat:'Kassa – Gastro', p:{y:45,s:55,m:70,e:90}, t:'m' },
  { id:'95cd9f0f-ec0d-46eb-aaa6-330a8ce129d4', code:'121', name:'Großer Gastrobetrieb', cat:'Kassa – Gastro', p:{y:62,s:80,m:100,e:124}, t:'m' },
  { id:'6f8ed70a-8388-40d6-8e9e-516f524cd3e5', code:'129', name:'bessa Gastrobetrieb', cat:'Kassa – Gastro', p:{y:240}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'40769d58-ebbb-40f8-b4b8-9a89da35a934', code:'020', name:'Zusätzlicher Bediener', cat:'Kassa – Einzelfunktionen', p:{y:3,s:4,m:5,e:6}, t:'m' },
  { id:'4bc73978-ee15-4858-8107-87d3faa210e2', code:'021', name:'Kundenverwaltung', cat:'Kassa – Einzelfunktionen', p:{y:10,s:12,m:16,e:20}, t:'m' },
  { id:'f7a4cb27-d3cf-4e84-ba58-a273da596c06', code:'022', name:'Lagerverwaltung', cat:'Kassa – Einzelfunktionen', p:{y:15,s:18,m:20,e:30}, t:'m', note:'+10h Arbeitszeit' },
  { id:'00c9aca1-e463-4c63-a5c2-9fd51d70010a', code:'023', name:'Lokale Gutscheinverwaltung', cat:'Kassa – Einzelfunktionen', p:{y:10,s:12,m:16,e:20}, t:'m' },
  { id:'3296ada4-f7f8-47a1-9cf5-a3dc64326f3a', code:'024', name:'Erweitertes Berichtswesen', cat:'Kassa – Einzelfunktionen', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'b2a3bb5a-370c-49d4-96e3-874b5df66c56', code:'030', name:'bessa Signieren', cat:'Kassa – Einzelfunktionen', p:{y:9,s:11,m:25,e:50}, t:'m', note:'derzeit nur DE' },
  { id:'14105277-c0ca-400f-9444-3ec9414fb279', code:'040a', name:'Anbindung bessa Zahlen (Kartenzahlung)', cat:'Kassa – Externe Systeme', p:{y:0,s:0,m:0,e:0}, t:'m' },
  { id:'65e7e1a8-23b3-444f-8b18-c5ca7312cf28', code:'040', name:'Anbindung Kartenzahlungsterminal', cat:'Kassa – Externe Systeme', p:{y:12,s:15,m:18,e:24}, t:'m' },
  { id:'117be9d9-f2b0-409d-9ec6-9497f943ff4f', code:'041', name:'Anbindung Barzahlungsterminal', cat:'Kassa – Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'eceb4278-06cc-4fe5-9413-d41ae999166c', code:'042', name:'Nebenterminal', cat:'Kassa – Externe Systeme', p:{y:14,s:16,m:18,e:28}, t:'m' },
  { id:'0824405f-8780-4371-919b-5cee2c6efb07', code:'043', name:'Bestellmonitor', cat:'Kassa – Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  { id:'ad5d1834-f864-43a1-8be4-2bae0bfeade4', code:'044', name:'Anbindung Schankanlage', cat:'Kassa – Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m', note:'+10h Arbeitszeit' },
  { id:'a336d467-a39f-4acd-8872-e7d185c45ea9', code:'049', name:'Öffentliche Schnittstelle', cat:'Kassa – Externe Systeme', p:{y:18,s:22,m:28,e:36}, t:'m' },
  // Module
  { id:'3ad3609d-c87a-485f-b96f-827e60c79e81', code:'300', name:'App (pro Filiale)', cat:'Module – Pakete', p:{y:109}, t:'m', note:'50% Rabatt je weitere Filiale', discount:{type:'percent',value:50,label:'Weitere Filiale'} },
  { id:'d3a94a99-982c-4969-aab8-9aed654ed0cb', code:'310', name:'Handel (pro Filiale)', cat:'Module – Pakete', p:{y:139}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'37551e30-8b3f-44cf-a126-702dfd2539ea', code:'320', name:'Gastro (pro Filiale)', cat:'Module – Pakete', p:{y:199}, t:'m', note:'-50 € je weitere Filiale', discount:{type:'fixed',value:50,label:'Weitere Filiale'} },
  { id:'bfa4ca0e-b5ed-4cd2-a1a7-12c02854082f', code:'200', name:'Web-Bestellungen', cat:'Module – Einzelfunktionen', p:{y:39,s:49}, t:'m' },
  { id:'48065ab3-b47f-46ae-a32e-2176ae41dd30', code:'201', name:'Kundenbindung Kundenkarte', cat:'Module – Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'35518df7-6eb3-4bd3-a21c-33e379d23271', code:'202', name:'Lieferservice-Bestellungen', cat:'Module – Einzelfunktionen', p:{y:39}, t:'m', info:'Lieferando, Foodora, Wolt and UberEATS' },
  { id:'d2c207cf-3c6f-41f6-a1df-739e8e48d4bb', code:'203', name:'Gastro-Kiosk-Bestellungen', cat:'Module – Einzelfunktionen', p:{y:99,s:125}, t:'m', note:'50% je weiterer Kiosk', discount:{type:'percent',value:50,label:'Weiterer Kiosk'} },
  { id:'d0c56974-678a-41b0-9924-e5353cc0891b', code:'204', name:'Tisch-Tablet-Bestellungen', cat:'Module – Einzelfunktionen', p:{y:9,s:12}, t:'m' },
  { id:'cdc84a4d-99b6-48c5-b414-c5be9daeff03', code:'205', name:'Schank-Bestellungen', cat:'Module – Einzelfunktionen', p:{y:99,s:125}, t:'m', note:'50% je weitere Schank', discount:{type:'percent',value:50,label:'Weitere Schank'} },
  { id:'ec32520e-cbba-4739-8cf0-fd8bb918ca55', code:'206', name:'Kantinen-Bestellungen', cat:'Module – Einzelfunktionen', p:{y:99}, t:'m', note:'50% für öffentl. Einr.' },
  { id:'01289762-3f01-486f-8ab8-d5aa9038996e', code:'207', name:'Online Gutscheinverwaltung', cat:'Module – Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'33da16d1-bbaf-40b1-bac4-9160ce593952', code:'208', name:'Gutscheine Shopify/WooCommerce', cat:'Module – Einzelfunktionen', p:{y:39}, t:'m' },
  { id:'f2d30dd5-e54f-426d-8ea5-20ccb6396b06', code:'209', name:'Gastrotouch Kennzahlen', cat:'Module – Einzelfunktionen', p:{y:39}, t:'m' },
];

// Melzer X3000 – UVP-Preisliste gültig ab 01.01.2026
// Einmaliger Softwarepreis + 30% Wartung pro Jahr (servicePercent). Pepper-Terminal-Varianten sind ausgelassen.
export const MELZER: Item[] = [
  // Arbeitsplätze (pro Platz/Gerät)
  { id:'mel-ap-kasse', name:'Kasse', cat:'Arbeitsplätze', price:990, t:'o', servicePercent:30 },
  { id:'mel-ap-kasse-light', name:'Kasse Light', cat:'Arbeitsplätze', price:690, t:'o', servicePercent:30, info:'Vollwertiger Kassenplatz, kein Büroplatz, keine Module, kein Ablöserabatt' },
  { id:'mel-ap-kasse-handel', name:'Kasse Handel', cat:'Arbeitsplätze', price:690, t:'o', servicePercent:30, info:'Automatisch SB-Modus, kein Bestellbon, kein grafischer Tischplan' },
  { id:'mel-ap-buero', name:'Büro', cat:'Arbeitsplätze', price:690, t:'o', servicePercent:30, info:'Boniersystem aufrufbar, bonieren möglich (kein Bestellbon)' },
  { id:'mel-ap-buero-light', name:'Büro Light', cat:'Arbeitsplätze', price:290, t:'o', servicePercent:30, info:'Pro Dongel ohne „Kasse" ist Büro Light notwendig' },
  { id:'mel-ap-kiosk', name:'Kiosk (Android)', cat:'Arbeitsplätze', price:790, t:'o', servicePercent:30 },
  { id:'mel-ap-mob-tablet', name:'MobileKasse Tablet (Android)', cat:'Arbeitsplätze', price:790, t:'o', servicePercent:30, info:'Cloud ohne Wartung: +19 €/Mo Lizenzgebühr' },
  { id:'mel-ap-mob-phone', name:'MobileKasse Smartphone / Tablet Hochformat', cat:'Arbeitsplätze', price:390, t:'o', servicePercent:30, info:'Cloud ohne Wartung: +19 €/Mo Lizenzgebühr' },
  { id:'mel-ap-bondisplay', name:'Bondisplay', cat:'Arbeitsplätze', price:590, t:'o', servicePercent:30 },
  { id:'mel-ap-abholdisplay', name:'Abholdisplay (Web)', cat:'Arbeitsplätze', price:290, t:'o', servicePercent:30 },

  // Interface Kreditkarten-Terminal (Direkt-Anschluss, pro Anschluss)
  { id:'mel-kk-kasse', name:'Kreditkarten-Terminal – Kasse', cat:'Interface Kreditkarten (Direkt)', price:390, t:'o', servicePercent:30, info:'pro Direkt-Anschluss' },
  { id:'mel-kk-kiosk', name:'Kreditkarten-Terminal – Kiosk', cat:'Interface Kreditkarten (Direkt)', price:390, t:'o', servicePercent:30, info:'pro Direkt-Anschluss' },
  { id:'mel-kk-mob-tablet', name:'Kreditkarten-Terminal – MobileKasse Tablet', cat:'Interface Kreditkarten (Direkt)', price:390, t:'o', servicePercent:30, info:'pro Direkt-Anschluss' },
  { id:'mel-kk-mob-phone', name:'Kreditkarten-Terminal – MobileKasse Smartphone/Hochformat', cat:'Interface Kreditkarten (Direkt)', price:190, t:'o', servicePercent:30, info:'pro Direkt-Anschluss' },

  // Interface Chipleser (pro Anschluss) – kostenpflichtig nur mit Stammdaten-Chipverwaltung
  { id:'mel-chip-kasse', name:'Chipleser – Kasse', cat:'Interface Chipleser', price:390, t:'o', servicePercent:30 },
  { id:'mel-chip-kiosk', name:'Chipleser – Kiosk', cat:'Interface Chipleser', price:390, t:'o', servicePercent:30 },
  { id:'mel-chip-mob-tablet', name:'Chipleser – MobileKasse Tablet', cat:'Interface Chipleser', price:390, t:'o', servicePercent:30 },
  { id:'mel-chip-mob-phone', name:'Chipleser – MobileKasse Smartphone/Hochformat', cat:'Interface Chipleser', price:190, t:'o', servicePercent:30 },

  // Diverse Interfaces zu externen Geräten
  { id:'mel-if-vision-checkout', name:'Vision Checkout', cat:'Interfaces externe Geräte', price:690, t:'o', servicePercent:30, info:'zusätzlich: Kassenplatz + Interface Kreditkarten und/oder Chipleser' },
  { id:'mel-if-waage', name:'Waage', cat:'Interfaces externe Geräte', price:390, t:'o', servicePercent:30 },
  { id:'mel-if-scanner', name:'Scanner mit Preis-/Grammberechnung', cat:'Interfaces externe Geräte', price:190, t:'o', servicePercent:30 },
  { id:'mel-if-cashdispenser', name:'Cashdispenser', cat:'Interfaces externe Geräte', price:690, t:'o', servicePercent:30 },
  { id:'mel-if-schankanlage', name:'Schankanlage', cat:'Interfaces externe Geräte', price:690, t:'o', servicePercent:30, info:'pro Dongel' },

  // Interne Module (pro Dongel)
  { id:'mel-int-rechnung-online', name:'Rechnung Online', cat:'Interne Module', price:490, t:'o', servicePercent:30, info:'Ohne Wartung: +19 €/Mo Lizenzgebühr' },
  { id:'mel-int-lieferschein', name:'Lieferschein + Sammelrechnung', cat:'Interne Module', price:390, t:'o', servicePercent:30 },
  { id:'mel-int-menuebestellung', name:'Menübestellung und -abruf', cat:'Interne Module', price:390, t:'o', servicePercent:30 },
  { id:'mel-int-gutschein', name:'Gutscheinverwaltung intern', cat:'Interne Module', price:690, t:'o', servicePercent:30 },
  { id:'mel-int-kassabuch', name:'Kassabuch', cat:'Interne Module', price:490, t:'o', servicePercent:30 },
  { id:'mel-int-tischreservierung', name:'Tischreservierung intern', cat:'Interne Module', price:490, t:'o', servicePercent:30 },
  { id:'mel-int-mixmatch', name:'Mix and Match', cat:'Interne Module', price:290, t:'o', servicePercent:30 },
  { id:'mel-int-filial-zentrale', name:'Filialverwaltung Zentrale', cat:'Interne Module', price:890, t:'o', servicePercent:30, info:'Zumindest ein kostenpflichtiger Büro- oder Kassenplatz zusätzlich notwendig' },
  { id:'mel-int-filial-filiale', name:'Filialverwaltung Filiale', cat:'Interne Module', price:490, t:'o', servicePercent:30 },
  { id:'mel-int-webreports', name:'WebReports', cat:'Interne Module', price:290, t:'o', servicePercent:30, info:'pro Dongel und User · Ohne Wartung: +19 €/Mo Lizenzgebühr' },

  // Interfaces zu Fremdsoftware (pro Dongel und Anbieter)
  { id:'mel-fs-gutschein-ext', name:'Gutscheinverwaltung extern', cat:'Interfaces Fremdsoftware', price:290, t:'o', servicePercent:30 },
  { id:'mel-fs-hotelsoftware', name:'Hotelsoftware pro Zimmer', cat:'Interfaces Fremdsoftware', price:25, t:'o', servicePercent:30, info:'Max. 60 Zimmer verrechnet, weitere Zimmer kostenlos' },
  { id:'mel-fs-fibu-wawi', name:'Fibu / Wawi', cat:'Interfaces Fremdsoftware', price:490, t:'o', servicePercent:30 },
  { id:'mel-fs-datev', name:'Datev Kassenarchiv online (D)', cat:'Interfaces Fremdsoftware', price:490, t:'o', servicePercent:30 },
  { id:'mel-fs-selford-ordering', name:'Selfordering – Ordering', cat:'Interfaces Fremdsoftware', price:290, t:'o', servicePercent:30 },
  { id:'mel-fs-selford-plattform', name:'Selfordering – Plattform (Lieferando …)', cat:'Interfaces Fremdsoftware', price:290, t:'o', servicePercent:30 },
  { id:'mel-fs-selford-payment', name:'Selfordering – Payment', cat:'Interfaces Fremdsoftware', price:290, t:'o', servicePercent:30 },
  { id:'mel-fs-selford-kiosk', name:'Selfordering – Kiosk', cat:'Interfaces Fremdsoftware', price:290, t:'o', servicePercent:30, info:'pro Kiosk' },
  { id:'mel-fs-bonus-ext', name:'Bonussystem extern', cat:'Interfaces Fremdsoftware', price:290, t:'o', servicePercent:30 },
  { id:'mel-fs-tisch-ext', name:'Tischreservierung extern', cat:'Interfaces Fremdsoftware', price:290, t:'o', servicePercent:30 },
  { id:'mel-fs-zutritt', name:'Zutrittsystem (HKS, TAC, N-TREE)', cat:'Interfaces Fremdsoftware', price:1200, t:'o', servicePercent:30, info:'Evt. Sonderprogrammierung separat verrechnet' },
  { id:'mel-fs-signieren', name:'Signieren BelegExtern pro Transfer.exe', cat:'Interfaces Fremdsoftware', price:890, t:'o', servicePercent:30, info:'Zumindest ein kostenpflichtiger Büro- oder Kassenplatz notwendig' },

  // Import (pro Dongel und Interface)
  { id:'mel-imp-artikel', name:'Artikel', cat:'Import', price:490, t:'o', servicePercent:30 },
  { id:'mel-imp-gaestekartei', name:'Gästekartei', cat:'Import', price:490, t:'o', servicePercent:30 },
  { id:'mel-imp-chipdetails', name:'Chipdetails', cat:'Import', price:490, t:'o', servicePercent:30 },

  // Lagerverwaltung (pro Dongel)
  { id:'mel-lag-basis', name:'Lager Basismodul', cat:'Lagerverwaltung', price:290, t:'o', servicePercent:30, info:'Stammdaten, Lieferanten, Inventur, Lagerzuordnung' },
  { id:'mel-lag-kontrolle', name:'Lager Kontrollmodul', cat:'Lagerverwaltung', price:290, t:'o', servicePercent:30, info:'Voraussetzung: Lager Basismodul' },
  { id:'mel-lag-bestellung', name:'Lager Bestellung / Einkauf', cat:'Lagerverwaltung', price:290, t:'o', servicePercent:30, info:'Voraussetzung: Basismodul + Kontrolle' },
  { id:'mel-lag-etiketten', name:'Etikettendruck', cat:'Lagerverwaltung', price:290, t:'o', servicePercent:30 },
  { id:'mel-lag-mobileinv', name:'MobileInventur', cat:'Lagerverwaltung', price:290, t:'o', servicePercent:30, info:'Voraussetzung: Basismodul + Kontrolle' },
  { id:'mel-lag-edi-import', name:'Import Lieferanten Lieferscheine (EDI 2.0)', cat:'Lagerverwaltung', price:290, t:'o', servicePercent:30, info:'Voraussetzung: Basismodul, Kontrolle, Bestellung/Einkauf' },

  // Dienstleistungen / Stundensätze
  { id:'mel-ds-dev', name:'Softwareentwicklung', cat:'Dienstleistungen', price:160, t:'h', info:'pro Stunde' },
  { id:'mel-ds-service', name:'Dienstleistung', cat:'Dienstleistungen', price:120, t:'h', info:'pro Stunde' },
  { id:'mel-ds-dongel', name:'Dongel', cat:'Dienstleistungen', price:25, t:'o', info:'EK pro Dongel' },
];

export const UNIFY: Item[] = [
  { id:'unify-dream-router-7', name:'Netzwerk - Dream Router 7', price:300, t:'o' },
  { id:'unify-cloud-gateway-max', name:'Netzwerk - Cloud Gateway Max', price:249, t:'o' },
  { id:'unify-lite-8-poe', name:'Netzwerk - Lite 8 PoE', price:139, t:'o' },
  { id:'unify-lite-16-poe', name:'Netzwerk - Lite 16 PoE', price:249, t:'o' },
  { id:'unify-u7-pro', name:'Netzwerk - U7 Pro', price:225, t:'o' },
  { id:'unify-u7-pro-outdoor', name:'Netzwerk - U7 Pro Outdoor', price:350, t:'o' },
];

export const RCH: Item[] = [
  { id:'rch-ape3', name:'RCH APE3', cat:'Kassensysteme', price:1390, t:'o', info:'Snapdragon OctaCore · 4 GB RAM · 64 GB ROM · 10" Display · Bondrucker integriert · Android 13 · Software: RCH Atos · 12 Monate Bring-In · zzgl. Installation und Einschulung' },
  { id:'rch-at15-iron-slim', name:'RCH AT15 IRON SLIM', cat:'Kassensysteme', price:1790, t:'o', info:'4 GB RAM · 32 GB Flash · 10" Display · inkl. Bondrucker · Android 10 · Software: RCH Atos · 12 Monate Bring-In · zzgl. Installation und Einschulung' },
  { id:'rch-walle-8t', name:'RCH WALLE 8T', cat:'Kassensysteme', price:990, t:'o', info:'1 GB RAM · 8 GB MMC · 8" Display · Bondrucker integriert · Android 5.0.2 oder höher · Software: RCH Atos · 12 Monate Bring-In · zzgl. Installation und Einschulung' },
];

export const HARDWARE: Item[] = [
  { id:'fdb37b6a-4ad5-4a46-ba8f-53e4a2154ce3', name:'Sunmi D3 Pro', price:1024, t:'o' },
  { id:'c36c776a-194a-4c32-b758-8ffc09cf991b', name:'Sunmi D3 Mini', price:690, t:'o' },
  { id:'bbcba755-3fa2-4c21-85e2-9842a1baa541', name:'D3 Pro Garantieverlängerung', price:190, t:'o', info:'auf 48 Monate' },
  { id:'91b8a7fa-5b0c-44a4-a4a7-fd6c6f0b25f6', name:'Sunmi V3H', price:649, t:'o' },
  { id:'4bc17b56-5e4e-49cf-b4fb-a0e4d295335a', name:'Sunmi L3H', price:599, t:'o' },
  { id:'1a4f3300-edd2-477f-8188-604b8ef8fba3', name:'V3H/L3H/D3 mini Garantieverlängerung', price:90, t:'o', info:'auf 48 Monate' },
  { id:'7ea30866-25d7-4fa2-b970-0fd6911a3de8', name:'Hobex ViA PRO', price:1149, t:'o' },
  { id:'4be8df2f-6293-4a06-b559-d7856c12c1bf', name:'Addminat-Kellnerschloss', price:178, t:'o', info:'inkl 5 Schlüssel' },
];

export const DRUCKER: Item[] = [
  { id:'d2769912-6880-4996-b6b9-07d4fdbc9406', name:'Epson TMT20 Bondrucker', price:280, t:'o' },
  { id:'2ce55292-b567-488a-bd35-20f280dc8381', name:'Bixolon SPP-R200III', price:376, t:'o' },
];

export const KUECHENMONITORE: Item[] = [
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

export const KUECHENMONITORE_SUNMI: Item[] = [
  { id:'5c1b7d35-27b4-4bc1-b44c-fb8a2f1ca153', name:"Flex 3 22''", price:1139, t:'o' },
  { id:'9105cea7-5ce7-4cab-87ba-12395c184861', name:"Flex 3 27''", price:1749, t:'o' },
  { id:'dcfacd8a-e274-44ae-89f7-ecc03164c439', name:'Flex 3 Garantieverlängerung', price:190, t:'o', info:'auf 48 Monate' },
];

export const DIENSTLEISTUNGEN: Item[] = [
  { id:'00caa501-4266-4459-bbf6-38074fa7a00d', name:'Fiskalisierung', price:190, t:'o' },
  { id:'b01429e1-672e-44ae-ae79-1d08c4f7f918', name:'Arbeitszeit', price:118, t:'o', info:'pro Stunde' },
];

export const ORDERMAN: Item[] = [
  { id:'591d5910-776c-4864-8cfc-0ad55c6ccca9', name:'Orderman 10', price:900, t:'o' },
  { id:'24931794-f0f7-44a8-a476-f0a1c5380484', name:'Orderman Garantieverlängerung', price:270, t:'o', info:'auf 48 Monate' },
  { id:'6b8ccb5b-d690-4daf-82d5-ef637822817f', name:'Orderman Ladestation inkl. Netzteil', price:210, t:'o' },
  { id:'a252444d-0ac6-4809-9ede-16125a3bc5f0', name:'Orderman Ersatzbatterie', price:60, t:'o' },
  { id:'d1697574-cac7-4fec-8e72-89a582a0d6d5', name:'Orderman Gürteltasche', price:25, t:'o' },
  { id:'0134901e-4d85-4e1d-a65b-c53be99e8ef4', name:'Orderman Safety-Cord', price:14, t:'o' },
  { id:'orderman-magellan-celeron', name:'Magellan Celeron', price:1780, t:'o', info:'Intel N95/N97 · 15,1" 4:3 · 8 GB RAM · 128 GB SSD' },
  { id:'orderman-magellan-celeron-garantie', name:'Magellan Celeron Garantieverlängerung', price:623, t:'o', info:'auf 60 Monate (35%)' },
  { id:'orderman-magellan-i3', name:'Magellan i3', price:2080, t:'o', info:'Intel N305 · 15,1" 4:3 · 8 GB RAM · 128 GB SSD' },
  { id:'orderman-magellan-i3-garantie', name:'Magellan i3 Garantieverlängerung', price:728, t:'o', info:'auf 60 Monate (35%)' },
  { id:'orderman-magellan-i5', name:'Magellan i5', price:3120, t:'o', info:'Intel Ultra 5 · 15,1" 4:3 · 16 GB RAM · 256 GB SSD' },
  { id:'orderman-magellan-i5-garantie', name:'Magellan i5 Garantieverlängerung', price:1092, t:'o', info:'auf 60 Monate (35%)' },
];

export const TEAM: TeamMember[] = [
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

// Combined catalog lookup. Custom user-added items are not present here.
export const ALL: Catalog = {};
for (const item of [
  ...BESSA,
  ...MELZER,
  ...RCH,
  ...HARDWARE,
  ...UNIFY,
  ...DRUCKER,
  ...KUECHENMONITORE,
  ...KUECHENMONITORE_SUNMI,
  ...ORDERMAN,
  ...DIENSTLEISTUNGEN,
]) {
  ALL[item.id] = item;
}

export const CATALOG_IDS: ReadonlySet<string> = new Set(Object.keys(ALL));

export function isCustomItem(id: string): boolean {
  return !CATALOG_IDS.has(id);
}
