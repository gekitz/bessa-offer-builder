import { useState } from 'react';
import { ping, mesonicExport, mesonicExportRaw, mesonicImport, TYPES, TEMPLATES } from '../lib/mesonicApi';

// Helper: call proxy with import_debug action (doesn't actually send to Mesonic)
async function importDebug(type, template, xmlData, actionCode = 1) {
  // Use proxyRequest-like call but with action=import_debug
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

const TESTS = [
  {
    label: '1. Ping (session check)',
    run: () => ping(),
  },
  {
    label: '2. Single customer (29385)',
    run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, '29385'),
  },
  {
    label: '3. WHERE search (ALTHOFEN)',
    run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, "where T055.C003 LIKE '%%ALTHOFEN%%'"),
  },
  {
    label: '4. Wildcard (*)',
    run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, '*'),
  },
  {
    label: '5. Range (29385++29400)',
    run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, '29385++29400'),
  },
  {
    label: '6. WHERE on city (KLAGENFURT)',
    run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, "where T055.C003 LIKE '%%KLAGENFURT%%'"),
  },
  {
    label: '7. Liste template (*)',
    run: () => mesonicExport(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_LIST, '*'),
  },
  {
    label: '8. Raw XML — WHERE ALTHOFEN',
    run: () => mesonicExportRaw(TYPES.CUSTOMER, TEMPLATES.CUSTOMER_DETAIL, "where T055.C003 LIKE '%%ALTHOFEN%%'"),
  },
  {
    label: '9. Import DEBUG — Testkunde (Dry Run, wird NICHT gesendet)',
    run: () => importDebug(
      TYPES.CUSTOMER,
      TEMPLATES.CUSTOMER_IMPORT,
      '<WebKontenImport>\n  <Name>Testfirma Debug GmbH</Name>\n  <Ort>Klagenfurt</Ort>\n  <Strasse>Testgasse 1</Strasse>\n  <Postleitzahl>9020</Postleitzahl>\n</WebKontenImport>',
      1
    ),
  },
  {
    label: '10. Import LIVE — Testkunde validate only (ActionCode=0)',
    run: () => mesonicImport(
      TYPES.CUSTOMER,
      TEMPLATES.CUSTOMER_IMPORT,
      '<WebKontenImport>\n  <Name>Testfirma Validate GmbH</Name>\n  <Ort>Klagenfurt</Ort>\n  <Strasse>Testgasse 1</Strasse>\n  <Postleitzahl>9020</Postleitzahl>\n</WebKontenImport>',
      { actionCode: 0 }
    ),
  },
];

export default function MesonicTest() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});

  async function runTest(idx) {
    setRunning(r => ({ ...r, [idx]: true }));
    setResults(r => ({ ...r, [idx]: null }));
    try {
      const result = await TESTS[idx].run();
      setResults(r => ({ ...r, [idx]: { ok: true, data: result } }));
    } catch (err) {
      setResults(r => ({ ...r, [idx]: { ok: false, error: err.message } }));
    } finally {
      setRunning(r => ({ ...r, [idx]: false }));
    }
  }

  async function runAll() {
    for (let i = 0; i < TESTS.length; i++) {
      await runTest(i);
    }
  }

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

      <div className="space-y-4">
        {TESTS.map((test, idx) => (
          <div key={idx} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{test.label}</span>
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
        ))}
      </div>
    </div>
  );
}
