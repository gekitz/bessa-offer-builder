import { useState, useRef } from 'react';
import { ping, mesonicExport, mesonicExportRaw, mesonicImport, mesonicList, searchArticles, getArticle, baseArticleNumber, saveCustomer, validateCustomer, buildKontenImportXml, TYPES, TEMPLATES } from '../lib/mesonicApi';
import { fetchCustomerBelege, latestHardware, isLikelyHardware } from '../features/viertl/lib/mesonicBelege';
import { buildAngebotImportXml, PSEUDO_ARTIKEL, BELEGART, REPARATUR_BELEGART, laborArtikelnummer } from '../features/offers/lib/angebotImport';

// Sample new-customer payload — only the fields a salesperson would enter.
// Kontonummer is omitted on purpose so saveCustomer() defaults it to '+' (new
// account); the mandatory ERP fields (Kennzeichen, BKZ1, …) come from defaults.
const SAMPLE_NEW_CUSTOMER = {
  Name: 'Testfirma Defaults GmbH',
  Strasse: 'Testgasse 1',
  Postleitzahl: '9020',
  Ort: 'Klagenfurt',
  Land: 'Österreich',
  'E-Mail': 'info@testfirma.at',
  Telefon: '+43 463 123456',
};

// Helper: call proxy with import_debug action (doesn't actually send to Mesonic)
async function importDebug(type, template, xmlData, actionCode = 1) {
  const { supabase } = await import('../lib/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mesonic-proxy`;
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'import_debug', type, template, xmlData, actionCode }),
  });
  return await res.json();
}

// ═══════════════════════════════════════════════════════
// Test definitions — grouped by section
// ═══════════════════════════════════════════════════════

const TEST_SECTIONS = [
  {
    title: 'Kunden (Type 1)',
    tests: [
      { label: '1. Ping (session check)', run: () => ping() },
      { label: '2. Single customer (29385)', run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, '29385') },
      { label: '3. WHERE search (ALTHOFEN)', run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, "where T055.C003 LIKE '%%ALTHOFEN%%'") },
      { label: '4. Wildcard (*) — expected fail', run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, '*') },
      { label: '5. Range (29385++29400) — expected fail', run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, '29385++29400') },
      { label: '6. WHERE on name (KLAGENFURT)', run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, "where T055.C003 LIKE '%%KLAGENFURT%%'") },
      { label: '7. Liste template (*) — expected fail', run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_LIST, '*') },
      { label: '8. Raw XML — WHERE ALTHOFEN', run: () => mesonicExportRaw(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, "where T055.C003 LIKE '%%ALTHOFEN%%'") },
    ],
  },
  {
    title: 'Kunden Import (Type 1)',
    tests: [
      {
        label: '9. Import DEBUG — Testkunde (Dry Run)',
        run: () => importDebug(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_IMPORT,
          '<WebKontenImport>\n  <Name>Testfirma Debug GmbH</Name>\n  <Ort>Klagenfurt</Ort>\n  <Strasse>Testgasse 1</Strasse>\n  <Postleitzahl>9020</Postleitzahl>\n</WebKontenImport>', 1),
      },
      {
        label: '10. Import LIVE — validate only (ActionCode=0)',
        run: () => mesonicImport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_IMPORT,
          '<WebKontenImport>\n  <Name>Testfirma Validate GmbH</Name>\n  <Ort>Klagenfurt</Ort>\n  <Strasse>Testgasse 1</Strasse>\n  <Postleitzahl>9020</Postleitzahl>\n</WebKontenImport>',
          { actionCode: 0 }),
      },
      {
        // Pure — no network. Shows the exact XML saveCustomer() would send:
        // '+' Kontonummer, ERP defaults filled in, fields in XSD sequence order.
        label: '11. XML-Vorschau — Neuer Kunde mit Defaults (kein Request)',
        run: () => buildKontenImportXml(SAMPLE_NEW_CUSTOMER),
      },
      {
        label: '12. Import DEBUG — Neuer Kunde mit Defaults (Dry Run)',
        run: () => importDebug(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_IMPORT,
          buildKontenImportXml(SAMPLE_NEW_CUSTOMER), 1),
      },
      {
        label: '13. Import LIVE — validate only, Defaults (ActionCode=0)',
        run: () => validateCustomer(SAMPLE_NEW_CUSTOMER),
      },
      {
        // Isolates the '+' Kontonummer: a concrete number skips WinLine's
        // "assign next free number" logic. Still validate-only (ActionCode=0).
        label: '14. Import LIVE — validate only, konkrete Kontonummer (ActionCode=0)',
        run: () => validateCustomer({ ...SAMPLE_NEW_CUSTOMER, Kontonummer: '12345678911' }),
      },
    ],
  },
  {
    title: 'Artikel (Type 4)',
    tests: [
      {
        label: '15. Single article (1) — erster Artikel',
        run: () => mesonicExport(TYPES.ARTICLE, TEMPLATES.ARTICLE_DETAIL, '1'),
      },
      {
        label: '16. WHERE search — Artikel "bessa"',
        run: () => searchArticles('bessa'),
      },
      {
        label: '17. Raw XML — erster Artikel',
        run: () => mesonicExportRaw(TYPES.ARTICLE, TEMPLATES.ARTICLE_DETAIL, '1'),
      },
      {
        label: '18. WHERE search — "Kassa"',
        run: () => searchArticles('Kassa'),
      },
      {
        label: '19. WHERE search — "Mobil"',
        run: () => searchArticles('Mobil'),
      },
      {
        label: '20. WHERE search — "Sunmi"',
        run: () => searchArticles('Sunmi'),
      },
    ],
  },
  {
    title: 'Preise (Type 5) — WEBArtikelPreise, Key = Basis-Artikelnummer (ohne KL/WO)',
    tests: [
      {
        label: '21. Preise — Artikel 16030051',
        run: () => mesonicExport(TYPES.PRICE, TEMPLATES.PRICE_EXPORT, '16030051'),
      },
      {
        label: '22. Raw XML — Preise Artikel 16030051',
        run: () => mesonicExportRaw(TYPES.PRICE, TEMPLATES.PRICE_EXPORT, '16030051'),
      },
    ],
  },
];

// Flatten for index-based running
const ALL_TESTS = TEST_SECTIONS.flatMap(s => s.tests);

// ═══════════════════════════════════════════════════════
// Interactive article search component
// ═══════════════════════════════════════════════════════

function ArticleExplorer() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const inputRef = useRef(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim() || query.trim().length < 1) return;

    setLoading(true);
    setError(null);
    setSelectedArticle(null);
    try {
      const data = await searchArticles(query.trim());
      setResults(data);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const records = results?.records || [];

  // Try to extract useful field names from first record
  const fieldNames = records.length > 0 ? Object.keys(records[0]) : [];

  return (
    <div className="border-2 border-blue-200 rounded-lg p-5 bg-blue-50">
      <h2 className="text-lg font-bold mb-1 text-blue-800">Artikel-Explorer</h2>
      <p className="text-sm text-blue-600 mb-4">Interaktive Suche in Mesonic Artikeldaten (Type 4)</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Artikelname oder -nummer suchen..."
          className="flex-1 border border-blue-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Suche...' : 'Suchen'}
        </button>
        {/* "Alle laden" entfernt — Datenmenge zu groß, verursacht Timeout */}
      </form>

      {error && (
        <div className="p-3 mb-4 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      {results && (
        <div className="text-sm text-blue-700 mb-3">
          {records.length} Artikel gefunden
          {fieldNames.length > 0 && (
            <span className="ml-2 text-blue-400">
              ({fieldNames.length} Felder pro Artikel)
            </span>
          )}
        </div>
      )}

      {/* Field name overview (from first record) */}
      {fieldNames.length > 0 && !selectedArticle && (
        <div className="mb-4 p-3 bg-white rounded border border-blue-200">
          <div className="text-xs font-semibold text-blue-500 mb-2 uppercase tracking-wide">Verfügbare Felder</div>
          <div className="flex flex-wrap gap-1">
            {fieldNames.map(f => (
              <span key={f} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Article list */}
      {records.length > 0 && !selectedArticle && (
        <div className="space-y-1 max-h-96 overflow-auto">
          {records.map((record, idx) => {
            // Try common field names for display
            const name = record.Artikelbezeichnung || record.Bezeichnung || record.Name || record.T024_C003 || record['T024.C003'] || '—';
            const number = record.Artikelnummer || record.ArtikelNr || record.T024_C001 || record['T024.C001'] || '';
            const group = record.Artikelgruppe || record.Gruppe || record.T024_C004 || '';
            const price = record.Preis || record.VKPreis || record.T024_C020 || '';

            return (
              <button
                key={idx}
                onClick={() => setSelectedArticle(record)}
                className="w-full text-left p-3 bg-white rounded border border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm text-slate-800">{name}</span>
                    {number && <span className="ml-2 text-xs text-slate-400">Nr. {number}</span>}
                    {group && <span className="ml-2 text-xs text-blue-400">({group})</span>}
                  </div>
                  {price && <span className="text-sm font-mono text-emerald-600">{price}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Article detail */}
      {selectedArticle && (
        <div>
          <button
            onClick={() => setSelectedArticle(null)}
            className="text-blue-600 hover:text-blue-800 text-sm mb-3"
          >
            ← Zurück zur Liste
          </button>
          <div className="bg-white rounded border border-blue-200 p-4">
            <h3 className="font-bold text-slate-800 mb-3">Artikel-Detail — alle Felder</h3>
            <div className="space-y-1.5">
              {Object.entries(selectedArticle).map(([key, value]) => (
                <div key={key} className="flex gap-3">
                  <span className="text-xs font-mono text-blue-500 flex-shrink-0" style={{ width: 180 }}>{key}</span>
                  <span className="text-sm text-slate-700">{value || <span className="text-slate-300">—</span>}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 p-3 bg-slate-50 rounded border">
            <div className="text-xs font-semibold text-slate-500 mb-1">Raw JSON</div>
            <pre className="text-xs overflow-auto max-h-48">{JSON.stringify(selectedArticle, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main test page
// ═══════════════════════════════════════════════════════

// Interaktiver Tester für die WinLine-Liste "KundenArtikel" (LIST-Befehl,
// White Paper §3.8). Die drei "Fragen" (Kontonummer, Datum Faktura,
// Einzelpreis) werden über DatasourceSel1..4 übergeben — welcher Slot zu
// welcher Frage gehört, klären wir hier empirisch: die Variante, die genau
// die Datensätze EINES Kunden liefert, ist die richtige Zuordnung.
function KundenArtikelTester() {
  const [listName, setListName] = useState('KundenArtikel');
  const [filterName, setFilterName] = useState(''); // leer = kein Filter= (Datenquelle direkt)
  const [konto, setKonto] = useState('272765');
  const [datum, setDatum] = useState('01.01.2020');
  const [preis, setPreis] = useState('0');
  const [customWhere, setCustomWhere] = useState('');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(null);

  async function tryVariant(label, opts) {
    setBusy(label);
    setOut(null);
    try {
      const res = await mesonicList(listName, opts);
      setOut({ label, ok: true, res });
    } catch (e) {
      setOut({ label, ok: false, error: e.message });
    } finally {
      setBusy(null);
    }
  }

  const base = filterName ? { filter: filterName } : {};
  const variants = [
    ['① NOFILTER — alle Zeilen (ohne Filter)', { filter: 'NOFILTER' }],
    ['② nur Name (Standardfilter der Liste)', {}],
    ['A · Sel1=Konto', { ...base, datasourceSel1: konto }],
    ['B · Sel1=Konto, Sel2=Datum, Sel3=Preis', { ...base, datasourceSel1: konto, datasourceSel2: datum, datasourceSel3: preis }],
    ['C · Sel1=Konto, Sel3=Preis, Sel4=Datum', { ...base, datasourceSel1: konto, datasourceSel3: preis, datasourceSel4: datum }],
    ['D · Sel1=Konto, Sel2=Datum, Sel3=Preis, Sel4=Datum', { ...base, datasourceSel1: konto, datasourceSel2: datum, datasourceSel3: preis, datasourceSel4: datum }],
    ['E · nur Filter (Standardwerte)', { ...base }],
  ];

  return (
    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/40">
      <h2 className="text-lg font-bold mb-1 text-blue-800">KundenArtikel — LIST-Tester</h2>
      <p className="text-xs text-slate-500 mb-3">
        Findet die richtige DatasourceSel-Zuordnung. Erfolg = genau die Belege dieses Kunden.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <label className="text-xs text-slate-600">Listenname
          <input value={listName} onChange={(e) => setListName(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Filtername
          <input value={filterName} onChange={(e) => setFilterName(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Kontonummer
          <input value={konto} onChange={(e) => setKonto(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Datum Faktura &gt;
          <input value={datum} onChange={(e) => setDatum(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Einzelpreis &gt;
          <input value={preis} onChange={(e) => setPreis(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {variants.map(([label, opts]) => (
          <button
            key={label}
            onClick={() => tryVariant(label, opts)}
            disabled={!!busy}
            className="px-2.5 py-1.5 text-xs rounded bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 disabled:opacity-40"
          >
            {busy === label ? '…' : label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={customWhere}
          onChange={(e) => setCustomWhere(e.target.value)}
          placeholder="Eigenes Where, z. B. WHERE(Kontonummer='236000')"
          className="flex-1 px-2 py-1 border rounded text-sm font-mono"
        />
        <button
          onClick={() => tryVariant('Where', { where: customWhere })}
          disabled={!!busy || !customWhere.trim()}
          className="px-2.5 py-1.5 text-xs rounded bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 disabled:opacity-40"
        >
          Where testen
        </button>
      </div>
      {out && (
        <div className="mt-2">
          <div className={`text-sm font-medium ${out.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {out.label} — {out.ok ? 'OK' : 'Fehler'}
          </div>
          <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded text-xs overflow-auto max-h-80 whitespace-pre-wrap">
            {out.ok ? (out.res?.raw ?? JSON.stringify(out.res, null, 2)) : out.error}
          </pre>
        </div>
      )}
    </div>
  );
}

// Beleg-Export-Tester (Type 30, WebBelegExport) — der bewährte Export-Weg
// (wie die CRM-Kundensuche) statt der problematischen LIST-Datenquelle.
// Ziel: pro Kunde die Belegpositionen (Artikel + DatumFaktura + Einzelpreis)
// lesen → neueste Hardware. Key kann ein einfacher Schlüssel ODER ein
// "where …"-Ausdruck sein (wie bei der Kundensuche).
function BelegExportTester() {
  const [type, setType] = useState('30');
  const [template, setTemplate] = useState('WebBelegExport');
  const [key, setKey] = useState('236000');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(null);

  async function run(mode) {
    setBusy(mode);
    setOut(null);
    try {
      const res = mode === 'raw'
        ? await mesonicExportRaw(Number(type), template, key)
        : await mesonicExport(Number(type), template, key);
      setOut({ ok: true, mode, res });
    } catch (e) {
      setOut({ ok: false, error: e.message });
    } finally {
      setBusy(null);
    }
  }

  // Schnell-Vorlagen für den Key/WHERE — erste Sondierungen. Die genaue
  // T025-Spalte für Kontonummer/Belegart ermitteln wir aus der Roh-Antwort.
  const konto = key.replace(/\D/g, '') || '236000';
  const presets = [
    ['Key = Kontonummer', konto],
    ["WHERE T025.C007 = Konto", `where T025.C007 = '${konto}'`],
    ["WHERE T025.C003 = Konto", `where T025.C003 = '${konto}'`],
    ["WHERE T025.C001 = Konto", `where T025.C001 = '${konto}'`],
  ];

  return (
    <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/40">
      <h2 className="text-lg font-bold mb-1 text-emerald-800">Beleg-Export-Tester (Type 30)</h2>
      <p className="text-xs text-slate-500 mb-3">
        Bewährter Export-Weg statt LIST. Key kann ein Schlüssel oder ein „where …"-Ausdruck sein.
        Erst „Raw XML" ansehen → echte Feld-/Spaltennamen erkennen → passenden WHERE bauen.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <label className="text-xs text-slate-600">Type
          <input value={type} onChange={(e) => setType(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Template
          <input value={template} onChange={(e) => setTemplate(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600 md:col-span-2">Key / WHERE
          <input value={key} onChange={(e) => setKey(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm font-mono" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {presets.map(([label, k]) => (
          <button key={label} onClick={() => setKey(k)} className="px-2 py-1 text-xs rounded bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100">
            {label}
          </button>
        ))}
        {/* Ansprechpartner eines Kontos (Type 7, T045.C039 = Kontonummer) */}
        <button
          onClick={() => { setType('7'); setTemplate('WEBKontakt'); setKey(`where T045.C039 = '${konto}'`); }}
          className="px-2 py-1 text-xs rounded bg-white border border-violet-300 text-violet-800 hover:bg-violet-100"
        >
          Ansprechpartner (Type 7)
        </button>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => run('parsed')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
          {busy === 'parsed' ? '…' : 'Parsed'}
        </button>
        <button onClick={() => run('raw')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 disabled:opacity-40">
          {busy === 'raw' ? '…' : 'Raw XML'}
        </button>
      </div>
      {out && (
        <div className="mt-2">
          <div className={`text-sm font-medium ${out.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {out.ok ? `OK (${out.mode})` : 'Fehler'}
          </div>
          <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap">
            {out.ok ? (typeof out.res === 'string' ? out.res : JSON.stringify(out.res, null, 2)) : out.error}
          </pre>
        </div>
      )}
    </div>
  );
}

// Artikel-Preise-Tester (Type 5, WEBArtikelPreise) — die Preistabelle (T043)
// eines Artikels: Preisart / Preisliste / Preis. Key = BASIS-Artikelnummer
// (White Paper §3.5.6) OHNE KL/WO-Suffix — die Preise hängen am Artikel, nicht
// an der Standort-Ausprägung. 000161 "Kein Datensatz" = Artikel ohne Preiszeile.
function ArtikelPreiseTester() {
  const [artikel, setArtikel] = useState('16030051');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(null);

  async function run(mode) {
    setBusy(mode);
    setOut(null);
    try {
      const key = baseArticleNumber(artikel); // KL/WO-Ausprägung strippen
      const res = mode === 'raw'
        ? await mesonicExportRaw(TYPES.PRICE, TEMPLATES.PRICE_EXPORT, key)
        : await mesonicExport(TYPES.PRICE, TEMPLATES.PRICE_EXPORT, key);
      setOut({ ok: true, mode, res });
    } catch (e) {
      setOut({ ok: false, error: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/40">
      <h2 className="text-lg font-bold mb-1 text-amber-800">Artikel-Preise-Tester (Type 5, WEBArtikelPreise)</h2>
      <p className="text-xs text-slate-500 mb-3">
        Preistabelle (T043) eines Artikels — Preisart / Preisliste / Preis. Key = Artikelnummer.
        „Kein Datensatz" (000161) heißt: der Artikel hat keine Preislisten-Zeile.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        <label className="text-xs text-slate-600">Artikelnummer
          <input value={artikel} onChange={(e) => setArtikel(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm font-mono" />
        </label>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => run('parsed')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40">
          {busy === 'parsed' ? '…' : 'Parsed'}
        </button>
        <button onClick={() => run('raw')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40">
          {busy === 'raw' ? '…' : 'Raw XML'}
        </button>
      </div>
      {out && (
        <div className="mt-2">
          <div className={`text-sm font-medium ${out.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {out.ok ? `OK (${out.mode})` : 'Fehler'}
          </div>
          <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap">
            {out.ok ? (typeof out.res === 'string' ? out.res : JSON.stringify(out.res, null, 2)) : out.error}
          </pre>
        </div>
      )}
    </div>
  );
}

// Kunden-Belege-Tester (Type 30, WEBBelege) — zählt <Konto>-<n> hoch,
// sammelt Belege, ermittelt die neueste Hardware (echte Artikel).
function KundenBelegeTester() {
  const [konto, setKonto] = useState('272765');
  const [max, setMax] = useState('20');
  const [progress, setProgress] = useState(null);
  const [belege, setBelege] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openIdx, setOpenIdx] = useState(null);
  const abortRef = useRef(false);

  async function run() {
    setBusy(true); setError(null); setBelege(null); setProgress({ n: 0, found: 0 });
    abortRef.current = false;
    try {
      const { belege: rows } = await fetchCustomerBelege(konto.trim(), {
        max: Number(max) || 20,
        delayMs: 350,
        onProgress: (n, found) => setProgress({ n, found }),
        abort: () => abortRef.current,
      });
      setBelege(rows);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const hw = belege ? latestHardware(belege) : null;

  return (
    <div className="border border-violet-200 rounded-lg p-4 bg-violet-50/40">
      <h2 className="text-lg font-bold mb-1 text-violet-800">Kunden-Belege / Hardware (WEBBelege)</h2>
      <p className="text-xs text-slate-500 mb-3">
        Zählt <code>&lt;Konto&gt;-&lt;n&gt;</code> hoch (gedrosselt), sammelt Belege, zeigt die neueste Hardware.
      </p>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <label className="text-xs text-slate-600">Kontonummer
          <input value={konto} onChange={(e) => setKonto(e.target.value)} className="block mt-0.5 px-2 py-1 border rounded text-sm w-36" />
        </label>
        <label className="text-xs text-slate-600">max n
          <input value={max} onChange={(e) => setMax(e.target.value)} className="block mt-0.5 px-2 py-1 border rounded text-sm w-20" />
        </label>
        {busy ? (
          <button onClick={() => { abortRef.current = true; }} className="px-3 py-1.5 text-sm rounded bg-amber-500 text-white">
            Stopp {progress ? `(${progress.n}, ${progress.found} Belege)` : ''}
          </button>
        ) : (
          <button onClick={run} className="px-3 py-1.5 text-sm rounded bg-violet-600 text-white hover:bg-violet-700">
            Belege laden
          </button>
        )}
      </div>

      {error && <div className="text-sm text-rose-700 mb-2">{error}</div>}

      {hw && (
        <div className="mb-3 p-2 rounded bg-white border border-violet-200 text-sm">
          <div className="font-semibold text-violet-800">
            Neuester Artikel-Beleg · {hw.beleg.datumFaktura ?? '—'} · Belegart {hw.beleg.belegart}
            <span className="ml-1 font-normal text-slate-400">(inkl. Dienstleistungen — bitte prüfen)</span>
          </div>
          <ul className="mt-1 text-xs text-slate-700">
            {hw.articles.map((a, i) => (
              <li key={i}>{a.artikelnummer} — {a.bezeichnung} (× {a.menge}, € {a.einzelpreis})</li>
            ))}
          </ul>
        </div>
      )}

      {belege && (
        belege.length === 0 ? (
          <div className="text-sm text-slate-400">Keine Belege gefunden.</div>
        ) : (
          <div className="space-y-1">
            {[...belege].sort((a, b) => (b.datumFaktura ?? '').localeCompare(a.datumFaktura ?? '')).map((b) => {
              const open = openIdx === b.index;
              const arts = b.positions.filter((p) => p.datentyp === '1' && (p.artikelnummer || '').toUpperCase() !== 'TEXT');
              return (
                <div key={b.index} className="rounded border border-violet-200 bg-white">
                  <button
                    onClick={() => setOpenIdx(open ? null : b.index)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-violet-50"
                  >
                    <span className="font-mono text-slate-700">
                      {open ? '▾' : '▸'} #{b.index} · {b.datumFaktura ?? '—'} · Belegart {b.belegart}
                    </span>
                    <span className="text-xs text-slate-500">{arts.length} Artikel / {b.positions.length} Pos</span>
                  </button>
                  {open && (
                    <div className="px-3 pb-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 text-left">
                            <th className="pr-2 py-1">Typ</th><th className="pr-2">Erlöskto</th><th className="pr-2">Artikelnr</th>
                            <th className="pr-2">Bezeichnung</th><th className="pr-2 text-right">Menge</th>
                            <th className="text-right">Einzelpreis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.positions.map((p, i) => {
                            const hw = isLikelyHardware(p);
                            const isArt = p.datentyp === '1' && (p.artikelnummer || '').toUpperCase() !== 'TEXT';
                            return (
                              <tr key={i} className={hw ? 'font-semibold text-emerald-700 bg-emerald-50' : isArt ? 'font-medium text-slate-800' : 'text-slate-400'}>
                                <td className="pr-2 py-0.5">{p.datentyp}</td>
                                <td className="pr-2 font-mono">{p.erloeskonto || '—'}</td>
                                <td className="pr-2 font-mono">{p.artikelnummer}</td>
                                <td className="pr-2">{hw ? '🔧 ' : ''}{p.bezeichnung}</td>
                                <td className="pr-2 text-right">{p.menge}</td>
                                <td className="text-right">€ {p.einzelpreis}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// Angebot-Import-Tester (WEBAngebot, Type 30) — baut die XML und prüft sie
// validate-only (ActionCode=0) → KEIN echter Beleg wird angelegt.
function AngebotImportTester() {
  const [konto, setKonto] = useState('272765');
  const [lauf, setLauf] = useState('999');
  const [standort, setStandort] = useState('klagenfurt');
  const [vertreter, setVertreter] = useState('');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(null);

  const pseudo = PSEUDO_ARTIKEL[standort];
  const belegart = BELEGART[standort];
  const positions = [
    { artikelnummer: pseudo, datentyp: '1', menge: 1, einzelpreis: 1400, bezeichnung: 'TEST Kassa-Paket', zeilenrabatt1: -10 },
    { artikelnummer: 'TEXT', datentyp: '3', menge: 1, bezeichnung: 'TEST inkl. Fiskalisierung' },
  ];
  const xml = buildAngebotImportXml(
    { kontonummer: konto, laufnummer: lauf, datumAngebot: new Date().toISOString().slice(0, 10), belegart, vertreternummer: vertreter || undefined },
    positions,
  );

  async function run(mode) {
    setBusy(mode);
    setOut(null);
    try {
      if (mode === 'preview') {
        setOut({ ok: true, text: xml });
      } else {
        // ActionCode 0 = nur validieren (kein Schreiben)
        const res = await mesonicImport(TYPES.BELEG, 'WEBAngebot', xml, { actionCode: 0 });
        setOut({ ok: res.success, text: res.error || res.raw || 'OK' });
      }
    } catch (e) {
      setOut({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-rose-200 rounded-lg p-4 bg-rose-50/40">
      <h2 className="text-lg font-bold mb-1 text-rose-800">Angebot-Import-Tester (WEBAngebot)</h2>
      <p className="text-xs text-slate-500 mb-3">
        „Validieren" nutzt ActionCode=0 → prüft nur, legt KEINEN Beleg an. Belegart/Pseudoartikel je Standort.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <label className="text-xs text-slate-600">Kontonummer
          <input value={konto} onChange={(e) => setKonto(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Laufnummer (frei/eindeutig)
          <input value={lauf} onChange={(e) => setLauf(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Standort
          <select value={standort} onChange={(e) => setStandort(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm">
            <option value="klagenfurt">Klagenfurt (Belegart 8, {PSEUDO_ARTIKEL.klagenfurt})</option>
            <option value="wolfsberg">Wolfsberg (Belegart 1, {PSEUDO_ARTIKEL.wolfsberg})</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">Vertreternummer (opt.)
          <input value={vertreter} onChange={(e) => setVertreter(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => run('preview')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 disabled:opacity-40">
          XML-Vorschau
        </button>
        <button onClick={() => run('validate')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40">
          {busy === 'validate' ? '…' : 'Validieren (ActionCode=0)'}
        </button>
      </div>
      {out && (
        <pre className={`p-2 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap ${out.ok ? 'bg-slate-900 text-slate-100' : 'bg-rose-900 text-rose-100'}`}>
          {out.text}
        </pre>
      )}
    </div>
  );
}

// Reparaturschein-Import-Tester — WEBAngebot mit Reparatur-Belegart (WO 12 /
// KL 16) und Arbeitszeit-Position mit mitarbeiterspezifischer Artikelnummer.
function ReparaturImportTester() {
  const [konto, setKonto] = useState('272765');
  const [lauf, setLauf] = useState('998');
  const [standort, setStandort] = useState('wolfsberg');
  const [vertreter, setVertreter] = useState('9');
  const [stunden, setStunden] = useState('1.5');
  const [satz, setSatz] = useState('95');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(null);

  const belegart = REPARATUR_BELEGART[standort];
  const arbeitArtikel = laborArtikelnummer(vertreter, standort);
  const xml = buildAngebotImportXml(
    { kontonummer: konto, laufnummer: lauf, datumAngebot: new Date().toISOString().slice(0, 10), belegart, vertreternummer: vertreter || undefined },
    [
      { artikelnummer: arbeitArtikel, datentyp: '1', menge: Number(stunden) || 0, einzelpreis: Number(satz) || 0, bezeichnung: 'Arbeitszeit Reparatur' },
      { artikelnummer: 'TEXT', datentyp: '3', menge: 1, bezeichnung: 'TEST Reparaturschein' },
    ],
  );

  async function run(mode) {
    setBusy(mode);
    setOut(null);
    try {
      if (mode === 'preview') {
        setOut({ ok: true, text: xml });
      } else {
        const res = await mesonicImport(TYPES.BELEG, 'WEBAngebot', xml, { actionCode: 0 });
        setOut({ ok: res.success, text: res.error || res.raw || 'OK' });
      }
    } catch (e) {
      setOut({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-orange-200 rounded-lg p-4 bg-orange-50/40">
      <h2 className="text-lg font-bold mb-1 text-orange-800">Reparaturschein-Import-Tester (WEBAngebot)</h2>
      <p className="text-xs text-slate-500 mb-3">
        Belegart {REPARATUR_BELEGART.wolfsberg} (WO) / {REPARATUR_BELEGART.klagenfurt} (KL). Arbeitszeit-Artikel:
        <span className="font-mono"> {arbeitArtikel}</span>. „Validieren" = ActionCode=0, kein Beleg.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <label className="text-xs text-slate-600">Kontonummer
          <input value={konto} onChange={(e) => setKonto(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Laufnummer
          <input value={lauf} onChange={(e) => setLauf(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Standort
          <select value={standort} onChange={(e) => setStandort(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm">
            <option value="wolfsberg">Wolfsberg (Belegart 12)</option>
            <option value="klagenfurt">Klagenfurt (Belegart 16)</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">Vertreternummer
          <input value={vertreter} onChange={(e) => setVertreter(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Arbeitsstunden
          <input value={stunden} onChange={(e) => setStunden(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs text-slate-600">Stundensatz (netto)
          <input value={satz} onChange={(e) => setSatz(e.target.value)} className="w-full mt-0.5 px-2 py-1 border rounded text-sm" />
        </label>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => run('preview')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-white border border-orange-300 text-orange-800 hover:bg-orange-100 disabled:opacity-40">
          XML-Vorschau
        </button>
        <button onClick={() => run('validate')} disabled={!!busy} className="px-3 py-1.5 text-sm rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40">
          {busy === 'validate' ? '…' : 'Validieren (ActionCode=0)'}
        </button>
      </div>
      {out && (
        <pre className={`p-2 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap ${out.ok ? 'bg-slate-900 text-slate-100' : 'bg-rose-900 text-rose-100'}`}>
          {out.text}
        </pre>
      )}
    </div>
  );
}

export default function MesonicTest() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});

  // Map global index
  let globalIdx = 0;
  const sectionIndices = TEST_SECTIONS.map(s => {
    const start = globalIdx;
    globalIdx += s.tests.length;
    return { start, count: s.tests.length };
  });

  async function runTest(idx) {
    setRunning(r => ({ ...r, [idx]: true }));
    setResults(r => ({ ...r, [idx]: null }));
    try {
      const result = await ALL_TESTS[idx].run();
      setResults(r => ({ ...r, [idx]: { ok: true, data: result } }));
    } catch (err) {
      setResults(r => ({ ...r, [idx]: { ok: false, error: err.message } }));
    } finally {
      setRunning(r => ({ ...r, [idx]: false }));
    }
  }

  async function runSection(sectionIdx) {
    const { start, count } = sectionIndices[sectionIdx];
    for (let i = start; i < start + count; i++) {
      await runTest(i);
    }
  }

  async function runAll() {
    for (let i = 0; i < ALL_TESTS.length; i++) {
      await runTest(i);
    }
  }

  let testIdx = 0;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Mesonic API Test</h1>
      <p className="text-gray-500 mb-6">Teste die Verbindung zum Mesonic WinLine MDP WebService</p>

      <button
        onClick={runAll}
        className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Alle Tests ausführen
      </button>

      <div className="space-y-8">
        {TEST_SECTIONS.map((section, sIdx) => (
          <div key={sIdx}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-700">{section.title}</h2>
              <button
                onClick={() => runSection(sIdx)}
                className="px-3 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
              >
                Sektion ausführen
              </button>
            </div>
            <div className="space-y-2">
              {section.tests.map((test, tIdx) => {
                const idx = sectionIndices[sIdx].start + tIdx;
                return (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{test.label}</span>
                      <div className="flex items-center gap-2">
                        {results[idx] && (
                          <span className={`text-sm font-medium ${results[idx].ok ? 'text-green-600' : 'text-red-600'}`}>
                            {results[idx].ok ? '✓ OK' : '✗ Error'}
                          </span>
                        )}
                        <button
                          onClick={() => runTest(idx)}
                          disabled={running[idx]}
                          className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                          {running[idx] ? 'Läuft...' : 'Ausführen'}
                        </button>
                      </div>
                    </div>
                    {results[idx] && (
                      <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-64">
                        {typeof results[idx].data === 'string'
                          ? results[idx].data
                          : JSON.stringify(results[idx].data || results[idx].error, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Interactive article explorer */}
      <div className="mt-10">
        <ArticleExplorer />
      </div>

      {/* KundenArtikel LIST tester */}
      <div className="mt-10">
        <KundenArtikelTester />
      </div>

      {/* Beleg-Export tester (Type 30) */}
      <div className="mt-10">
        <BelegExportTester />
      </div>

      {/* Artikel-Preise tester (Type 5, WEBArtikelPreise) */}
      <div className="mt-10">
        <ArtikelPreiseTester />
      </div>

      {/* Kunden-Belege / Hardware tester (WEBBelege) */}
      <div className="mt-10">
        <KundenBelegeTester />
      </div>

      {/* Angebot-Import tester (WEBAngebot) */}
      <div className="mt-10">
        <AngebotImportTester />
      </div>

      {/* Reparaturschein-Import tester (WEBAngebot, Belegart 12/16) */}
      <div className="mt-10">
        <ReparaturImportTester />
      </div>
    </div>
  );
}
