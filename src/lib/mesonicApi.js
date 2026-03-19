import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════
// Mesonic WinLine API Client
// ═══════════════════════════════════════════════════════
//
// All calls go through the mesonic-proxy Supabase Edge Function.
// The proxy handles session management and auth.
//
// Template names (as configured in WinLine):
//
//   Type 1  (Customers):  WebKontenExport / WebKontenListe / WebKontenImport
//   Type 4  (Articles):   WebArtikelExport / WebArtikelListe / WebArtikelImport
//   Type 5  (Prices):     WebPreisExport
//   Type 7  (Contacts):   WebKontakteExport / WebKontakteImport
//   Type 30 (Belege):     WebBelegExport / WebBelegListe / WebBelegImport
//   Type 34 (CRM):        WEBCRM

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mesonic-proxy`;

// ─── Template name constants ───
export const TEMPLATES = {
  CUSTOMER_DETAIL: 'WebKontenExport',
  CUSTOMER_LIST: 'WebKontenListe',
  CUSTOMER_IMPORT: 'WebKontenImport',
  ARTICLE_DETAIL: 'WebArtikelExport',
  ARTICLE_LIST: 'WebArtikelListe',
  ARTICLE_IMPORT: 'WebArtikelImport',
  PRICE_EXPORT: 'WebPreisExport',
  CONTACT_EXPORT: 'WebKontakteExport',
  CONTACT_IMPORT: 'WebKontakteImport',
  BELEG_DETAIL: 'WebBelegExport',
  BELEG_LIST: 'WebBelegListe',
  BELEG_IMPORT: 'WebBelegImport',
  CRM: 'WEBCRM',
};

// ─── Type codes ───
export const TYPES = {
  CUSTOMER: 1,
  ARTICLE: 4,
  PRICE: 5,
  CONTACT: 7,
  BELEG: 30,
  CRM: 34,
};

// ─── Core fetch helper ───
async function proxyRequest(body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Proxy error (${res.status})`);
  }

  return data;
}

// ─── Health check ───
export async function ping() {
  return proxyRequest({ action: 'ping' });
}

// ─── Generic export (parsed JSON) ───
export async function mesonicExport(type, template, key) {
  return proxyRequest({ action: 'export', type, template, key });
}

// ─── Generic export (raw XML) ───
export async function mesonicExportRaw(type, template, key) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'export_raw', type, template, key }),
  });

  return await res.text();
}

// ─── Generic import ───
export async function mesonicImport(type, template, xmlData, opts = {}) {
  return proxyRequest({
    action: 'import',
    type,
    template,
    xmlData,
    actionCode: opts.actionCode ?? 1,
    option: opts.option,
  });
}

// ═══════════════════════════════════════════════════════
// Customer API (Type 1)
// ═══════════════════════════════════════════════════════

/** Search customers by name, number, or other fields */
export async function searchCustomers(query) {
  // If it looks like a customer number (alphanumeric, no spaces), search by key
  if (/^[A-Za-z0-9]+$/.test(query)) {
    return mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_LIST, query);
  }
  // Otherwise use WHERE clause on name
  const escaped = query.replace(/'/g, "''");
  return mesonicExport(
    TYPES.CUSTOMER,
    TEMPLATES.CUSTOMER_LIST,
    `where T055.C003 LIKE '%${escaped}%'`
  );
}

/** Get all customers (use with caution — may be large) */
export async function listCustomers() {
  return mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_LIST, '*');
}

/** Get full customer details by customer number */
export async function getCustomer(customerNumber) {
  return mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, customerNumber);
}

// ═══════════════════════════════════════════════════════
// Article API (Type 4)
// ═══════════════════════════════════════════════════════

/** Search articles by number or description */
export async function searchArticles(query) {
  if (/^[A-Za-z0-9]+$/.test(query)) {
    return mesonicExport(TYPES.ARTICLE, TEMPLATES.ARTICLE_LIST, query);
  }
  const escaped = query.replace(/'/g, "''");
  return mesonicExport(
    TYPES.ARTICLE,
    TEMPLATES.ARTICLE_LIST,
    `where T024.C003 LIKE '%${escaped}%'`
  );
}

/** Get full article details */
export async function getArticle(articleNumber) {
  return mesonicExport(TYPES.ARTICLE, TEMPLATES.ARTICLE_DETAIL, articleNumber);
}

// ═══════════════════════════════════════════════════════
// Beleg API (Type 30)
// ═══════════════════════════════════════════════════════

/** Get all Belege for a customer */
export async function getCustomerBelege(customerNumber) {
  return mesonicExport(TYPES.BELEG, TEMPLATES.BELEG_LIST, `${customerNumber}-*`);
}

/** Get single Beleg by key (format: customerNumber-laufnummer) */
export async function getBeleg(belegKey) {
  return mesonicExport(TYPES.BELEG, TEMPLATES.BELEG_DETAIL, belegKey);
}

// ═══════════════════════════════════════════════════════
// Contact API (Type 7)
// ═══════════════════════════════════════════════════════

/** Get contacts for a customer */
export async function getCustomerContacts(customerNumber) {
  return mesonicExport(
    TYPES.CONTACT,
    TEMPLATES.CONTACT_EXPORT,
    `where T045.C039 = '${customerNumber}'`
  );
}
