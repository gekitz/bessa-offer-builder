import { useState, useRef } from 'react';
import { ping, mesonicExport, mesonicExportRaw, mesonicImport, searchArticles, getArticle, TYPES, TEMPLATES } from '../lib/mesonicApi';

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
    ],
  },
  {
    title: 'Artikel (Type 4)',
    tests: [
      {
        label: '11. Single article (1) — erster Artikel',
        run: () => mesonicExport(TYPES.ARTICLE, TEMPLATES.ARTICLE_DETAIL, '1'),
      },
      {
        label: '12. WHERE search — Artikel "bessa"',
        run: () => searchArticles('bessa'),
      },
      {
        label: '13. Raw XML — erster Artikel',
        run: () => mesonicExportRaw(TYPES.ARTICLE, TEMPLATES.ARTICLE_DETAIL, '1'),
      },
      {
        label: '14. WHERE search — "Kassa"',
        run: () => searchArticles('Kassa'),
      },
      {
        label: '15. WHERE search — "Mobil"',
        run: () => searchArticles('Mobil'),
      },
      {
        label: '16. WHERE search — "Sunmi"',
        run: () => searchArticles('Sunmi'),
      },
    ],
  },
  {
    title: 'Preise (Type 5)',
    tests: [
      {
        label: '17. Price export — Artikel 1',
        run: () => mesonicExport(TYPES.PRICE, TEMPLATES.PRICE_EXPORT, '1'),
      },
      {
        label: '18. Raw XML — Price Artikel 1',
        run: () => mesonicExportRaw(TYPES.PRICE, TEMPLATES.PRICE_EXPORT, '1'),
      },
      {
        label: '19. Price export — alle Preise',
        run: () => mesonicExport(TYPES.PRICE, TEMPLATES.PRICE_EXPORT, "where T024.C003 <> ''"),
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
    </div>
  );
}
