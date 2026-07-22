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

// ─── Core fetch helper with retry on WORKER_LIMIT ───
async function proxyRequest(body, retries = 3) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    // Handle WORKER_LIMIT: retry after a short delay
    if (res.status === 546 || res.status === 529) {
      const text = await res.text();
      if (text.includes('WORKER_LIMIT') && attempt < retries) {
        console.warn(`[mesonic] WORKER_LIMIT hit, retrying in ${(attempt + 1) * 1000}ms (attempt ${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }
    }

    let data;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      throw new Error(`Proxy returned non-JSON (${res.status}): ${text.substring(0, 200)}`);
    }

    if (!res.ok) {
      // Also retry on WORKER_LIMIT in JSON response
      if (data.code === 'WORKER_LIMIT' && attempt < retries) {
        console.warn(`[mesonic] WORKER_LIMIT hit, retrying in ${(attempt + 1) * 1000}ms (attempt ${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }
      throw new Error(data.error || data.message || `Proxy error (${res.status})`);
    }

    return data;
  }

  throw new Error('Mesonic-Proxy nicht erreichbar (WORKER_LIMIT). Bitte versuche es in ein paar Sekunden erneut.');
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
  const data = await proxyRequest({
    action: 'import',
    type,
    template,
    xmlData,
    actionCode: opts.actionCode ?? 1,
    option: opts.option,
  });

  // The proxy returns { result: "<xml>" }. Parse the XML for Mesonic errors.
  const xml = data.result || '';
  console.log('[mesonicImport] raw response:', xml);

  // Check for OverallSuccess=false in the XML
  const successMatch = xml.match(/<OverallSuccess>(.*?)<\/OverallSuccess>/);
  if (successMatch && successMatch[1].toLowerCase() === 'false') {
    // Extract error details
    const codeMatch = xml.match(/<ErrorCode>(.*?)<\/ErrorCode>/);
    const textMatch = xml.match(/<ErrorText>(.*?)<\/ErrorText>/);
    const errorCode = codeMatch ? codeMatch[1] : 'unknown';
    const errorText = textMatch ? textMatch[1] : 'Unbekannter Fehler';
    return { success: false, error: `${errorCode}: ${errorText}`, raw: xml };
  }

  return { success: true, raw: xml };
}

// ═══════════════════════════════════════════════════════
// Customer API (Type 1)
// ═══════════════════════════════════════════════════════

/** Search customers by name, number, or other fields */
export async function searchCustomers(query) {
  // If it looks like a customer number (pure digits), fetch by key directly
  if (/^\d+$/.test(query)) {
    return mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, query);
  }
  // Otherwise use WHERE clause on name (Mesonic requires %% for LIKE wildcards)
  const escaped = query.replace(/'/g, "''");
  return mesonicExport(
    TYPES.CUSTOMER,
    TEMPLATES.CUSTOMER_DETAIL,
    `where T055.C003 LIKE '%%${escaped}%%'`
  );
}

/** Get all customers (use with caution — may be large) */
export async function listCustomers() {
  // Wildcard * not supported — use WHERE to get all non-empty accounts
  return mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, "where T055.C003 <> ''");
}

/** Get full customer details by customer number */
export async function getCustomer(customerNumber) {
  return mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, customerNumber);
}

// ─── WebKontenImport schema (from the endpoint's XSD) ───
//
// The XSD declares the fields in an xs:sequence, so ORDER IS ENFORCED —
// elements must appear in exactly this order or the parser rejects them.
// The first 9 are mandatory (minOccurs=1); the rest are optional.
const KONTEN_IMPORT_ORDER = [
  // ── mandatory ──
  'Kontonummer',
  'Kennzeichen',           // xs:integer
  'Name',
  'BKZ1',
  'BKZ1Wechselkonto',
  'ZahlungskonditionFIBU',
  'Belegart',
  'Preisliste',            // xs:integer
  'ZahlungskonditionFAKT',
  // ── optional ──
  'E-Mail',
  'Vorname',
  'Nachname',
  'Telefon',
  'Strasse',
  'Postleitzahl',
  'Ort',
  'Land',
  'Mobiltelefonnummer',
];

const KONTEN_IMPORT_REQUIRED = new Set(KONTEN_IMPORT_ORDER.slice(0, 9));

// Fields the XSD types as xs:integer — sent as bare integers (no padding/decimals).
const KONTEN_IMPORT_INTEGER = new Set(['Kennzeichen', 'Preisliste']);

// Defaults for the mandatory ERP fields a salesperson never types. Values are
// the ones that are constant across every account in WebKontenExport. Kontonummer
// defaults to '+' — the WinLine convention for "assign the next free number" when
// creating a new account. Editing an existing customer passes a real Kontonummer,
// which overrides this.
const KONTEN_IMPORT_DEFAULTS = {
  Kontonummer: '+',
  Kennzeichen: '2',
  BKZ1: '1230',
  BKZ1Wechselkonto: '1230',
  ZahlungskonditionFIBU: '3',
  Belegart: '8',
  Preisliste: '13',
  ZahlungskonditionFAKT: '3',
};

// Map a few common non-canonical field names onto the XSD tag names.
const KONTEN_IMPORT_ALIASES = {
  Email: 'E-Mail',
  EMail: 'E-Mail',
  Mobiltelefon: 'Mobiltelefonnummer',
};

/**
 * Build the <WebKontenImport> XML for one customer record.
 *
 * Applies ERP defaults for the mandatory fields, normalises a few common field
 * aliases, coerces the xs:integer fields to bare integers, and emits the elements
 * in the exact order the XSD's xs:sequence requires. Optional fields are only
 * emitted when non-empty. Pure — no network — so it can be inspected and tested.
 *
 * @param {Object} fields — key/value pairs; canonical XSD tag names (aliases mapped)
 * @returns {string} the <WebKontenImport>…</WebKontenImport> fragment
 */
export function buildKontenImportXml(fields = {}) {
  // Normalise aliases, dropping empty values so defaults can fill in.
  const provided = {};
  for (const [rawKey, rawVal] of Object.entries(fields)) {
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
    const key = KONTEN_IMPORT_ALIASES[rawKey] || rawKey;
    provided[key] = rawVal;
  }

  const merged = { ...KONTEN_IMPORT_DEFAULTS, ...provided };

  const lines = [];
  for (const key of KONTEN_IMPORT_ORDER) {
    let val = merged[key];
    const present = val !== undefined && val !== null && String(val).trim() !== '';
    if (!present) continue; // optional field absent — skip (required fields have defaults)

    val = String(val).trim();
    if (KONTEN_IMPORT_INTEGER.has(key)) {
      // xs:integer — strip anything that isn't a plain integer
      const n = parseInt(val, 10);
      if (!Number.isNaN(n)) val = String(n);
    }
    lines.push(`  <${key}>${escapeXml(val)}</${key}>`);
  }

  return `<WebKontenImport>\n${lines.join('\n')}\n</WebKontenImport>`;
}

/**
 * Create or update a customer in Mesonic.
 *
 * New customers can omit Kontonummer (defaults to '+' — WinLine assigns the next
 * free number). Editing passes the real Kontonummer. The mandatory ERP fields
 * (Kennzeichen, BKZ1, Preisliste, …) default to their standard values unless the
 * caller overrides them.
 *
 * @param {Object} fields — key/value pairs matching Mesonic field names
 *   e.g. { Name: 'Firma GmbH', Strasse: 'Hauptstr. 1', Postleitzahl: '9020', Ort: 'Klagenfurt', ... }
 * @param {Object} opts
 * @param {number} opts.actionCode — 0 = validate only, 1 = validate + import (default)
 * @returns {Promise<Object>} Mesonic import response
 */
export async function saveCustomer(fields, opts = {}) {
  const xmlData = buildKontenImportXml(fields);

  return mesonicImport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_IMPORT, xmlData, {
    actionCode: opts.actionCode ?? 1,
  });
}

/** Validate customer data without saving */
export async function validateCustomer(fields) {
  return saveCustomer(fields, { actionCode: 0 });
}

// XML escape helper
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════
// Article API (Type 4)
// ═══════════════════════════════════════════════════════

/** Search articles by number or description */
export async function searchArticles(query) {
  if (/^\d+$/.test(query)) {
    return mesonicExport(TYPES.ARTICLE, TEMPLATES.ARTICLE_DETAIL, query);
  }
  // Mesonic requires %% for LIKE wildcards
  const escaped = query.replace(/'/g, "''");
  return mesonicExport(
    TYPES.ARTICLE,
    TEMPLATES.ARTICLE_DETAIL,
    `where T024.C003 LIKE '%%${escaped}%%'`
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
