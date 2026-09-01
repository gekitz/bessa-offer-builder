import { useState } from 'react';
import { Loader2, Mail, Phone, Download, RefreshCw } from 'lucide-react';
import { fetchContacts, contactDisplayName } from '../lib/mesonicContacts';

// Ansprechpartner eines Kontos (Mesonic Type 7, WEBKontakte). Auf Abruf —
// ein Export-Call liefert alle Kontakte des Kunden (wenige), daher ohne
// Cache/Pagination. Keyed by Kontonummer, überall wiederverwendbar.
export default function ContactsPanel({ kdnr }) {
  const [contacts, setContacts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setContacts(await fetchContacts(kdnr));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ansprechpartner</span>
        {contacts !== null && !loading && (
          <button onClick={load} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : contacts === null ? (
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          <Download className="w-3.5 h-3.5" /> Ansprechpartner laden
        </button>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-slate-400">Keine Ansprechpartner in Mesonic.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c, i) => (
            <li key={i} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-sm font-medium text-slate-800">
                {contactDisplayName(c)}
                {c.abteilung && <span className="ml-1 font-normal text-slate-400">· {c.abteilung}</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-red-600 hover:underline">
                    <Mail className="w-3 h-3" /> {c.email}
                  </a>
                )}
                {c.mobil && (
                  <a href={`tel:${c.mobil.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-slate-600 hover:underline">
                    <Phone className="w-3 h-3" /> {c.mobil}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
