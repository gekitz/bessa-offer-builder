import { useEffect, useRef, useState } from 'react';
import {
  Search, X, Loader2, Building2, Phone, MapPin, ChevronRight,
  AlertCircle, UserPlus,
} from 'lucide-react';
import { searchCustomers, saveCustomer } from '../../../lib/mesonicApi';

// ═══════════════════════════════════════════════════════
// CustomerResolveDialog — resolve a WinLine Kd.-Nr. for an offer
// ═══════════════════════════════════════════════════════
//
// Opened when an offer needs a Mesonic customer before we can file the CRM
// Aktion (offer link). The user either picks an existing WinLine customer from
// a live search, or creates a new one from the offer's customer fields. On
// resolve, onResolved(kdNr) fires with the account number. Best-effort:
// nothing here throws to the caller — cancel just skips the note.

type MesonicRecord = Record<string, string | undefined>;

export interface ResolveCustomer {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface CustomerResolveDialogProps {
  open: boolean;
  customer: ResolveCustomer;
  offerLabel?: string;
  onResolved: (kdNr: string) => void;
  onCancel: () => void;
}

// ─── Field accessor (mirrors CustomerPicker / CrmPage) ───
function f(record: MesonicRecord, ...keys: string[]): string {
  for (const k of keys) {
    const v = record[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

const F = {
  name: (r: MesonicRecord) => f(r, 'Name', 'Firmenname', 'T055_C003', 'T055.C003'),
  street: (r: MesonicRecord) => f(r, 'Strasse', 'Straße', 'T055_C007', 'T055.C007'),
  zip: (r: MesonicRecord) => f(r, 'Postleitzahl', 'PLZ', 'T055_C008', 'T055.C008'),
  city: (r: MesonicRecord) => f(r, 'Ort', 'Stadt', 'T055_C009', 'T055.C009'),
  phone: (r: MesonicRecord) => f(r, 'Telefon', 'Tel', 'T055_C011', 'T055.C011'),
  number: (r: MesonicRecord) => f(r, 'Kontonummer', 'Kundennummer', 'KontoNr', 'T055_C023', 'T055.C023'),
};

// Parse the WinLine-assigned Kontonummer from a WebKontenImport response.
// WinLine returns the freshly assigned account number in <KeyValue>; the
// response has NO <Kontonummer> element (kept as a legacy fallback).
export function parseAssignedKontonummer(rawXml: string | null | undefined): string | null {
  if (!rawXml) return null;
  const m = String(rawXml).match(/<KeyValue>(.*?)<\/KeyValue>/)
    || String(rawXml).match(/<Kontonummer>(.*?)<\/Kontonummer>/);
  const val = m ? m[1].trim() : '';
  // '+' is the request placeholder, never the assigned number.
  return val && val !== '+' ? val : null;
}

export default function CustomerResolveDialog({
  open, customer, offerLabel, onResolved, onCancel,
}: CustomerResolveDialogProps) {
  const prefill = customer.company || customer.name || '';
  const [query, setQuery] = useState(prefill);
  const [results, setResults] = useState<MesonicRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Run the initial search on open (and reset transient state each open).
  useEffect(() => {
    if (!open) return;
    setQuery(prefill);
    setError(null);
    setCreateError(null);
    inputRef.current?.focus();
    if (prefill.trim().length >= 2) runSearch(prefill);
    else setResults(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function runSearch(term: string) {
    const q = term.trim();
    if (q.length < 2) { setResults(null); setError(null); return; }
    setLoading(true);
    setError(null);
    searchCustomers(q)
      .then((data: { records?: MesonicRecord[] }) => setResults(data?.records || []))
      .catch((err: Error) => { setError(err.message); setResults([]); })
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = (await saveCustomer(
        {
          Name: customer.company || customer.name || '',
          'E-Mail': customer.email || '',
          Telefon: customer.phone || '',
          Strasse: customer.address || '',
        },
        { actionCode: 1 },
      )) as { success?: boolean; error?: string; raw?: string; kundennummer?: string | null };
      if (!res?.success) {
        setCreateError(res?.error || 'Anlegen fehlgeschlagen.');
        return;
      }
      const kdNr = res.kundennummer || parseAssignedKontonummer(res.raw);
      if (!kdNr) {
        setCreateError('Kunde angelegt, aber keine Kd.-Nr. erhalten.');
        return;
      }
      onResolved(kdNr);
    } catch (err) {
      setCreateError((err as Error)?.message || 'Anlegen fehlgeschlagen.');
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl mt-16 w-full max-w-lg max-h-[75vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>
              WinLine-Kunde zuordnen
            </span>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
          <p className="text-slate-500 mb-3" style={{ fontSize: 12 }}>
            {offerLabel
              ? `Angebot „${offerLabel}“ einem WinLine-Konto zuordnen, um die CRM-Notiz zu hinterlegen.`
              : 'Kunde einem WinLine-Konto zuordnen, um die CRM-Notiz zu hinterlegen.'}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(query); }}
                placeholder="Name, Ort oder Kundennummer..."
                className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 animate-spin" />}
            </div>
            <button
              onClick={() => runSearch(query)}
              className="rounded-lg bg-slate-800 text-white px-4 text-sm font-medium hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              Suchen
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto px-3 py-2">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 border border-red-200 m-2" style={{ fontSize: 12 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {results === null && !loading && !error && (
            <div className="text-center py-8 text-slate-400" style={{ fontSize: 13 }}>
              Kundennamen oder Ort eingeben (min. 2 Zeichen)
            </div>
          )}

          {results && results.length === 0 && !loading && (
            <div className="text-center py-8 text-slate-400" style={{ fontSize: 13 }}>
              Kein Kunde gefunden
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-1">
              {results.map((record, idx) => {
                const name = F.name(record) || 'Unbekannt';
                const number = F.number(record);
                const street = F.street(record);
                const zip = F.zip(record);
                const city = F.city(record);
                const phone = F.phone(record);
                const address = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

                return (
                  <div
                    key={number || idx}
                    className="w-full rounded-lg p-3 hover:bg-red-50 transition-colors group flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-800 truncate" style={{ fontSize: 13 }}>{name}</span>
                        {number && <span className="text-slate-400 flex-shrink-0" style={{ fontSize: 10 }}>#{number}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 ml-5">
                        {address && (
                          <span className="text-slate-500 truncate" style={{ fontSize: 11 }}>
                            <MapPin size={10} className="inline mr-0.5" />{address}
                          </span>
                        )}
                        {phone && (
                          <span className="text-slate-500 flex-shrink-0" style={{ fontSize: 11 }}>
                            <Phone size={10} className="inline mr-0.5" />{phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => number && onResolved(number)}
                      disabled={!number}
                      className="flex items-center gap-1 rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-500 transition-colors flex-shrink-0 disabled:opacity-40"
                    >
                      Auswählen <ChevronRight size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — create + cancel */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
          >
            Abbrechen
          </button>
          <div className="flex flex-col items-end gap-1">
            {createError && (
              <span className="text-red-600" style={{ fontSize: 11 }}>{createError}</span>
            )}
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Neu in WinLine anlegen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
